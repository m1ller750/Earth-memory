import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { canViewRecord } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { media, records } from "@/lib/db/schema";
import { apiError } from "@/lib/security/request";
import { objectStat, readObject } from "@/lib/storage/local";

/**
 * GET /api/v1/media/{id}: serves a stored file after checking that the viewer may see the
 * record it belongs to. Supports byte ranges for audio and video seeking.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/v1/media/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return apiError(404, "not_found", "Not found.");
  const db = await getDb();
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) return apiError(404, "not_found", "Not found.");

  const viewer = await getViewer();
  if (row.recordId) {
    const [record] = await db.select().from(records).where(eq(records.id, row.recordId)).limit(1);
    if (!record || !canViewRecord(viewer, record)) return apiError(404, "not_found", "Not found.");
  } else if (!row.lexiconEntryId && row.uploadedBy !== viewer?.id) {
    // Files not yet attached to anything are visible only to the person who uploaded them.
    return apiError(404, "not_found", "Not found.");
  }

  const stat = objectStat(row.storageKey);
  if (!stat) return apiError(404, "not_found", "File missing from storage.");
  const headers = new Headers({
    "Content-Type": row.mime,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${row.kind === "document" ? "attachment" : "inline"}; filename="${encodeURIComponent(row.originalName || `earth-memory.${row.storageKey.split(".").pop()}`)}"`,
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });

  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(readObject(row.storageKey, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(stat.size));
  return new Response(Readable.toWeb(readObject(row.storageKey)) as ReadableStream, { status: 200, headers });
}
