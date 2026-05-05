import fs from "node:fs";
import path from "node:path";
import type { ExtractedDrawing } from "@polarity/shared";
import { parseTemplateBuffer, type ParsedTemplate } from "./parse.js";
import { buildCombinedTestPlanFile, type BuiltFile } from "./build.js";
import { selectTemplate } from "./templates.js";

export interface OutputResult {
  /** Absolute path to the single combined test-plan file on disk. */
  filePath: string;
  /** Filename only (without directory) for downloads. */
  filename: string;
  /** Total active fibers written to the file. */
  fibersPerCable: number;
}

/**
 * Build ONE combined test-plan file covering every fiber across every
 * connector pair, validate its structural invariants, and write it to
 * disk. Throws (without writing) if validation fails.
 */
export async function generateTestPlan(
  outputDir: string,
  drawing: ExtractedDrawing,
): Promise<OutputResult> {
  const template = await selectTemplate(drawing);
  const built = buildCombinedTestPlanFile({ template, drawing });

  validateBuiltFile(built, template);

  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, built.filename);
  await fs.promises.writeFile(filePath, built.bytes);

  return {
    filePath,
    filename: built.filename,
    fibersPerCable: built.fibersPerCable,
  };
}

/* ------------------------------------------------------------------ */
/* Structural validation                                              */
/* ------------------------------------------------------------------ */

/**
 * Re-parse the built file and assert structural invariants:
 *  - prefix bytes match the source template byte-for-byte
 *  - polarity.mapping has the expected length and no duplicate live values
 *  - equipment.fibers length == mapping length
 *  - testBlocks[].procedures[].run measurement count == fibersPerCable
 */
function validateBuiltFile(file: BuiltFile, template: ParsedTemplate): void {
  const reparsed = parseTemplateBuffer(file.bytes);
  if (!reparsed.prefix.equals(template.prefix)) {
    throw new Error(
      `Validation failed for ${file.filename}: header bytes drifted`,
    );
  }
  const json = reparsed.json;
  const mapping = peek<number[]>(json, [
    "wizardData",
    "assembly",
    "polarity",
    "mapping",
  ]);
  if (!mapping) {
    throw new Error(
      `Validation failed for ${file.filename}: polarity.mapping missing`,
    );
  }
  if (mapping.length !== file.mapping.length) {
    throw new Error(
      `Validation failed for ${file.filename}: polarity.mapping length ${mapping.length} != expected ${file.mapping.length}`,
    );
  }
  const seen = new Set<number>();
  for (const v of mapping) {
    if (v === 0) continue; // dark sentinel (combined files use 0 only if a pair contributes one)
    if (seen.has(v)) {
      throw new Error(
        `Validation failed for ${file.filename}: duplicate value ${v} in polarity.mapping`,
      );
    }
    seen.add(v);
  }

  const fibers = peek<unknown[]>(json, ["wizardData", "equipment", "fibers"]);
  if (!fibers) {
    throw new Error(
      `Validation failed for ${file.filename}: equipment.fibers missing`,
    );
  }
  if (fibers.length !== mapping.length) {
    throw new Error(
      `Validation failed for ${file.filename}: equipment.fibers length ${fibers.length} != mapping length ${mapping.length}`,
    );
  }

  const blocks = peek<Record<string, unknown>[]>(json, ["testBlocks"]);
  if (!Array.isArray(blocks)) {
    throw new Error(
      `Validation failed for ${file.filename}: testBlocks missing`,
    );
  }
  for (const b of blocks) {
    if (b.type !== "IL/RL") continue;
    const procs = peek<Record<string, unknown>[]>(b, [
      "specification",
      "procedures",
    ]);
    if (!procs) continue;
    for (const p of procs) {
      const run = p.run as unknown[] | undefined;
      if (!Array.isArray(run)) continue;
      const measurements = run.filter(
        (r) =>
          typeof r === "object" &&
          r !== null &&
          (r as { t?: string }).t === "m",
      );
      if (measurements.length !== file.fibersPerCable) {
        throw new Error(
          `Validation failed for ${file.filename}: IL/RL run has ${measurements.length} measurement steps, expected ${file.fibersPerCable}`,
        );
      }
    }
  }
}

function peek<T>(obj: unknown, path: string[]): T | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return (cur as T | undefined) ?? null;
}
