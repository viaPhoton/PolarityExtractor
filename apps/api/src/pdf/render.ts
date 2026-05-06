// MUST be the first import: attaches DOMMatrix to globalThis before
// pdfjs-dist (loaded by pdf-to-img below) initialises its own partial
// shim. See ./polyfills.ts for the full story.
import "./polyfills.js";
import { pdf } from "pdf-to-img";
import { readImageSize } from "../source/image-size.js";
import type { SourcePage } from "../source/types.js";
import { createLogger, formatBytes, formatMs } from "../log.js";

const log = createLogger("pdf");

export interface RenderProgress {
  /** Total page count. Reported once, before any pages are rendered. */
  onTotal?: (total: number) => void;
  /** Fired after each page is rendered. `rendered` is 1-indexed. */
  onPage?: (rendered: number, total: number) => void;
}

/**
 * Render every page of a PDF to a PNG buffer wrapped as a SourcePage.
 * The library uses pdf.js + sharp under the hood (pure Node, no system deps).
 *
 * `dpi` controls the rendered resolution; the library expresses this as
 * a `scale` multiplier where 1.0 ≈ 96 DPI.
 *
 * Optional `progress` callbacks let callers (e.g. the upload route)
 * stream rendering progress to the session so the UI loading screen
 * can show "page 3 of 7".
 */
export async function renderPdfPages(
  pdfPath: string,
  dpi: number,
  progress: RenderProgress = {},
): Promise<SourcePage[]> {
  const scale = dpi / 96;
  const startedAt = Date.now();
  log.info("opening pdf", { path: pdfPath, dpi, scale: scale.toFixed(2) });

  const document = await pdf(pdfPath, { scale });

  const total = document.length;
  progress.onTotal?.(total);
  log.info("rendering pages", { pages: total, dpi });

  const pages: SourcePage[] = [];
  let index = 0;
  for await (const png of document) {
    const { width, height } = readImageSize(png, "image/png");
    pages.push({
      index,
      image: png,
      mediaType: "image/png",
      width,
      height,
    });
    index += 1;
    progress.onPage?.(index, total);
    log.debug("page rendered", {
      page: `${index}/${total}`,
      size: `${width}x${height}`,
      bytes: formatBytes(png.byteLength),
    });
  }

  const totalBytes = pages.reduce((acc, p) => acc + p.image.byteLength, 0);
  log.info("pdf rendered", {
    pages: total,
    bytes: formatBytes(totalBytes),
    took: formatMs(Date.now() - startedAt),
  });
  return pages;
}
