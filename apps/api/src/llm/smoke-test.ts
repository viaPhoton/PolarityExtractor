/**
 * End-to-end smoke test for the LLM extraction pipeline. Renders the
 * given PDF, sends it to the configured provider, and prints a short
 * summary of the validated extraction.
 *
 * Run with:
 *   AI_PROVIDER=gemini AI_API_KEY=... pnpm --filter @polarity/api exec tsx src/llm/smoke-test.ts /path/to/drawing.pdf
 */
import path from "node:path";
import { prepareSource } from "../source/prepare.js";
import { extractDrawing } from "./extract.js";
import {
  getActiveModel,
  getActiveProvider,
  getSettings,
  loadSettings,
} from "../settings/store.js";

loadSettings();

const filePath = process.argv[2] ?? "/tmp/drawing_ref.pdf";

console.log(
  `[smoke] provider=${getActiveProvider()} model=${getActiveModel()} file=${filePath}`,
);
console.time("[smoke] prepare");
const pages = await prepareSource(
  {
    filename: path.basename(filePath),
    filePath,
    mimeType: "", // detectMediaType will fall back to the file extension
  },
  getSettings().pdfRenderDpi,
);
console.timeEnd("[smoke] prepare");
console.log(
  `[smoke] prepared ${pages.length} page(s) — ${pages.map((p) => `${p.width}x${p.height} ${p.mediaType}`).join(", ")}`,
);

console.time("[smoke] extract");
const result = await extractDrawing(pages);
console.timeEnd("[smoke] extract");

const d = result.drawing;
console.log("\n=== extraction summary ===");
console.log(`provider:           ${result.provider}`);
console.log(`model:              ${result.model}`);
console.log(`attempts:           ${result.attempts}`);
console.log(`documentNumber:     ${d.documentNumber}`);
console.log(`partNumber:         ${d.partNumber}`);
console.log(`description:        ${d.description}`);
console.log(`totalFibers:        ${d.totalFibers}`);
console.log(`coreSize:           ${d.coreSize}`);
console.log(`endFaceGeometry:    ${d.endFaceGeometry}`);
console.log(`polarityType:       ${d.polarityType}`);
console.log(`fibersPerConnector: ${d.fibersPerConnector}`);
console.log(`connectorPairs:     ${d.connectorPairs.length}`);
const first = d.connectorPairs[0];
if (first) {
  console.log(`\n=== first pair ===`);
  console.log(`pairId:    ${first.pairId}`);
  console.log(`endA:      ${JSON.stringify(first.endA)}`);
  console.log(`endB:      ${JSON.stringify(first.endB)}`);
  console.log(`fibers (${first.fibers.length}):`);
  for (const f of first.fibers) {
    console.log(
      `  pos ${String(f.endAPosition).padStart(2)} ${f.endAColor.padEnd(7)}  ->  pos ${String(f.endBPosition).padStart(2)} ${f.endBColor}`,
    );
  }
}
if (d.notes && d.notes.length) {
  console.log(`\nnotes:`);
  for (const n of d.notes) console.log(`  - ${n}`);
}
