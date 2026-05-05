/**
 * Browser globals required by pdfjs-dist v4 that Node 20 doesn't ship.
 *
 * `pdf-to-img` boots pdfjs-dist with a partial in-house shim and prints
 *   Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.
 *   Warning: Cannot polyfill `Path2D`, rendering may be broken.
 * on startup. The shim is enough for simple drawings but throws
 * `ReferenceError: DOMMatrix is not defined` the moment pdf.js evaluates
 * a content stream that uses affine transforms (rotations, scales,
 * shears) — which complex engineering drawings routinely do.
 *
 * The native `canvas` module (pulled in transitively by pdf-to-img and
 * declared as a direct dep so it resolves from our import path) exports
 * a real, complete DOMMatrix backed by Cairo. We attach it to
 * `globalThis` here so pdf.js sees it during module init.
 *
 * IMPORTANT: this module MUST be evaluated before `pdf-to-img` (and
 * therefore `pdfjs-dist`) is imported. It's the very first import in
 * `apps/api/src/pdf/render.ts` for that reason.
 */
import canvas from "canvas";

const g = globalThis as { DOMMatrix?: unknown };
if (typeof g.DOMMatrix === "undefined" && canvas.DOMMatrix) {
  g.DOMMatrix = canvas.DOMMatrix;
}
