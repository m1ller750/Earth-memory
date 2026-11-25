import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { apiError, limitOrReject } from "@/lib/security/request";
import { findNode, neighborhood } from "@/server/graph";

/** GET /api/v1/graph?node=<type>:<slug>&depth=1..3&proposed=0|1: knowledge-graph neighbourhood with evidence on every link. */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const sp = request.nextUrl.searchParams;
  const ref = sp.get("node");
  if (!ref) return apiError(400, "validation_error", "Pass node=<type>:<slug>, e.g. entity:silk-road or language:yaghnobi.");
  const root = await findNode(ref);
  if (!root) return apiError(404, "not_found", "Unknown node.");
  const depth = Math.min(3, Math.max(1, Number(sp.get("depth")) || 1));
  const graph = await neighborhood(root, await getViewer(), { depth, includeProposed: sp.get("proposed") === "1", maxNodes: 80 });
  return NextResponse.json({
    root: `${root.type}:${root.id}`,
    nodes: graph.nodes.map((n) => ({ key: n.key, type: n.type, label: n.label, subtype: n.subtype ?? null, path: n.href })),
    links: graph.links.map((l) => ({ source: l.source, target: l.target, relation: l.relation, uncertainty: l.uncertainty, provenance: l.provenance, status: l.status, evidence: l.evidence.map((e) => e.detail), citation: l.citation })),
  });
}
