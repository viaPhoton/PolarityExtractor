import type { ConnectorPair, ExtractedDrawing } from "@polarity/shared";
import { physicalShellSize } from "./lookup.js";

export interface PairValidation {
  pairId: string;
  issues: string[];
}

/**
 * Run sanity checks on an extracted (or human-edited) drawing.
 * Issues are user-facing strings shown in the verification UI.
 */
export function validateDrawing(d: ExtractedDrawing): PairValidation[] {
  return d.connectorPairs.map((p) => ({
    pairId: p.pairId,
    issues: validatePair(p, d.fibersPerConnector),
  }));
}

export function validatePair(
  pair: ConnectorPair,
  expectedFiberCount: number,
): string[] {
  const issues: string[] = [];

  if (pair.fibers.length !== expectedFiberCount) {
    issues.push(
      `Expected ${expectedFiberCount} fibers, got ${pair.fibers.length}`,
    );
  }

  const shellA = physicalShellSize(
    pair.endA.connectorType,
    expectedFiberCount,
  );
  const shellB = physicalShellSize(
    pair.endB.connectorType,
    expectedFiberCount,
  );

  for (const f of pair.fibers) {
    if (!Number.isInteger(f.endAPosition) || f.endAPosition < 1 || f.endAPosition > shellA) {
      issues.push(
        `End A position out of range [1..${shellA}]: ${f.endAPosition}`,
      );
    }
    if (!Number.isInteger(f.endBPosition) || f.endBPosition < 1 || f.endBPosition > shellB) {
      issues.push(
        `End B position out of range [1..${shellB}]: ${f.endBPosition}`,
      );
    }
  }

  const aPositions = pair.fibers.map((f) => f.endAPosition);
  const bPositions = pair.fibers.map((f) => f.endBPosition);
  const dupA = findDuplicates(aPositions);
  const dupB = findDuplicates(bPositions);
  if (dupA.length > 0) issues.push(`Duplicate End A positions: ${dupA.join(", ")}`);
  if (dupB.length > 0) issues.push(`Duplicate End B positions: ${dupB.join(", ")}`);

  return issues;
}

function findDuplicates(xs: number[]): number[] {
  const seen = new Set<number>();
  const dups = new Set<number>();
  for (const x of xs) {
    if (seen.has(x)) dups.add(x);
    seen.add(x);
  }
  return [...dups].sort((a, b) => a - b);
}

export function hasBlockingIssues(validations: PairValidation[]): boolean {
  return validations.some((v) => v.issues.length > 0);
}

/**
 * Build the `polarity.mapping` array (length = shell size, 0 sentinel
 * for dark positions) from a connector pair's per-fiber mapping.
 */
export function buildMappingFromPair(
  pair: ConnectorPair,
  shellSize: number,
): { mapping: number[]; darkChannels: number[] } {
  const mapping: number[] = new Array(shellSize).fill(0);
  const live = new Set<number>();
  for (const f of pair.fibers) {
    const i = f.endAPosition - 1;
    if (i >= 0 && i < shellSize) {
      mapping[i] = f.endBPosition;
      live.add(f.endAPosition);
    }
  }
  const darkChannels: number[] = [];
  for (let pos = 1; pos <= shellSize; pos += 1) {
    if (!live.has(pos)) darkChannels.push(pos);
  }
  return { mapping, darkChannels };
}
