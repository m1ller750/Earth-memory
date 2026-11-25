/**
 * File type detection from magic bytes. The declared Content-Type and file extension of
 * an upload are never trusted. Only these types are accepted.
 */
export type MediaKind = "image" | "audio" | "video" | "document";

export interface SniffResult {
  mime: string;
  ext: string;
  kind: MediaKind;
}

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Uint8Array, offset: number, length: number) => String.fromCharCode(...buf.subarray(offset, offset + length));

export function sniffFileType(buf: Uint8Array): SniffResult | null {
  if (buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "image" };
  if (ascii(buf, 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif", kind: "image" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WEBP") return { mime: "image/webp", ext: "webp", kind: "image" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 4) === "WAVE") return { mime: "audio/wav", ext: "wav", kind: "audio" };
  if (ascii(buf, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg", kind: "audio" };
  if (ascii(buf, 0, 4) === "fLaC") return { mime: "audio/flac", ext: "flac", kind: "audio" };
  if (ascii(buf, 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3", kind: "audio" };
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: "video/webm", ext: "webm", kind: "video" };
  if (ascii(buf, 4, 4) === "ftyp") {
    const brand = ascii(buf, 8, 4);
    if (brand.startsWith("M4A") || brand === "M4B ") return { mime: "audio/mp4", ext: "m4a", kind: "audio" };
    return { mime: "video/mp4", ext: "mp4", kind: "video" };
  }
  if (ascii(buf, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", kind: "document" };
  return null;
}

/** Reads pixel dimensions from PNG, GIF, JPEG and WebP headers without decoding the image. */
export function imageDimensions(buf: Uint8Array, mime: string): { width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  try {
    if (mime === "image/png") return { width: view.getUint32(16), height: view.getUint32(20) };
    if (mime === "image/gif") return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (mime === "image/webp") {
      const chunk = ascii(buf, 12, 4);
      if (chunk === "VP8X") return { width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
      if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (mime === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) return null;
        const marker = buf[offset + 1];
        const length = view.getUint16(offset + 2);
        // SOF0–SOF15, excluding DHT (C4), JPG (C8) and DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Removes EXIF (APP1) segments from a JPEG so stored photos do not carry the
 * photographer's GPS position, camera serial numbers or other personal metadata.
 */
export function stripJpegExif(buf: Uint8Array): Uint8Array {
  if (!startsWith(buf, [0xff, 0xd8])) return buf;
  const parts: Uint8Array[] = [buf.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buf.length && buf[offset] === 0xff) {
    const marker = buf[offset + 1];
    if (marker === 0xda) break; // start of scan: the rest is image data
    const length = (buf[offset + 2] << 8) | buf[offset + 3];
    const end = offset + 2 + length;
    if (end > buf.length) return buf;
    if (marker !== 0xe1) parts.push(buf.subarray(offset, end));
    offset = end;
  }
  parts.push(buf.subarray(offset));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
