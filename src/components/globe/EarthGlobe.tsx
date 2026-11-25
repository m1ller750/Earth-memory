"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { GlobeArc, GlobePoint, GlobeRing } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any -- globe.gl accessors receive untyped layer objects */

export interface EarthGlobeProps {
  points: GlobePoint[];
  rings?: GlobeRing[];
  arcs?: GlobeArc[];
  countryCounts?: Record<string, number>;
  selectedCountry?: string | null;
  focus?: { lat: number; lng: number; altitude?: number; key?: string | number } | null;
  autoRotate?: boolean;
  interactive?: boolean;
  initialView?: { lat: number; lng: number; altitude: number };
  onPointSelect?: (point: GlobePoint) => void;
  onCountrySelect?: (code: string) => void;
  onRingSelect?: (ring: GlobeRing) => void;
  onGlobeClick?: (coords: { lat: number; lng: number }) => void;
  onUnsupported?: () => void;
  className?: string;
  loadingLabel?: string;
}

const POINT_RADIUS: Record<GlobePoint["layer"], number> = {
  record: 0.34,
  language: 0.42,
  species: 0.38,
  ecosystem: 0.55,
  project: 0.22,
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function EarthGlobe({
  points,
  rings = [],
  arcs = [],
  countryCounts = {},
  selectedCountry = null,
  focus = null,
  autoRotate = true,
  interactive = true,
  initialView = { lat: 32, lng: 58, altitude: 2.25 },
  onPointSelect,
  onCountrySelect,
  onRingSelect,
  onGlobeClick,
  onUnsupported,
  className,
  loadingLabel = "Loading globe…",
}: EarthGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);
  const handlers = useRef({ onPointSelect, onCountrySelect, onRingSelect, onGlobeClick });
  handlers.current = { onPointSelect, onCountrySelect, onRingSelect, onGlobeClick };
  const countryState = useRef({ countryCounts, selectedCountry });
  countryState.current = { countryCounts, selectedCountry };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the globe once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let visibilityObserver: IntersectionObserver | null = null;
    let idleTimer: number | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!supportsWebGL()) {
      setFailed(true);
      onUnsupported?.();
      return;
    }

    (async () => {
      try {
        const [{ default: Globe }, THREE, topojson, h3, response] = await Promise.all([
          import("globe.gl"),
          import("three"),
          import("topojson-client"),
          import("h3-js"),
          fetch("/geo/countries-110m.json"),
        ]);
        const topology = await response.json();
        if (disposed) return;
        // Land is drawn as H3 hexagon dots. A shape the polyfill rejects (Antarctica covers the
        // pole; a few others fail at some resolutions) would abort the whole layer, so each shape
        // is checked first and skipped if needed.
        const skipped: string[] = [];
        const features = ((topojson.feature(topology, topology.objects.countries) as any).features as any[]).filter((f) => {
          if (f.properties?.code === "AQ") return false;
          try {
            const g = f.geometry;
            const polygons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
            for (const polygon of polygons) h3.polygonToCells(polygon, 3, true);
            return true;
          } catch {
            skipped.push(String(f.properties?.name ?? f.properties?.code ?? "?"));
            return false;
          }
        });
        if (skipped.length) console.warn(`[earth-memory] land shapes skipped on the globe: ${skipped.join(", ")}`);
        const small = el.clientWidth < 640;

        const globe = new Globe(el, {
          rendererConfig: { antialias: !small, alpha: true, powerPreference: "high-performance" },
          animateIn: !reducedMotion,
        })
          .width(el.clientWidth)
          .height(el.clientHeight)
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereColor("#38d5f5")
          .atmosphereAltitude(0.17)
          .globeMaterial(
            new THREE.MeshPhongMaterial({
              color: new THREE.Color("#0b1b33"),
              emissive: new THREE.Color("#030a17"),
              specular: new THREE.Color("#1d4363"),
              shininess: 14,
            }),
          )
          .hexPolygonsData(features)
          // Resolution 3 works for every Natural Earth 110m shape; resolution 2 fails on some (e.g. North Korea).
          .hexPolygonResolution(3)
          .hexPolygonMargin(0.32)
          .hexPolygonUseDots(true)
          .hexPolygonAltitude(0.004)
          .hexPolygonColor((f: any) => {
            const { countryCounts: counts, selectedCountry: selected } = countryState.current;
            const code = f.properties?.code as string | null;
            if (code && code === selected) return "rgba(56,213,245,0.95)";
            const n = code ? (counts[code] ?? 0) : 0;
            if (n > 0) return `rgba(62,230,168,${Math.min(0.92, 0.42 + n * 0.07).toFixed(2)})`;
            return "rgba(140,165,200,0.26)";
          })
          .hexPolygonLabel((f: any) => `<div class="em-tip"><strong>${escapeHtml(String(f.properties?.name ?? ""))}</strong></div>`)
          .onHexPolygonClick((f: any, _event: MouseEvent, coords: { lat: number; lng: number }) => {
            if (handlers.current.onGlobeClick) {
              handlers.current.onGlobeClick({ lat: coords.lat, lng: coords.lng });
              return;
            }
            const code = f.properties?.code;
            if (code) handlers.current.onCountrySelect?.(code);
          })
          .onGlobeClick((coords: { lat: number; lng: number }) => handlers.current.onGlobeClick?.(coords))
          .pointLat("lat")
          .pointLng("lng")
          .pointColor("color")
          .pointAltitude(0.012)
          .pointRadius((p: any) => POINT_RADIUS[(p as GlobePoint).layer])
          .pointResolution(small ? 6 : 10)
          .pointLabel((p: any) => {
            const point = p as GlobePoint;
            return `<div class="em-tip"><span class="em-tip-dot" style="background:${escapeHtml(point.color)}"></span><strong>${escapeHtml(point.title)}</strong>${point.subtitle ? `<span>${escapeHtml(point.subtitle)}</span>` : ""}</div>`;
          })
          .onPointClick((p: any) => handlers.current.onPointSelect?.(p as GlobePoint))
          .ringLat("lat")
          .ringLng("lng")
          .ringColor((r: any) => (t: number) => hexToRgba((r as GlobeRing).color, Math.max(0, 1 - t)))
          .ringMaxRadius(3.2)
          .ringPropagationSpeed(reducedMotion ? 0 : 1.1)
          .ringRepeatPeriod(1700)
          .arcStartLat("startLat")
          .arcStartLng("startLng")
          .arcEndLat("endLat")
          .arcEndLng("endLng")
          .arcColor("colors")
          .arcStroke(0.42)
          .arcAltitudeAutoScale(0.38)
          .arcDashLength(0.42)
          .arcDashGap(0.18)
          .arcDashAnimateTime(reducedMotion ? 0 : 3200)
          .arcLabel((a: any) => `<div class="em-tip"><span>${escapeHtml((a as GlobeArc).label)}</span></div>`)
          .pointOfView(initialView, 0);

        const controls = globe.controls();
        controls.autoRotate = autoRotate && !reducedMotion;
        controls.autoRotateSpeed = 0.32;
        controls.enableZoom = interactive;
        controls.enablePan = false;
        controls.minDistance = 130;
        controls.maxDistance = 520;
        controls.addEventListener("start", () => {
          controls.autoRotate = false;
          window.clearTimeout(idleTimer);
        });
        controls.addEventListener("end", () => {
          window.clearTimeout(idleTimer);
          if (autoRotate && !reducedMotion) idleTimer = window.setTimeout(() => (controls.autoRotate = true), 9000);
        });

        resizeObserver = new ResizeObserver(() => globe.width(el.clientWidth).height(el.clientHeight));
        resizeObserver.observe(el);
        visibilityObserver = new IntersectionObserver(([entry]) => (entry.isIntersecting ? globe.resumeAnimation() : globe.pauseAnimation()), { threshold: 0.01 });
        visibilityObserver.observe(el);

        globeRef.current = globe;
        setReady(true);
      } catch (error) {
        console.error("[earth-memory] globe failed to initialise", error);
        if (!disposed) {
          setFailed(true);
          onUnsupported?.();
        }
      }
    })();

    return () => {
      disposed = true;
      window.clearTimeout(idleTimer);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      const globe = globeRef.current;
      globeRef.current = null;
      if (globe) {
        globe.pauseAnimation?.();
        globe.renderer?.()?.dispose?.();
        globe._destructor?.();
      }
      el.replaceChildren();
    };
    // The globe is created once; props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) globeRef.current?.pointsData(points);
  }, [ready, points]);

  useEffect(() => {
    if (ready) globeRef.current?.ringsData(rings);
  }, [ready, rings]);

  useEffect(() => {
    if (ready) globeRef.current?.arcsData(arcs);
  }, [ready, arcs]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe) return;
    // Re-assigning the accessor makes three-globe recolour the land hexes.
    globe.hexPolygonColor(globe.hexPolygonColor());
  }, [ready, countryCounts, selectedCountry]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!ready || !globe || !focus) return;
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.6 }, 1400);
  }, [ready, focus]);

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="absolute inset-0 [&_canvas]:outline-none" />
      {!ready && !failed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="polite">
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-24 w-24">
              <div className="absolute inset-0 rounded-full border border-aurora-cyan/20" />
              <div className="absolute inset-0 animate-spin-slow rounded-full border-t border-aurora-emerald/70" />
              <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_35%_30%,#16233a,#050a13)]" />
            </div>
            <p className="eyebrow">{loadingLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}
