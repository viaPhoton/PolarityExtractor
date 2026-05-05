import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Domain enums                                                       */
/* ------------------------------------------------------------------ */

export const CoreSize = z.enum([
  "SINGLEMODE_OS2",
  "SINGLEMODE_OS1",
  "MULTIMODE_OM3",
  "MULTIMODE_OM4",
  "MULTIMODE_OM5",
]);
export type CoreSize = z.infer<typeof CoreSize>;

export const EndFaceGeometry = z.enum(["APC", "UPC"]);
export type EndFaceGeometry = z.infer<typeof EndFaceGeometry>;

export const PolarityType = z.enum(["A", "B", "C", "U", "CUSTOM"]);
export type PolarityType = z.infer<typeof PolarityType>;

/* ------------------------------------------------------------------ */
/* LLM extraction schema (the JSON shape Claude must return)          */
/* ------------------------------------------------------------------ */

export const Fiber = z.object({
  endAPosition: z.number().int(),
  endAColor: z.string(),
  endBPosition: z.number().int(),
  endBColor: z.string(),
});
export type Fiber = z.infer<typeof Fiber>;

export const ConnectorEnd = z.object({
  legId: z.string(),
  breakout: z.string(),
  connectorType: z.string(),
});
export type ConnectorEnd = z.infer<typeof ConnectorEnd>;

export const ConnectorPair = z.object({
  pairId: z.string(),
  endA: ConnectorEnd,
  endB: ConnectorEnd,
  fibers: z.array(Fiber),
});
export type ConnectorPair = z.infer<typeof ConnectorPair>;

export const ExtractedDrawing = z.object({
  documentNumber: z.string(),
  partNumber: z.string(),
  description: z.string(),
  totalFibers: z.number().int(),
  coreSize: CoreSize,
  endFaceGeometry: EndFaceGeometry,
  polarityType: PolarityType,
  fibersPerConnector: z.number().int(),
  connectorPairs: z.array(ConnectorPair),
  notes: z.array(z.string()).optional().default([]),
});
export type ExtractedDrawing = z.infer<typeof ExtractedDrawing>;

/* ------------------------------------------------------------------ */
/* Polarity lookup row (the §7 table)                                 */
/* ------------------------------------------------------------------ */

export const PolarityLookupRow = z.object({
  polaritySequence: z.number().int(),
  name: z.string(),
  fibersPerConnector: z.number().int(),
  /**
   * 1-indexed mapping of input position -> output position.
   * Length must equal the physical shell size of the connector
   * (not the active fiber count). For Base-8-in-12F shells we use
   * length 12 with 0 sentinels at dark positions.
   */
  mapping: z.array(z.number().int()),
  /** 1-indexed positions that carry no live fiber. */
  darkChannels: z.array(z.number().int()),
  /** True if this entry has been independently verified by the test team. */
  verified: z.boolean(),
});
export type PolarityLookupRow = z.infer<typeof PolarityLookupRow>;

/* ------------------------------------------------------------------ */
/* Session API contract                                               */
/* ------------------------------------------------------------------ */

export const SessionStatus = z.enum([
  "uploaded",
  "extracting",
  "needs_verification",
  "verified",
  "generating",
  "ready",
  "error",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SessionSummary = z.object({
  sessionId: z.string(),
  status: SessionStatus,
  pdfFilename: z.string(),
  pageCount: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export const PageImage = z.object({
  index: z.number().int(),
  /** Data URL (data:image/png;base64,...) suitable for direct <img src> */
  dataUrl: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});
export type PageImage = z.infer<typeof PageImage>;

export const UploadResponse = z.object({
  sessionId: z.string(),
});
export type UploadResponse = z.infer<typeof UploadResponse>;

export const ExtractionResponse = z.object({
  sessionId: z.string(),
  extracted: ExtractedDrawing,
  /**
   * Per-pair validation report from polarity/validate.
   * Empty array entries mean the pair is clean.
   */
  validation: z.array(
    z.object({
      pairId: z.string(),
      issues: z.array(z.string()),
    }),
  ),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponse>;

export const VerifyRequest = z.object({
  sessionId: z.string(),
  edited: ExtractedDrawing,
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const GenerateResponse = z.object({
  sessionId: z.string(),
  /** Filename of the single combined test-plan file written to disk. */
  filename: z.string(),
  /** Total active fibers covered by the generated file. */
  fibersPerCable: z.number().int(),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;
