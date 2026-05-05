import fs from "node:fs/promises";
import path from "node:path";
import { renderPdfPages, type RenderProgress } from "../pdf/render.js";
import { readImageSize } from "./image-size.js";
import { isSupportedImageType, type SourcePage } from "./types.js";

export interface PrepareInput {
  /** Original filename — used for fallback type detection. */
  filename: string;
  /** Path to the file on disk. */
  filePath: string;
  /** MIME type from the upload (multer fills this from the browser). */
  mimeType: string;
}

/**
 * Turn an uploaded file into one or more SourcePages ready for the LLM.
 *
 *  - PDFs are rendered to PNGs at the configured DPI.
 *  - Images (PNG / JPEG / WebP / GIF) are passed through as a single
 *    SourcePage, preserving the original media type so we don't lose
 *    quality to a transcode round trip.
 *
 * Throws a user-friendly error if the file type isn't supported.
 */
export async function prepareSource(
  input: PrepareInput,
  pdfRenderDpi: number,
  progress: RenderProgress = {},
): Promise<SourcePage[]> {
  const detected = detectMediaType(input);

  if (detected === "application/pdf") {
    return renderPdfPages(input.filePath, pdfRenderDpi, progress);
  }

  if (isSupportedImageType(detected)) {
    const buf = await fs.readFile(input.filePath);
    const { width, height } = readImageSize(buf, detected);
    return [
      {
        index: 0,
        image: buf,
        mediaType: detected,
        width,
        height,
      },
    ];
  }

  throw new Error(
    `Unsupported file type: ${detected || "unknown"} (filename: ${input.filename}). Accepted: PDF, PNG, JPEG, WebP, GIF.`,
  );
}

/**
 * Pick a media type. Prefer the multer-supplied mime; fall back to
 * the filename extension; final fallback is "" so the caller errors
 * cleanly. Both Anthropic and Gemini accept the same image set.
 */
export function detectMediaType(input: PrepareInput): string {
  const mt = input.mimeType?.trim().toLowerCase();
  if (mt && mt !== "application/octet-stream") {
    if (mt === "image/jpg") return "image/jpeg";
    return mt;
  }
  const ext = path.extname(input.filename).toLowerCase();
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "";
  }
}

export const ACCEPTED_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
