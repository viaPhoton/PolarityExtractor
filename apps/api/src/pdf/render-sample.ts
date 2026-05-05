import fs from "node:fs/promises";
import { renderPdfPages } from "./render.js";

const pages = await renderPdfPages(process.argv[2] ?? "/tmp/drawing_ref.pdf", 200);
const out = process.argv[3] ?? "/tmp/page0.png";
await fs.writeFile(out, pages[0]!.image);
console.log(`wrote ${out}:`, pages[0]!.width, "x", pages[0]!.height);
