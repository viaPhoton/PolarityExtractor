/**
 * Smoke test for the PDF renderer. Render the user's reference 288F
 * drawing at low DPI to confirm pdf-to-img works on this system
 * (without canvas built — pdf.js falls back to its own renderer).
 */
import { renderPdfPages } from "./render.js";

const pdfPath = process.argv[2] ?? "/tmp/drawing_ref.pdf";
const pages = await renderPdfPages(pdfPath, 100);
console.log("pages rendered:", pages.length);
for (const p of pages) {
  console.log(`  page ${p.index}: ${p.width}x${p.height}, ${p.image.length} bytes (${p.mediaType})`);
}
