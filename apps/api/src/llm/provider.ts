import type { ExtractedDrawing } from "@polarity/shared";
import type { SourcePage, SupportedImageType } from "../source/types.js";
import { getActiveModel, getActiveProvider, getSettings } from "../settings/store.js";
import { retryUserPrompt } from "./prompts.js";
import { extractWithAnthropic } from "./anthropic.js";
import { extractWithGoogle } from "./google.js";
import { ExtractedDrawingWire, hydrateExtractedDrawing } from "./wire.js";
import { createLogger, formatBytes, formatMs } from "../log.js";

const log = createLogger("llm");

export interface ExtractResult {
  drawing: ExtractedDrawing;
  /** Number of attempts the model required (1 or 2). */
  attempts: number;
  provider: "anthropic" | "google";
  /** Resolved model id used for the call. */
  model: string;
}

/**
 * A single conversation turn. `includeImages: true` on a user turn
 * means the transport should attach the request's images to that turn
 * (typically only the first user turn does this).
 */
export type Turn =
  | { role: "user"; text: string; includeImages?: boolean }
  | { role: "assistant"; text: string };

/**
 * Per-provider transport. Given a system prompt, a list of conversation
 * turns, and the image set, return the model's raw text response.
 * Providers do NOT parse JSON or validate — that's the dispatcher's job.
 */
export interface LlmTransport {
  name: "anthropic" | "google";
  model: string;
  call(req: TransportRequest): Promise<string>;
}

export interface TransportRequest {
  systemPrompt: string;
  turns: Turn[];
  /**
   * Base64-encoded source images. mediaType is whichever format the
   * upload was: "image/png" for PDF-rendered pages or for PNG uploads,
   * and the original type for JPEG / WebP / GIF uploads.
   */
  images: { mediaType: SupportedImageType; data: string }[];
}

/**
 * Thrown by a transport when the model stopped for a reason that a
 * retry will not fix (output token cap hit, safety block, etc.).
 * Dispatcher catches this and aborts the loop with a single, clear
 * error instead of burning a second call on the same issue.
 */
export class NonRetryableExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableExtractionError";
  }
}

export function getTransport(): LlmTransport {
  const provider = getActiveProvider();
  const model = getActiveModel();
  if (provider === "anthropic") {
    return { name: "anthropic", model, call: extractWithAnthropic };
  }
  return { name: "google", model, call: extractWithGoogle };
}

export interface ExtractionHooks {
  /** Called before each model call (attempt is 1-indexed). */
  onAttempt?: (attempt: number) => void;
  /** Called after a model call returns, before validation runs. */
  onValidating?: () => void;
}

/**
 * Drive any LlmTransport through the schema-validate-and-retry loop.
 */
export async function runExtraction(
  pages: SourcePage[],
  hooks: ExtractionHooks = {},
): Promise<ExtractResult> {
  const transport = getTransport();
  const images = pages.map((p) => ({
    mediaType: p.mediaType,
    data: p.image.toString("base64"),
  }));
  const totalBytes = pages.reduce((acc, p) => acc + p.image.byteLength, 0);
  log.info("dispatch", {
    provider: transport.name,
    model: transport.model,
    pages: pages.length,
    bytes: formatBytes(totalBytes),
  });

  let lastRaw = "";
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    hooks.onAttempt?.(attempt);
    const attemptStartedAt = Date.now();
    log.info("attempt start", {
      attempt,
      provider: transport.name,
      model: transport.model,
    });
    // Snapshot the prompts at each attempt so changes made via the
    // Settings page during a long-running extraction are picked up on
    // the retry.
    const { systemPrompt, userPrompt } = getSettings();
    const turns: Turn[] =
      attempt === 1
        ? [{ role: "user", text: userPrompt, includeImages: true }]
        : [
            { role: "user", text: userPrompt, includeImages: true },
            { role: "assistant", text: lastRaw },
            { role: "user", text: retryUserPrompt(lastError) },
          ];

    let raw: string;
    try {
      raw = await transport.call({
        systemPrompt,
        turns,
        images,
      });
    } catch (e) {
      if (e instanceof NonRetryableExtractionError) {
        log.error("non-retryable transport error", {
          attempt,
          message: e.message,
        });
        throw new Error(`${transport.name} extraction aborted: ${e.message}`);
      }
      log.error("transport error", {
        attempt,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
    lastRaw = raw;
    log.info("attempt response", {
      attempt,
      took: formatMs(Date.now() - attemptStartedAt),
      chars: raw.length,
    });

    hooks.onValidating?.();

    const json = stripFences(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      lastError = `Invalid JSON: ${(e as Error).message}`;
      log.warn("invalid json", { attempt, message: (e as Error).message });
      continue;
    }

    const result = ExtractedDrawingWire.safeParse(parsed);
    if (result.success) {
      const drawing = hydrateExtractedDrawing(result.data);
      log.info("extraction ok", {
        attempt,
        took: formatMs(Date.now() - attemptStartedAt),
        partNumber: drawing.partNumber,
        totalFibers: drawing.totalFibers,
        fibersPerConnector: drawing.fibersPerConnector,
        polarityType: drawing.polarityType,
        pairs: drawing.connectorPairs.length,
      });
      return {
        drawing,
        attempts: attempt,
        provider: transport.name,
        model: transport.model,
      };
    }
    lastError = JSON.stringify(result.error.issues, null, 2);
    log.warn("validation failed", {
      attempt,
      issues: result.error.issues.length,
    });
  }

  log.error("extraction gave up after 2 attempts");
  throw new Error(
    `${transport.name} extraction failed validation after 2 attempts. Last error:\n${lastError}\n\nLast raw response (first 500 chars):\n${lastRaw.slice(0, 500)}`,
  );
}

/**
 * Cleanup if the model wraps JSON in ```json fences. Falls back to
 * first-{ to last-} when no fence is found. Used by both providers'
 * outputs.
 */
function stripFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return (fenceMatch[1] ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
}
