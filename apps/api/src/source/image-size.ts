import type { SupportedImageType } from "./types.js";

/**
 * Probe pixel dimensions from an image buffer header. Pure-JS, no
 * dependencies. Returns {0, 0} if we can't decode the header (the
 * frontend doesn't render dimensions anywhere — the field is purely
 * informational).
 */
export function readImageSize(
  buf: Buffer,
  mediaType: SupportedImageType,
): { width: number; height: number } {
  switch (mediaType) {
    case "image/png":
      return readPng(buf);
    case "image/jpeg":
      return readJpeg(buf);
    case "image/webp":
      return readWebp(buf);
    case "image/gif":
      return readGif(buf);
  }
}

/**
 * PNG: 8-byte signature, then chunks. IHDR is the first chunk.
 * IHDR data starts at byte 16: width (u32 BE), height (u32 BE).
 */
function readPng(buf: Buffer): { width: number; height: number } {
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return { width: 0, height: 0 };
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * JPEG: walk SOI marker (FFD8), then segments. SOFn markers
 * (FFC0..FFCF except FFC4/FFC8/FFCC) hold dimensions:
 *   marker (2) + length (2) + precision (1) + height u16 BE + width u16 BE
 */
function readJpeg(buf: Buffer): { width: number; height: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { width: 0, height: 0 };
  }
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    // Skip padding bytes.
    while (i < buf.length && buf[i] === 0xff) i += 1;
    if (i >= buf.length) break;
    const marker = buf[i];
    i += 1;
    // SOFn (Start of Frame): 0xC0..0xCF except 0xC4 (DHT), 0xC8 (JPG), 0xCC (DAC)
    if (
      marker !== undefined &&
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      if (i + 7 > buf.length) return { width: 0, height: 0 };
      // i now points to length.
      const height = buf.readUInt16BE(i + 3);
      const width = buf.readUInt16BE(i + 5);
      return { width, height };
    }
    // Standalone markers (no payload): SOI (D8), EOI (D9), TEM (01), RSTn (D0..D7)
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    // Otherwise: length-prefixed segment.
    if (i + 2 > buf.length) break;
    const len = buf.readUInt16BE(i);
    i += len;
  }
  return { width: 0, height: 0 };
}

/**
 * WebP: 'RIFF'____'WEBP' then a chunk. Three forms:
 *   VP8  (lossy, simple): width/height at offset 26 (u16 LE, low 14 bits)
 *   VP8L (lossless):      width/height packed at offset 21
 *   VP8X (extended):      width-1 / height-1 at offset 24 (u24 LE)
 */
function readWebp(buf: Buffer): { width: number; height: number } {
  if (
    buf.length < 30 ||
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return { width: 0, height: 0 };
  }
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === "VP8L") {
    const b0 = buf[21] ?? 0;
    const b1 = buf[22] ?? 0;
    const b2 = buf[23] ?? 0;
    const b3 = buf[24] ?? 0;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + ((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6);
    return { width, height };
  }
  if (chunk === "VP8X") {
    const width =
      1 + ((buf[24] ?? 0) | ((buf[25] ?? 0) << 8) | ((buf[26] ?? 0) << 16));
    const height =
      1 + ((buf[27] ?? 0) | ((buf[28] ?? 0) << 8) | ((buf[29] ?? 0) << 16));
    return { width, height };
  }
  return { width: 0, height: 0 };
}

/**
 * GIF: 'GIF87a' / 'GIF89a' then width (u16 LE) + height (u16 LE).
 */
function readGif(buf: Buffer): { width: number; height: number } {
  if (
    buf.length < 10 ||
    buf.toString("ascii", 0, 3) !== "GIF" ||
    !["87a", "89a"].includes(buf.toString("ascii", 3, 6))
  ) {
    return { width: 0, height: 0 };
  }
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}
