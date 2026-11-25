import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { can } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { media, records } from "@/lib/db/schema";
import { apiError, isSameOrigin, limitOrReject } from "@/lib/security/request";
import { saveObject } from "@/lib/storage/local";
import { imageDimensions, sniffFileType, stripJpegExif } from "@/lib/storage/sniff";

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;

/**
 * POST /api/v1/media (multipart: file, caption?). Stores an upload for a contribution or
 * a pronunciation. Returns the media id, or the existing record when the exact same file
 * is already in the archive.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Cross-site request rejected.");
  const viewer = await getViewer();
  if (!viewer || !(can(viewer, "record:create") || can(viewer, "lexicon:create"))) return apiError(401, "unauthorized", "Sign in to upload files.");
  const limited = await limitOrReject("upload", viewer.id);
  if (limited) return limited;

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES + 1024 * 64) return apiError(413, "too_large", `Files must be at most ${MAX_BYTES / 1024 / 1024} MB.`);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError(400, "validation_error", "Attach a file in the 'file' field.");
  if (file.size === 0 || file.size > MAX_BYTES) return apiError(413, "too_large", `Files must be at most ${MAX_BYTES / 1024 / 1024} MB.`);

  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const type = sniffFileType(bytes);
  if (!type) return apiError(415, "unsupported_type", "Supported files: JPEG, PNG, GIF, WebP, MP3, WAV, OGG, FLAC, M4A, MP4, WebM and PDF.");
  if (type.mime === "image/jpeg") bytes = stripJpegExif(bytes);

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const db = await getDb();
  const [existing] = await db
    .select({ id: media.id, recordId: media.recordId, uploadedBy: media.uploadedBy, slug: records.slug, title: records.title, visibility: records.visibility })
    .from(media)
    .leftJoin(records, eq(records.id, media.recordId))
    .where(eq(media.sha256, sha256))
    .limit(1);
  if (existing) {
    if (existing.recordId && existing.visibility === "public") {
      return NextResponse.json({ duplicate: true, mediaId: null, record: { slug: existing.slug, title: existing.title } }, { status: 200 });
    }
    if (!existing.recordId && existing.uploadedBy === viewer.id) {
      return NextResponse.json({ duplicate: false, mediaId: existing.id, kind: type.kind, mime: type.mime });
    }
  }

  const caption = String(form?.get("caption") ?? "").slice(0, 300);
  const dims = type.kind === "image" ? imageDimensions(bytes, type.mime) : null;
  const storageKey = await saveObject(bytes, type.ext);
  const [row] = await db
    .insert(media)
    .values({
      kind: type.kind,
      storageKey,
      mime: type.mime,
      sizeBytes: bytes.byteLength,
      sha256,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      originalName: file.name.replace(/[\\/]/g, "_").slice(0, 200),
      caption,
      uploadedBy: viewer.id,
    })
    .returning({ id: media.id });
  await audit(db, viewer, { action: "media.upload", subjectType: "media", subjectId: row.id, details: { mime: type.mime, bytes: bytes.byteLength } });
  return NextResponse.json({ duplicate: false, mediaId: row.id, kind: type.kind, mime: type.mime, width: dims?.width ?? null, height: dims?.height ?? null }, { status: 201 });
}
