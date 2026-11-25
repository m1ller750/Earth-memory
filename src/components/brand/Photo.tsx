/* eslint-disable @next/next/no-img-element -- remote Commons thumbnails are already sized; next/image would proxy them */
import type { RemoteImage } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/** "Photo: Author · CC BY-SA 4.0 via Wikimedia Commons", linking to the file page and the licence. */
export function PhotoCredit({ image, t, className }: { image: RemoteImage; t: Dictionary; className?: string }) {
  return (
    <p className={cn("text-[11px] leading-snug text-mist-400", className)}>
      {t.common.photo}:{" "}
      <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-mist-100 hover:underline">
        {image.author}
      </a>
      {" · "}
      {image.licenseUrl ? (
        <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer license" className="hover:text-mist-100 hover:underline">
          {image.license}
        </a>
      ) : (
        image.license
      )}{" "}
      {t.common.photoVia}
    </p>
  );
}

/** A photo with its credit underneath, for detail pages. */
export function PhotoFigure({ image, alt, t, className }: { image: RemoteImage; alt: string; t: Dictionary; className?: string }) {
  return (
    <figure className={cn("panel overflow-hidden", className)}>
      <img src={image.url} alt={alt} width={image.width} height={image.height} loading="lazy" className="max-h-[460px] w-full object-cover" />
      <figcaption className="px-4 py-2.5">
        <PhotoCredit image={image} t={t} />
      </figcaption>
    </figure>
  );
}
