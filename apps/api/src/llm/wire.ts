import { z } from "zod";
import type { ExtractedDrawing } from "@polarity/shared";
import {
  ConnectorEnd,
  CoreSize,
  EndFaceGeometry,
  Fiber,
  PolarityType,
} from "@polarity/shared";

/**
 * Compact "wire" schema returned by the vision LLM. The polarity
 * pattern is emitted ONCE in `polarityTemplate.fibers` and re-applied
 * to every connector pair on the server. Per-pair metadata (legId /
 * breakout / connectorType) is still enumerated explicitly because it
 * varies pair-to-pair.
 *
 * This shape exists purely as an LLM-output optimisation: the rest of
 * the codebase consumes the hydrated `ExtractedDrawing` and is unaware
 * the model ever returned a smaller shape. See `hydrateExtractedDrawing`.
 *
 * For a 288F Base-8 trunk this collapses ~288 fiber rows in the model
 * output down to 8 (one canonical pattern), with a proportional drop in
 * model output tokens and end-to-end extraction latency.
 */
export const ExtractedDrawingWire = z.object({
  documentNumber: z.string(),
  partNumber: z.string(),
  description: z.string(),
  totalFibers: z.number().int(),
  coreSize: CoreSize,
  endFaceGeometry: EndFaceGeometry,
  polarityType: PolarityType,
  fibersPerConnector: z.number().int(),

  /**
   * The single polarity pattern shared by every connector pair. Length
   * MUST equal fibersPerConnector. Positions are physical shell
   * positions (e.g. {1,2,3,4,9,10,11,12} for Base-8 in a 12F shell).
   */
  polarityTemplate: z.object({
    fibers: z.array(Fiber),
  }),

  /** One entry per physical connector pair, in drawing order. */
  connectorPairs: z.array(
    z.object({
      pairId: z.string(),
      endA: ConnectorEnd,
      endB: ConnectorEnd,
    }),
  ),

  notes: z.array(z.string()).optional().default([]),
});
export type ExtractedDrawingWire = z.infer<typeof ExtractedDrawingWire>;

/**
 * Re-inflate the wire shape into the canonical `ExtractedDrawing`
 * consumed by validation, the verify UI, and the inject step. Every
 * connector pair receives a freshly-cloned copy of
 * `polarityTemplate.fibers` so downstream callers can mutate per-pair
 * data without aliasing.
 */
export function hydrateExtractedDrawing(
  wire: ExtractedDrawingWire,
): ExtractedDrawing {
  const template = wire.polarityTemplate.fibers;
  return {
    documentNumber: wire.documentNumber,
    partNumber: wire.partNumber,
    description: wire.description,
    totalFibers: wire.totalFibers,
    coreSize: wire.coreSize,
    endFaceGeometry: wire.endFaceGeometry,
    polarityType: wire.polarityType,
    fibersPerConnector: wire.fibersPerConnector,
    connectorPairs: wire.connectorPairs.map((p) => ({
      pairId: p.pairId,
      endA: { ...p.endA },
      endB: { ...p.endB },
      fibers: template.map((f) => ({ ...f })),
    })),
    notes: wire.notes ?? [],
  };
}
