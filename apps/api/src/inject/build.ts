import { randomUUID } from "node:crypto";
import type { ConnectorPair, ExtractedDrawing } from "@polarity/shared";
import { findPolarityRow, physicalShellSize } from "../polarity/lookup.js";
import {
  buildTemplateBytes,
  type ParsedTemplate,
} from "./parse.js";

export interface BuiltFile {
  filename: string;
  bytes: Buffer;
  /** Total active fiber count written to the file (= wizardData.fibersPerCable). */
  fibersPerCable: number;
  /** Final polarity mapping written to the file (length = totalFibers, 1-indexed). */
  mapping: number[];
  /** Per-fiber switch0 (module/connector index) — same length as mapping. */
  switch0: number[];
  /** Per-fiber switch1 (channel within the connector) — same length as mapping. */
  switch1: number[];
}

export interface BuildOptions {
  template: ParsedTemplate;
  drawing: ExtractedDrawing;
}

/**
 * Build ONE combined test-plan file that covers every fiber across
 * every connector pair in the drawing.
 *
 * Strategy: deep-clone the base template, then mutate every per-fiber
 * structure (assembly side limits, equipment switch arrays, IL/RL run
 * lists, polarity mapping, Polarity test-block mapping, and the
 * mirrored templateSpec) to span all `totalFibers` logical fibers.
 *
 * Numbering convention:
 *   - Logical fibers are numbered globally 1..totalFibers in the order
 *     pairs appear in the drawing. Within each pair, fibers are taken
 *     in their `fibers[]` order (which preserves the drawing's
 *     "Fiber #" column).
 *   - switch0 = per-fiber module index (1..pairCount). Same module
 *     index for the `fibersPerConnector` consecutive logical fibers
 *     belonging to that connector pair.
 *   - switch1 = the fiber's *physical* shell position from the source
 *     drawing (so Base-8 in a 12F shell uses positions {1,2,3,4,9,10,
 *     11,12} as the channel addresses, matching how the test
 *     equipment physically connects).
 *   - The combined polarity mapping is in fiber-#-space: for global
 *     input fiber i (in pair p, position k), the value at
 *     mapping[i-1] is the global End-B fiber index. End-B fiber
 *     indices are derived by sorting each pair's End B positions in
 *     ascending order and taking the index of the matching position.
 */
export function buildCombinedTestPlanFile(opts: BuildOptions): BuiltFile {
  const { template, drawing } = opts;
  const json = structuredClone(template.json);
  const now = new Date().toISOString();

  const layout = computeLayout(drawing);
  const totalFibers = layout.mapping.length;

  // Pick a canonical-polarity row for the *per-pair* polarity, so the
  // human-readable name + integer ID match the standard. The combined
  // mapping itself is the source of truth — the integer ID is purely
  // a UI label.
  const lookup = findPolarityRow({
    polarityType: drawing.polarityType,
    fibersPerConnector: drawing.fibersPerConnector,
  });
  const polarityName = lookup
    ? `${lookup.name}${drawing.connectorPairs.length > 1 ? ` x ${drawing.connectorPairs.length}` : ""}`
    : `Polarity ${drawing.polarityType} ${drawing.fibersPerConnector}`;
  const polaritySequence = lookup?.polaritySequence ?? null;

  const firstPair = drawing.connectorPairs[0];
  const lastPair =
    drawing.connectorPairs[drawing.connectorPairs.length - 1] ?? firstPair;

  // ---- Top-level metadata ----
  setPath(json, ["id"], null);
  setPath(json, ["uuid"], randomUUID());
  setPath(
    json,
    ["name"],
    `${drawing.partNumber} ${totalFibers}F ${prettyCore(drawing.coreSize)} Polarity ${drawing.polarityType}`,
  );
  setPath(json, ["description"], drawing.description);
  setPath(json, ["cableCoreSize"], coreSizeEnum(drawing.coreSize));
  setPath(json, ["importDate"], null);
  setPath(json, ["createdAt"], now);
  setPath(json, ["updatedAt"], now);
  setPath(json, ["deletedAt"], null);
  setPath(json, ["manuallyEdited"], false);

  // ---- wizardData.assembly ----
  setPath(json, ["wizardData", "assembly", "coreSize"], coreSizeEnum(drawing.coreSize));
  setPath(
    json,
    ["wizardData", "assembly", "connectorEndA"],
    connectorLabel(firstPair?.endA.connectorType ?? "MPO 12", drawing.fibersPerConnector),
  );
  setPath(
    json,
    ["wizardData", "assembly", "connectorEndB"],
    connectorLabel(lastPair?.endB.connectorType ?? "MPO 12", drawing.fibersPerConnector),
  );
  setPath(
    json,
    ["wizardData", "assembly", "terminationTypeEndA"],
    terminationEnum(drawing.endFaceGeometry),
  );
  setPath(
    json,
    ["wizardData", "assembly", "terminationTypeEndB"],
    terminationEnum(drawing.endFaceGeometry),
  );
  setPath(json, ["wizardData", "assembly", "polaritySequence"], polaritySequence);
  setPath(json, ["wizardData", "assembly", "polarity"], {
    id: polaritySequence,
    name: polarityName,
    mapping: layout.mapping,
    // In the combined logical view, every entry in `mapping` is a
    // live fiber — physical-shell dark positions are encoded via the
    // switch1 array instead.
    darkChannels: [],
  });
  setPath(json, ["wizardData", "fibersPerCable"], totalFibers);

  applyWavelengths(json, drawing.coreSize);

  // ---- Per-fiber arrays in wizardData.assembly.sideA / sideB ----
  resizeSide(json, ["wizardData", "assembly", "sideA"], totalFibers);
  resizeSide(json, ["wizardData", "assembly", "sideB"], totalFibers);
  resizeIlTotalList(json, totalFibers);
  setPath(
    json,
    ["wizardData", "assembly", "sideTotal", "rlTotal"],
    nullArray(totalFibers),
  );
  setPath(
    json,
    ["wizardData", "assembly", "sideTotal", "sideTotal"],
    nullArray(totalFibers),
  );

  // ---- wizardData.equipment ----
  resizeEquipment(json, layout);

  // ---- testBlocks ----
  resizeTestBlocks(json, layout);

  // ---- templateSpec mirrors ----
  setPath(json, ["templateSpec", "fibersPerCable"], totalFibers);
  setPath(json, ["templateSpec", "coreSize"], coreSizeEnum(drawing.coreSize));
  resizeTemplateSpecProcedures(json, layout);

  const updated: ParsedTemplate = { prefix: template.prefix, json };
  const bytes = buildTemplateBytes(updated);
  return {
    filename: `${sanitizeFilename(drawing.partNumber)}__test-plan.txt`,
    bytes,
    fibersPerCable: totalFibers,
    mapping: layout.mapping,
    switch0: layout.switch0,
    switch1: layout.switch1,
  };
}

/* ------------------------------------------------------------------ */
/* Per-fiber layout                                                   */
/* ------------------------------------------------------------------ */

interface CombinedLayout {
  /** Global polarity mapping (length = totalFibers, 1-indexed). */
  mapping: number[];
  /** Per-fiber module index (switch0). */
  switch0: number[];
  /** Per-fiber channel within the module (switch1) — physical position. */
  switch1: number[];
  /** Per-fiber labels: ["1a/b", "2a/b", ..., "{totalFibers}a/b"]. */
  fiberLabels: string[];
}

function computeLayout(drawing: ExtractedDrawing): CombinedLayout {
  const mapping: number[] = [];
  const switch0: number[] = [];
  const switch1: number[] = [];
  let globalOffset = 0;

  drawing.connectorPairs.forEach((pair, pairIdx) => {
    const moduleNo = pairIdx + 1;
    // Canonical End B fiber numbering: ascending End B physical
    // positions become End B fiber #1..#N within this pair.
    const endBPositionsAsc = [...pair.fibers]
      .map((f) => f.endBPosition)
      .sort((a, b) => a - b);
    const endBPosToFiberNo = new Map<number, number>();
    endBPositionsAsc.forEach((pos, idx) => {
      endBPosToFiberNo.set(pos, idx + 1);
    });

    // Canonical End A fiber numbering: ascending End A physical
    // positions become global fibers (offset+1)..(offset+N).
    const sortedByEndA = [...pair.fibers].sort(
      (a, b) => a.endAPosition - b.endAPosition,
    );
    sortedByEndA.forEach((fiber) => {
      const endBFiberNo = endBPosToFiberNo.get(fiber.endBPosition) ?? 0;
      mapping.push(globalOffset + endBFiberNo);
      switch0.push(moduleNo);
      switch1.push(fiber.endAPosition);
    });
    globalOffset += sortedByEndA.length;
  });

  const totalFibers = mapping.length;
  const fiberLabels = Array.from(
    { length: totalFibers },
    (_, i) => `${i + 1}a/b`,
  );

  return { mapping, switch0, switch1, fiberLabels };
}

/* ------------------------------------------------------------------ */
/* JSON mutators                                                      */
/* ------------------------------------------------------------------ */

function resizeEquipment(
  json: Record<string, unknown>,
  layout: CombinedLayout,
): void {
  const n = layout.mapping.length;
  const labels = layout.fiberLabels;
  const ones = fillArray(1, n);
  const trues = fillArray(false, n);
  const breakCable: Record<string, boolean> = {};
  for (let i = 0; i < n; i += 1) breakCable[labels[i]!] = i === 0;

  setPath(json, ["wizardData", "equipment", "fibers"], labels);
  setPath(json, ["wizardData", "equipment", "switch0"], [...layout.switch0]);
  setPath(json, ["wizardData", "equipment", "switch1"], [...layout.switch1]);
  setPath(json, ["wizardData", "equipment", "switch2"], [...layout.switch1]);
  setPath(json, ["wizardData", "equipment", "tj1Length"], nullArray(n));
  setPath(json, ["wizardData", "equipment", "tj2Length"], nullArray(n));
  setPath(json, ["wizardData", "equipment", "detectors"], ones);
  setPath(json, ["wizardData", "equipment", "pauseBefore"], trues);
  setPath(
    json,
    ["wizardData", "equipment", "pauseMessages"],
    fillArray("pause", n),
  );
  setPath(json, ["wizardData", "equipment", "breakCable"], breakCable);
  setPath(json, ["wizardData", "equipment", "reference"], {
    fibers: labels,
    switch0: [...layout.switch0],
    switch1: [...layout.switch1],
    switch2: [...layout.switch1],
    detectors: ones,
    pauseBefore: trues,
    pauseMessages: fillArray("", n),
    skip: [],
  });
}

function resizeTestBlocks(
  json: Record<string, unknown>,
  layout: CombinedLayout,
): void {
  const blocks = json.testBlocks as unknown[] | undefined;
  if (!Array.isArray(blocks)) return;
  for (const b of blocks) {
    if (typeof b !== "object" || b === null) continue;
    const block = b as Record<string, unknown>;
    if (block.type === "IL/RL") {
      resizeIlrlBlock(block, layout);
    } else if (block.type === "Polarity") {
      const spec = block.specification as Record<string, unknown> | undefined;
      const procs = spec?.procedures as Record<string, unknown>[] | undefined;
      if (procs) {
        for (const p of procs) p.polarityMapping = [...layout.mapping];
      }
    }
  }
}

function resizeIlrlBlock(
  block: Record<string, unknown>,
  layout: CombinedLayout,
): void {
  const labels = layout.fiberLabels;
  const spec = block.specification as Record<string, unknown> | undefined;
  if (!spec) return;
  const procs = spec.procedures as Record<string, unknown>[] | undefined;
  if (!procs) return;

  for (const p of procs) {
    const ilLimit = 0.7;
    const rlLimit = 60;

    // run: one connect step + per-fiber measurement+test triple.
    const run: Record<string, unknown>[] = [
      { t: "c", cb: `${labels[0]}-${labels[labels.length - 1]}` },
    ];
    for (const f of labels) {
      run.push({
        t: "m",
        f,
        m: ["il", "rla", "rlb"],
        w: [0, 1],
        e: { il: ilLimit, rla: rlLimit, rlb: rlLimit },
      });
      run.push({
        t: "t",
        f,
        m: ["il"],
        w: [1310],
        e: `{${f}:1310:il}>-0.01`,
      });
      run.push({
        t: "t",
        f,
        m: ["il"],
        w: [1550],
        e: `{${f}:1550:il}>-0.01`,
      });
    }
    p.run = run;

    p.fiberMap = buildFiberMap(layout);
    p.referenceMap = buildFiberMap(layout);
    p.reference = labels.map((f) => ({
      t: "m",
      f,
      w: [0, 1],
      m: ["il", "rl"],
      e: { il: 5 },
    }));

    if (p.autoStart && typeof p.autoStart === "object") {
      (p.autoStart as Record<string, unknown>).fiber = labels[labels.length - 1];
    }
  }
}

function buildFiberMap(layout: CombinedLayout): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < layout.fiberLabels.length; i += 1) {
    out[layout.fiberLabels[i]!] = {
      s: [
        { sw: 0, ch: layout.switch0[i] ?? 1 },
        { sw: 1, ch: layout.switch1[i] ?? i + 1 },
      ],
      det: 1,
    };
  }
  return out;
}

function resizeTemplateSpecProcedures(
  json: Record<string, unknown>,
  layout: CombinedLayout,
): void {
  const blocks = json.testBlocks as Record<string, unknown>[] | undefined;
  if (!Array.isArray(blocks)) return;

  for (const b of blocks) {
    const ts = b.templateSpec as Record<string, unknown> | undefined;
    if (!ts) continue;
    ts.fibersPerCable = layout.mapping.length;
    const procs = ts.procedures as Record<string, unknown>[] | undefined;
    if (!procs) continue;
    for (const p of procs) {
      if (b.type === "Polarity") {
        p.polarityMapping = [...layout.mapping];
      } else {
        p.fiberMap = buildTemplateSpecFiberMap(layout);
        p.referenceMap = buildTemplateSpecReferenceMap(layout);
        p.cableMap = {
          [layout.fiberLabels[0]!]: `${layout.fiberLabels[0]}-${layout.fiberLabels[layout.fiberLabels.length - 1]}`,
        };
        p.pauseMessages = fillArray("pause", layout.mapping.length);
        p.referencePauseMessages = fillArray("", layout.mapping.length);
        if (p.autoStart && typeof p.autoStart === "object") {
          (p.autoStart as Record<string, unknown>).fiber =
            layout.fiberLabels[layout.fiberLabels.length - 1];
        }
      }
    }
  }
}

function buildTemplateSpecFiberMap(
  layout: CombinedLayout,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < layout.fiberLabels.length; i += 1) {
    out[layout.fiberLabels[i]!] = {
      skip: false,
      switches: [
        { sw: 0, ch: layout.switch0[i] ?? 1 },
        { sw: 1, ch: layout.switch1[i] ?? i + 1 },
      ],
      detector: 1,
      ilLimit: 0.7,
      rlLimitA: 60,
      rlLimitB: 60,
    };
  }
  return out;
}

function buildTemplateSpecReferenceMap(
  layout: CombinedLayout,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < layout.fiberLabels.length; i += 1) {
    out[layout.fiberLabels[i]!] = {
      skip: false,
      switches: [
        { sw: 0, ch: layout.switch0[i] ?? 1 },
        { sw: 1, ch: layout.switch1[i] ?? i + 1 },
      ],
      detector: 1,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Generic helpers                                                    */
/* ------------------------------------------------------------------ */

function setPath(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i]!;
    const next = cur[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

function getPath(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function nullArray(n: number): null[] {
  return new Array(n).fill(null);
}

function fillArray<T>(value: T, n: number): T[] {
  return new Array(n).fill(value);
}

function coreSizeEnum(core: ExtractedDrawing["coreSize"]): string {
  return core.startsWith("SINGLEMODE") ? "CORE_SIZE__SINGLEMODE" : "CORE_SIZE__MULTIMODE";
}

function terminationEnum(g: ExtractedDrawing["endFaceGeometry"]): string {
  return g === "APC"
    ? "TERMINATION_TYPE__ANGLED_CONNECTOR"
    : "TERMINATION_TYPE__FLAT_CONNECTOR";
}

function prettyCore(core: ExtractedDrawing["coreSize"]): string {
  switch (core) {
    case "SINGLEMODE_OS2":
    case "SINGLEMODE_OS1":
      return "SM";
    case "MULTIMODE_OM3":
      return "OM3";
    case "MULTIMODE_OM4":
      return "OM4";
    case "MULTIMODE_OM5":
      return "OM5";
  }
}

function connectorLabel(raw: string, fibersPerConnector: number): string {
  const t = raw.toUpperCase();
  if (t.includes("MMC")) return "MMC 16";
  if (t.includes("16")) return "MPO 16";
  if (t.includes("12")) return "MPO 12";
  if (t.includes("8")) return "MPO 8";
  return `MPO ${fibersPerConnector}`;
}

function applyWavelengths(
  json: Record<string, unknown>,
  core: ExtractedDrawing["coreSize"],
): void {
  const sm = core.startsWith("SINGLEMODE");
  setPath(json, ["wizardData", "wavelength_850"], !sm);
  setPath(json, ["wizardData", "wavelength_1300"], false);
  setPath(json, ["wizardData", "wavelength_1310"], sm);
  setPath(json, ["wizardData", "wavelength_1490"], false);
  setPath(json, ["wizardData", "wavelength_1550"], sm);
  setPath(json, ["wizardData", "wavelength_1625"], false);
}

function resizeSide(
  json: Record<string, unknown>,
  basePath: string[],
  n: number,
): void {
  const cur = getPath(json, basePath) as Record<string, unknown> | undefined;
  if (!cur) return;
  const il = (cur.il as number[] | undefined)?.[0] ?? 0.35;
  const rl = (cur.rl as number[] | undefined)?.[0] ?? 60;
  setPath(json, [...basePath, "il"], fillArray(il, n));
  setPath(json, [...basePath, "rl"], fillArray(rl, n));
  setPath(json, [...basePath, "rlTotal"], nullArray(n));
}

function resizeIlTotalList(
  json: Record<string, unknown>,
  n: number,
): void {
  const cur = getPath(json, [
    "wizardData",
    "assembly",
    "ilTotalList",
  ]) as number[] | undefined;
  const v = cur?.[0] ?? 0.7;
  setPath(json, ["wizardData", "assembly", "ilTotalList"], fillArray(v, n));
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_");
}

/* ------------------------------------------------------------------ */
/* Misc exports kept for callers (validators, smoke tests)            */
/* ------------------------------------------------------------------ */

export { sanitizeFilename };

/**
 * For diagnostic / UI use: classify the polarity uniformity across a
 * drawing's connector pairs.
 */
export function classifyPolarity(drawing: ExtractedDrawing): {
  uniform: boolean;
  pairCount: number;
  fibersPerConnector: number;
  shellSize: number;
} {
  const first = drawing.connectorPairs[0];
  const shellSize = first
    ? physicalShellSize(first.endA.connectorType, drawing.fibersPerConnector)
    : drawing.fibersPerConnector;
  return {
    uniform: drawing.connectorPairs.every(
      (p: ConnectorPair) => p.fibers.length === drawing.fibersPerConnector,
    ),
    pairCount: drawing.connectorPairs.length,
    fibersPerConnector: drawing.fibersPerConnector,
    shellSize,
  };
}
