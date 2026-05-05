import { SYSTEM_PROMPT, USER_PROMPT } from "../llm/prompts.js";

export type ProviderName = "anthropic" | "google";

export interface RuntimeSettings {
  /** Which vision LLM to use for the next extraction. */
  provider: ProviderName;
  anthropic: {
    apiKey: string;
    model: string;
  };
  google: {
    apiKey: string;
    model: string;
    /**
     * Gemini 2.5 thinking budget. 0 = disabled (fastest), -1 = automatic,
     * N = cap at N tokens. Pro IGNORES 0; for Pro use a small positive
     * value (e.g. 256).
     */
    thinkingBudget: number;
  };
  /**
   * Optional override for the provider's HTTP endpoint. Leave empty to
   * use each SDK's built-in default.
   */
  apiUrl: string;
  /** Sampling temperature. 0 = deterministic; we recommend keeping it 0. */
  temperature: number;
  /** Max output tokens for a single model call. */
  maxOutputTokens: number;
  /** DPI used when rendering PDF pages to PNG before extraction. */
  pdfRenderDpi: number;
  /** System prompt sent on every extraction. */
  systemPrompt: string;
  /** User prompt sent alongside the rendered drawing pages. */
  userPrompt: string;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-7";
export const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";

/**
 * Build the initial settings from environment variables. Used the very
 * first time the server boots (before settings.json exists) and as the
 * "Reset to defaults" target. Honours both the unified AI_* env vars
 * and the legacy provider-specific ones.
 */
export function buildDefaultSettings(): RuntimeSettings {
  const provider = parseProvider(
    pickEnv("AI_PROVIDER", "LLM_PROVIDER") || "anthropic",
  );
  const anthropicKey = pickEnv("ANTHROPIC_API_KEY") || (provider === "anthropic" ? pickEnv("AI_API_KEY") : "");
  const googleKey = pickEnv("GOOGLE_API_KEY") || (provider === "google" ? pickEnv("AI_API_KEY") : "");
  const anthropicModel =
    pickEnv("ANTHROPIC_MODEL") ||
    (provider === "anthropic" ? pickEnv("AI_MODEL") : "") ||
    DEFAULT_ANTHROPIC_MODEL;
  const googleModel =
    pickEnv("GOOGLE_MODEL") ||
    (provider === "google" ? pickEnv("AI_MODEL") : "") ||
    DEFAULT_GOOGLE_MODEL;
  const apiUrl = pickEnv("AI_API_URL");
  const thinkingBudget = parseIntOr(pickEnv("AI_THINKING_BUDGET"), 0);
  const pdfRenderDpi = parseIntOr(pickEnv("PDF_RENDER_DPI"), 150);

  return {
    provider,
    anthropic: { apiKey: anthropicKey, model: anthropicModel },
    google: { apiKey: googleKey, model: googleModel, thinkingBudget },
    apiUrl,
    temperature: 0,
    // 32K is the smallest "comfortably enough" cap that works for the
    // big drawings (288F+, where the strict-per-fiber JSON expands to
    // ~25K output tokens). It's also the hard ceiling for Claude Opus
    // 4, so it's safe across both providers. Gemini 2.5 supports up to
    // 65K — bump via the Settings page if a future drawing needs it.
    maxOutputTokens: 32_000,
    pdfRenderDpi,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
  };
}

function pickEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim() !== "") return v;
  }
  return "";
}

function parseIntOr(s: string, fallback: number): number {
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseProvider(raw: string): ProviderName {
  const v = raw.trim().toLowerCase();
  if (v === "anthropic" || v === "claude") return "anthropic";
  if (v === "google" || v === "gemini") return "google";
  throw new Error(
    `Invalid AI_PROVIDER=${raw}. Expected one of: anthropic, claude, google, gemini.`,
  );
}
