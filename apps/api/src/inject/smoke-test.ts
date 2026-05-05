/**
 * Smoke test for the injection pipeline. Run with:
 *   pnpm --filter @polarity/api exec tsx src/inject/smoke-test.ts
 *
 * Verifies the two scenarios from §12 acceptance criteria, but with
 * the post-Apr 2026 single-file output convention:
 *
 *  1. A 12F SM Type A drawing produces a single combined file whose
 *     polarity mapping equals [1..12] (matches the reference template).
 *  2. A 288F SM Type B Base-8 trunk produces a single combined file
 *     covering all 288 fibers, with the expected per-pair Type B
 *     pattern repeated 36 times in the global mapping.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExtractedDrawing } from "@polarity/shared";
import { selectTemplate } from "./templates.js";
import { buildCombinedTestPlanFile } from "./build.js";
import { parseTemplate, parseTemplateBuffer } from "./parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeFiber(p: number, color: string, q: number, qcolor: string) {
  return {
    endAPosition: p,
    endAColor: color,
    endBPosition: q,
    endBColor: qcolor,
  };
}

const TIA = [
  "blue",
  "orange",
  "green",
  "brown",
  "slate",
  "white",
  "red",
  "black",
  "yellow",
  "violet",
  "rose",
  "aqua",
];

function build12fTypeADrawing(): ExtractedDrawing {
  return ExtractedDrawing.parse({
    documentNumber: "TEST-12F-A",
    partNumber: "TEST-12F-A",
    description: "12F SM MPO 12F Polarity A",
    totalFibers: 12,
    coreSize: "SINGLEMODE_OS2",
    endFaceGeometry: "APC",
    polarityType: "A",
    fibersPerConnector: 12,
    connectorPairs: [
      {
        pairId: "A1<->B1",
        endA: { legId: "A1", breakout: "A", connectorType: "MPO 12" },
        endB: { legId: "B1", breakout: "B", connectorType: "MPO 12" },
        fibers: Array.from({ length: 12 }, (_, i) =>
          makeFiber(i + 1, TIA[i]!, i + 1, TIA[i]!),
        ),
      },
    ],
    notes: [],
  });
}

function build288fTypeBBase8Drawing(): ExtractedDrawing {
  // 36 connector pairs, each Base-8 in 12F shell, Type B mapping.
  const pairs = Array.from({ length: 36 }, (_, idx) => {
    const i = idx + 1;
    return {
      pairId: `A1'${i}<->B1'${i}`,
      endA: {
        legId: `A1'${i}`,
        breakout: `A1`,
        connectorType: "8F MTP, non-pinned",
      },
      endB: {
        legId: `B1'${i}`,
        breakout: `B1`,
        connectorType: "8F MTP, non-pinned",
      },
      // Type B in 8F: input pos 1->12, 2->11, 3->10, 4->9,
      // 9->4, 10->3, 11->2, 12->1. Positions 5-8 dark.
      fibers: [
        makeFiber(1, "blue", 12, "aqua"),
        makeFiber(2, "orange", 11, "rose"),
        makeFiber(3, "green", 10, "violet"),
        makeFiber(4, "brown", 9, "yellow"),
        makeFiber(9, "yellow", 4, "brown"),
        makeFiber(10, "violet", 3, "green"),
        makeFiber(11, "rose", 2, "orange"),
        makeFiber(12, "aqua", 1, "blue"),
      ],
    };
  });
  return ExtractedDrawing.parse({
    documentNumber: "VP1A0288R6P05",
    partNumber: "VP1A0288R6P05",
    description: "288F SM Trunk Base-8 Type B",
    totalFibers: 288,
    coreSize: "SINGLEMODE_OS2",
    endFaceGeometry: "APC",
    polarityType: "B",
    fibersPerConnector: 8,
    connectorPairs: pairs,
    notes: [],
  });
}

async function main() {
  let pass = 0;
  let fail = 0;
  function ok(name: string, cond: boolean, info: string = "") {
    if (cond) {
      pass += 1;
      console.log(`  PASS  ${name}`);
    } else {
      fail += 1;
      console.error(`  FAIL  ${name}${info ? `\n        ${info}` : ""}`);
    }
  }

  console.log("\n== Scenario 1: 12F SM Type A combined file matches reference ==");
  const drawing12 = build12fTypeADrawing();
  const template = await selectTemplate(drawing12);
  const file12 = buildCombinedTestPlanFile({ template, drawing: drawing12 });
  const refPath = path.join(__dirname, "../templates/sm_mpo12_mpo12_polarity_a.txt");
  const ref = await parseTemplate(refPath);
  const built = parseTemplateBuffer(file12.bytes);
  const refJson = ref.json as Record<string, any>;
  const builtJson = built.json as Record<string, any>;

  ok("prefix bytes preserved", built.prefix.equals(ref.prefix));
  ok(
    "polaritySequence = 3",
    builtJson.wizardData.assembly.polaritySequence === 3,
  );
  ok(
    "polarity.mapping = [1..12]",
    JSON.stringify(builtJson.wizardData.assembly.polarity.mapping) ===
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  );
  ok(
    "polarity.darkChannels = [] (combined file uses logical view)",
    JSON.stringify(builtJson.wizardData.assembly.polarity.darkChannels) === "[]",
  );
  ok(
    "fibersPerCable = 12 (== totalFibers)",
    builtJson.wizardData.fibersPerCable === 12,
  );
  ok(
    "equipment.fibers length = 12",
    builtJson.wizardData.equipment.fibers.length === 12,
  );
  ok(
    "equipment.switch0 all = 1 (single module)",
    JSON.stringify(builtJson.wizardData.equipment.switch0) ===
      JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
  );
  ok(
    "equipment.switch1 = [1..12]",
    JSON.stringify(builtJson.wizardData.equipment.switch1) ===
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  );
  const refRun = refJson.testBlocks[0].specification.procedures[0].run;
  const builtRun = builtJson.testBlocks[0].specification.procedures[0].run;
  ok(
    `IL/RL run length matches (${refRun.length} vs ${builtRun.length})`,
    refRun.length === builtRun.length,
  );
  const refMap = refJson.testBlocks[1].specification.procedures[0].polarityMapping;
  const builtMap = builtJson.testBlocks[1].specification.procedures[0].polarityMapping;
  ok(
    "Polarity testBlock mapping = reference [1..12]",
    JSON.stringify(refMap) === JSON.stringify(builtMap),
  );
  ok(
    "filename uses single-file naming",
    file12.filename === "TEST-12F-A__test-plan.txt",
  );

  console.log("\n== Scenario 2: 288F SM Base-8 Type B combined trunk ==");
  const drawing288 = build288fTypeBBase8Drawing();
  ok("36 connector pairs in input", drawing288.connectorPairs.length === 36);
  const file288 = buildCombinedTestPlanFile({
    template,
    drawing: drawing288,
  });
  const parsed288 = parseTemplateBuffer(file288.bytes);
  const j288 = parsed288.json as Record<string, any>;

  ok(
    "starts with 0085C29217 prefix",
    parsed288.prefix.toString("ascii") === "0085C29217",
  );
  ok(
    "fibersPerCable = 288 (sum of active fibers across all pairs)",
    j288.wizardData.fibersPerCable === 288,
  );
  ok(
    "equipment.fibers length = 288",
    j288.wizardData.equipment.fibers.length === 288,
  );
  // Per the global Type-B-Base-8 expectation: every block of 8 logical
  // fibers reverses within itself, with the targets pegged to that
  // block's global offset.
  const expectedMapping: number[] = [];
  for (let p = 0; p < 36; p += 1) {
    for (let i = 8; i >= 1; i -= 1) expectedMapping.push(p * 8 + i);
  }
  ok(
    "polarity.mapping length = 288",
    j288.wizardData.assembly.polarity.mapping.length === 288,
  );
  ok(
    "polarity.mapping == per-pair Type B reversal x 36",
    JSON.stringify(j288.wizardData.assembly.polarity.mapping) ===
      JSON.stringify(expectedMapping),
  );
  ok(
    "polarity.darkChannels = []",
    JSON.stringify(j288.wizardData.assembly.polarity.darkChannels) === "[]",
  );
  ok(
    "polaritySequence = 2 (Polarity B 8 — uniform across pairs)",
    j288.wizardData.assembly.polaritySequence === 2,
  );

  // switch0: 1 repeated 8 times, then 2 repeated 8 times, ..., 36 x 8.
  const expectedSwitch0: number[] = [];
  for (let p = 1; p <= 36; p += 1) {
    for (let i = 0; i < 8; i += 1) expectedSwitch0.push(p);
  }
  ok(
    "equipment.switch0 = module index repeated per active fiber",
    JSON.stringify(j288.wizardData.equipment.switch0) ===
      JSON.stringify(expectedSwitch0),
  );
  // switch1 should cycle through the active physical positions of the
  // Base-8-in-12F shell: {1,2,3,4,9,10,11,12}.
  const expectedSwitch1: number[] = [];
  const activePositions = [1, 2, 3, 4, 9, 10, 11, 12];
  for (let p = 0; p < 36; p += 1) expectedSwitch1.push(...activePositions);
  ok(
    "equipment.switch1 cycles through {1,2,3,4,9,10,11,12} per module",
    JSON.stringify(j288.wizardData.equipment.switch1) ===
      JSON.stringify(expectedSwitch1),
  );

  // IL/RL run should have exactly 288 measurement steps.
  const ilrlRun = j288.testBlocks[0].specification.procedures[0].run;
  const measurements = ilrlRun.filter((r: any) => r.t === "m");
  ok(
    `IL/RL run has 288 measurement steps (got ${measurements.length})`,
    measurements.length === 288,
  );
  ok(
    "filename = VP1A0288R6P05__test-plan.txt",
    file288.filename === "VP1A0288R6P05__test-plan.txt",
  );

  console.log(`\n== ${pass} passed, ${fail} failed ==\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
