import type { SourcePage } from "../source/types.js";
import {
  runExtraction,
  type ExtractResult,
  type ExtractionHooks,
} from "./provider.js";

export type { ExtractResult, ExtractionHooks } from "./provider.js";

/**
 * Send prepared source pages (rendered PDF pages or a passed-through
 * uploaded image) to the configured LLM provider and return the
 * validated extraction. Provider selection is driven by AI_PROVIDER.
 *
 * The dispatcher in `provider.ts` handles JSON parsing, schema
 * validation, and the single-shot retry on validation failure.
 */
export async function extractDrawing(
  pages: SourcePage[],
  hooks?: ExtractionHooks,
): Promise<ExtractResult> {
  return runExtraction(pages, hooks);
}
