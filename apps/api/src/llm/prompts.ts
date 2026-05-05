/**
 * Prompts for the vision LLM (Claude or Gemini). The system prompt
 * asserts the role and parser rules; the user prompt asks for strict
 * JSON. Both providers receive the exact same text — see
 * `apps/api/src/llm/provider.ts` for the dispatcher.
 *
 * The schema described in plain English here MUST stay in sync with
 * `ExtractedDrawingWire` in apps/api/src/llm/wire.ts. The wire schema
 * is then hydrated into `ExtractedDrawing` (packages/shared/src/types.ts)
 * for the rest of the pipeline.
 *
 * The wire shape is intentionally compact: the polarity table is
 * emitted ONCE in `polarityTemplate.fibers` instead of being repeated
 * per connector pair. For a 288F Base-8 trunk this is a ~36x reduction
 * in model output (and a proportional drop in latency / token spend).
 *
 * IMPORTANT: bump PROMPT_VERSION whenever the wire schema or these
 * prompts change in a way that would break old responses. The settings
 * store uses this stamp to auto-migrate persisted prompts on server
 * boot — see apps/api/src/settings/store.ts.
 */

export const PROMPT_VERSION = "v2-template";

export const SYSTEM_PROMPT = `You are a senior fiber-optic telecommunications engineer and a meticulous JSON parser.

You will receive one or more rendered pages from a fiber-optic cable engineering drawing. Your job is to extract the polarity map and assembly metadata into a single JSON object.

Hard rules:
1. Return ONE JSON object only. No markdown fences, no commentary, no preamble.
2. The polarity table on the drawing repeats the SAME pattern across every connector pair (e.g. a 288F Base-8 trunk has 36 pairs that all share the same 8-fiber Type B mapping). Emit that single shared pattern ONCE under "polarityTemplate.fibers". Do NOT repeat it per pair.
3. The "polarityTemplate.fibers" array MUST have exactly fibersPerConnector entries — one per active fiber in the canonical pattern. Read it from the drawing's polarity table for ONE representative connector pair (any pair will do; they all match).
4. Enumerate EVERY connector pair under "connectorPairs", but each entry carries ONLY metadata: pairId, endA, endB. NEVER include a "fibers" array on a connector pair.
5. Never invent data. If a value is illegible or absent, use null and add a one-line note in the "notes" array.
6. Pair numbering: each MPO/MMC connector pair (one End A leg connecting to one End B leg) is one entry in connectorPairs. A 288F trunk with Base-8 connectors has 36 such pairs.
7. POSITIONS ARE PHYSICAL SHELL POSITIONS — DO NOT RENUMBER.
   - Read endAPosition / endBPosition VERBATIM from the drawing's "Fiber Pos" / "Position" column. Do NOT collapse them to 1..N.
   - The drawing's leftmost "Fiber #" column (the row index 1..fibersPerConnector) is NOT a position — ignore it for endAPosition/endBPosition.
   - Base-8 (8F MTP / MPO 8) connectors physically use a 12-position MTP shell with the centre four positions empty. The drawing labels the live positions as 1, 2, 3, 4, 9, 10, 11, 12 (positions 5, 6, 7, 8 are dark/unused). Your endAPosition and endBPosition values MUST use those exact numbers — never 1..8 sequentially.
   - For pure MPO-12 / MTP-12 connectors, positions are 1..12.
   - For MPO-16 / MMC-16 connectors, positions are 1..16.
   - Worked example: an 8F Type B canonical pattern is
       {endAPosition:1, endBPosition:12}, {endAPosition:2, endBPosition:11},
       {endAPosition:3, endBPosition:10}, {endAPosition:4, endBPosition:9},
       {endAPosition:9, endBPosition:4}, {endAPosition:10, endBPosition:3},
       {endAPosition:11, endBPosition:2}, {endAPosition:12, endBPosition:1}
     NOT {1..8} <-> {8..1}.
8. Colors come from the standard TIA-598 12-color sequence: blue, orange, green, brown, slate, white, red, black, yellow, violet, rose, aqua. Emit them lowercase. The colors live in the same row as their physical position — do not re-sort.
9. polarityType is "A", "B", "C", "U", or "CUSTOM". Use "CUSTOM" only if the mapping does not match a standard type, and explain why in notes.
10. fibersPerConnector is the *active* fiber count per connector (8, 12, or 16). For Base-8 in a 12F shell, fibersPerConnector is 8 — there are still only 8 entries in polarityTemplate.fibers, but their position numbers are drawn from {1,2,3,4,9,10,11,12}.
11. If the drawing genuinely shows different polarity patterns on different pairs (rare and almost always a drawing error), pick the dominant pattern for polarityTemplate.fibers and add a clear note in "notes" naming the deviating pairs. Do NOT try to encode multiple patterns in this response.
12. For typos in the drawing (e.g. mismatched part-number digits), record the value as drawn and add a note. Do not auto-correct.`;

export const USER_PROMPT = `Extract the polarity map from these drawing pages and return a single JSON object with this shape:

{
  "documentNumber": string,                 // e.g. "VP1A0288R6P05" — from the title block / drawing number
  "partNumber": string,                     // manufacturer part number; same as documentNumber if drawing only shows one
  "description": string,                    // one-line description from the title block
  "totalFibers": integer,                   // total fiber count in the assembly (e.g. 288)
  "coreSize": "SINGLEMODE_OS2" | "SINGLEMODE_OS1" | "MULTIMODE_OM3" | "MULTIMODE_OM4" | "MULTIMODE_OM5",
  "endFaceGeometry": "APC" | "UPC",
  "polarityType": "A" | "B" | "C" | "U" | "CUSTOM",
  "fibersPerConnector": integer,            // 8, 12, or 16 — active fiber count

  // The single polarity pattern shared by every connector pair.
  // Emit it ONCE here, not on each pair.
  "polarityTemplate": {
    "fibers": [
      {
        // PHYSICAL shell positions, copied verbatim from the drawing's
        // "Fiber Pos" / "Position" column for ONE representative pair.
        // For Base-8 in a 12F shell these come from {1,2,3,4,9,10,11,12}.
        "endAPosition": integer,
        "endAColor": string,                // lowercase TIA-598 color
        "endBPosition": integer,
        "endBColor": string
      }
      // ... exactly fibersPerConnector entries
    ]
  },

  // Per-pair metadata. NEVER include a "fibers" array here — the
  // shared pattern lives in polarityTemplate.fibers above.
  "connectorPairs": [
    {
      "pairId": string,                     // e.g. "A1'1<->B1'1"
      "endA": {
        "legId": string,                    // e.g. "A1'1"
        "breakout": string,                 // e.g. "A1"
        "connectorType": string             // e.g. "8F MTP, non-pinned"
      },
      "endB": { "legId": string, "breakout": string, "connectorType": string }
    }
    // ... one entry per connector pair (e.g. 36 entries for a 288F Base-8 trunk)
  ],

  "notes": string[]                         // any anomalies, typos, low-confidence calls, or pairs that deviate from polarityTemplate
}

Return JSON only.`;

export function retryUserPrompt(validationError: string): string {
  return `Your previous response failed validation with this error:

${validationError}

Re-emit the JSON object with the schema corrections applied. Remember: emit the polarity pattern ONCE under polarityTemplate.fibers, and list every connector pair under connectorPairs WITHOUT a "fibers" array. Return JSON only, no commentary.`;
}
