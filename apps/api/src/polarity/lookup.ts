import type { PolarityLookupRow } from "@polarity/shared";

/**
 * Polarity lookup table from spec §7.
 *
 * IMPORTANT: only `polaritySequence: 3` (Polarity A 12) is independently
 * verified by the attached reference template
 * `12 Fiber SM M12 M12 Polarity A.txt`. All other rows are starting
 * hypotheses and MUST be confirmed with the test-equipment team before
 * production use. See README §"Polarity lookup confirmation step".
 *
 * Convention for Base-8 connectors carried in a 12F shell: the `mapping`
 * array is the *physical shell size* (length 12) with `0` as a sentinel
 * at every dark position. `darkChannels` lists those same positions.
 * `fibersPerConnector` here is the *active* fiber count per §5.3.
 */
export const POLARITY_LOOKUP: readonly PolarityLookupRow[] = [
  {
    polaritySequence: 1,
    name: "Polarity A 8",
    fibersPerConnector: 8,
    mapping: [1, 2, 3, 4, 0, 0, 0, 0, 9, 10, 11, 12],
    darkChannels: [5, 6, 7, 8],
    verified: false,
  },
  {
    polaritySequence: 2,
    name: "Polarity B 8",
    fibersPerConnector: 8,
    mapping: [12, 11, 10, 9, 0, 0, 0, 0, 4, 3, 2, 1],
    darkChannels: [5, 6, 7, 8],
    verified: false,
  },
  {
    polaritySequence: 3,
    name: "Polarity A 12",
    fibersPerConnector: 12,
    mapping: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    darkChannels: [],
    verified: true,
  },
  {
    polaritySequence: 4,
    name: "Polarity B 12",
    fibersPerConnector: 12,
    mapping: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    darkChannels: [],
    verified: false,
  },
  {
    polaritySequence: 5,
    name: "Polarity C 12",
    fibersPerConnector: 12,
    mapping: [2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11],
    darkChannels: [],
    verified: false,
  },
  {
    polaritySequence: 6,
    name: "Polarity A 16",
    fibersPerConnector: 16,
    mapping: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    darkChannels: [],
    verified: false,
  },
  {
    polaritySequence: 7,
    name: "Polarity B 16",
    fibersPerConnector: 16,
    mapping: [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    darkChannels: [],
    verified: false,
  },
];

export interface PolarityLookupKey {
  polarityType: "A" | "B" | "C" | "U" | "CUSTOM";
  fibersPerConnector: number;
}

/**
 * Look up a polarity row from the type letter and the active fiber
 * count. Returns null if no canonical match exists (caller should treat
 * the polarity as CUSTOM and ask the human to define it).
 */
export function findPolarityRow(
  key: PolarityLookupKey,
): PolarityLookupRow | null {
  if (key.polarityType === "CUSTOM" || key.polarityType === "U") return null;
  const wanted = `Polarity ${key.polarityType} ${key.fibersPerConnector}`;
  return POLARITY_LOOKUP.find((r) => r.name === wanted) ?? null;
}

/**
 * Compute the polarity row from an explicit per-fiber mapping. We use
 * this when the human has edited cells in the verification UI and we
 * need to detect whether their edits still match a canonical type or
 * have become custom.
 *
 * `physicalSize` is the connector shell size (8, 12, or 16).
 * `mapping` is 1-indexed length-`physicalSize` with 0 for dark.
 */
export function classifyMapping(
  mapping: number[],
  physicalSize: number,
): PolarityLookupRow | null {
  if (mapping.length !== physicalSize) return null;
  for (const row of POLARITY_LOOKUP) {
    if (row.mapping.length !== physicalSize) continue;
    if (arraysEqual(row.mapping, mapping)) return row;
  }
  return null;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Physical shell size for a connector type label. The label comes from
 * the LLM extraction (e.g. "8F MTP, non-pinned", "MPO 12", "MMC 16").
 * Falls back to `fibersPerConnector` if we cannot infer a wider shell.
 */
export function physicalShellSize(
  connectorTypeLabel: string,
  fibersPerConnector: number,
): number {
  const t = connectorTypeLabel.toUpperCase();
  if (t.includes("MMC") && (t.includes("16") || t.includes("16F"))) return 16;
  if (t.includes("MMC")) return 16;
  if (t.includes("16F") || t.includes("MPO 16") || t.includes("MPO-16")) {
    return 16;
  }
  if (t.includes("12F") || t.includes("MPO 12") || t.includes("MPO-12")) {
    return 12;
  }
  if (t.includes("8F") || t.includes("MPO 8") || t.includes("MPO-8")) {
    // Base-8 connector — but we still treat it as physically 12 if the
    // active count is 8 and the shell is the standard 12F MPO shell.
    // Most Base-8 MPO drawings use a 12F shell; honour that by default.
    return 12;
  }
  return fibersPerConnector;
}
