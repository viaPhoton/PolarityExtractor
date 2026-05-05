import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_PROMPT } from "../llm/prompts.js";
import {
  buildDefaultSettings,
  type ProviderName,
  type RuntimeSettings,
} from "./defaults.js";

/**
 * Settings persisted to disk. The file lives in the work dir so it
 * survives across `pnpm dev` restarts but doesn't pollute the repo.
 * Removing the file resets everything to env-derived defaults on the
 * next boot.
 */
const SETTINGS_FILE = path.join(config.workDir, "settings.json");

const ProviderSchema = z.enum(["anthropic", "google"]);

const SettingsSchema = z.object({
  provider: ProviderSchema,
  anthropic: z.object({
    apiKey: z.string().default(""),
    model: z.string().min(1),
  }),
  google: z.object({
    apiKey: z.string().default(""),
    model: z.string().min(1),
    thinkingBudget: z.number().int(),
  }),
  apiUrl: z.string().default(""),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(256).max(200_000),
  pdfRenderDpi: z.number().int().min(72).max(600),
  systemPrompt: z.string().min(1),
  userPrompt: z.string().min(1),
  // Default to "v0" so settings.json files written before the field
  // existed trigger the prompt-migration path on the next boot.
  promptVersion: z.string().default("v0"),
});

export const SettingsPatchSchema = z.object({
  provider: ProviderSchema.optional(),
  anthropic: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().min(1).optional(),
    })
    .partial()
    .optional(),
  google: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().min(1).optional(),
      thinkingBudget: z.number().int().optional(),
    })
    .partial()
    .optional(),
  apiUrl: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(256).max(200_000).optional(),
  pdfRenderDpi: z.number().int().min(72).max(600).optional(),
  systemPrompt: z.string().min(1).optional(),
  userPrompt: z.string().min(1).optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

let current: RuntimeSettings = buildDefaultSettings();

/** Load settings.json into memory if it exists. Idempotent. */
export function loadSettings(): void {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      current = buildDefaultSettings();
      return;
    }
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const validated = SettingsSchema.safeParse(parsed);
    if (validated.success) {
      current = migratePrompts(validated.data);
    } else {
      console.error(
        "[settings] settings.json failed validation, falling back to defaults:\n",
        validated.error.issues,
      );
      current = buildDefaultSettings();
    }
  } catch (e) {
    console.error("[settings] failed to load settings.json:", e);
    current = buildDefaultSettings();
  }
}

/**
 * Replace stale prompts with the current code defaults when the
 * persisted `promptVersion` doesn't match the live `PROMPT_VERSION`.
 * Other settings (API keys, models, temperature, ...) are preserved
 * untouched so users don't lose their configuration on upgrades.
 *
 * Persists the migrated settings back to disk so subsequent boots are
 * a no-op until the next prompt-schema change.
 */
function migratePrompts(loaded: RuntimeSettings): RuntimeSettings {
  if (loaded.promptVersion === PROMPT_VERSION) return loaded;
  console.warn(
    `[settings] migrating prompts ${loaded.promptVersion} -> ${PROMPT_VERSION} (resetting systemPrompt + userPrompt to current defaults)`,
  );
  const migrated: RuntimeSettings = {
    ...loaded,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: USER_PROMPT,
    promptVersion: PROMPT_VERSION,
  };
  current = migrated;
  persist();
  return migrated;
}

export function getSettings(): RuntimeSettings {
  return current;
}

/**
 * Apply a partial update. For string fields, an empty string means
 * "leave unchanged" (used for API keys: the UI sends "" when the user
 * didn't type a new key into the password input).
 *
 * Returns the new settings.
 */
export function updateSettings(patch: SettingsPatch): RuntimeSettings {
  const next: RuntimeSettings = {
    ...current,
    ...(patch.provider ? { provider: patch.provider } : {}),
    anthropic: {
      ...current.anthropic,
      ...(patch.anthropic?.model ? { model: patch.anthropic.model } : {}),
      ...(patch.anthropic?.apiKey !== undefined && patch.anthropic.apiKey !== ""
        ? { apiKey: patch.anthropic.apiKey }
        : {}),
    },
    google: {
      ...current.google,
      ...(patch.google?.model ? { model: patch.google.model } : {}),
      ...(patch.google?.apiKey !== undefined && patch.google.apiKey !== ""
        ? { apiKey: patch.google.apiKey }
        : {}),
      ...(patch.google?.thinkingBudget !== undefined
        ? { thinkingBudget: patch.google.thinkingBudget }
        : {}),
    },
    ...(patch.apiUrl !== undefined ? { apiUrl: patch.apiUrl } : {}),
    ...(patch.temperature !== undefined ? { temperature: patch.temperature } : {}),
    ...(patch.maxOutputTokens !== undefined
      ? { maxOutputTokens: patch.maxOutputTokens }
      : {}),
    ...(patch.pdfRenderDpi !== undefined
      ? { pdfRenderDpi: patch.pdfRenderDpi }
      : {}),
    ...(patch.systemPrompt ? { systemPrompt: patch.systemPrompt } : {}),
    ...(patch.userPrompt ? { userPrompt: patch.userPrompt } : {}),
  };
  current = SettingsSchema.parse(next);
  persist();
  return current;
}

/** Reset to env-derived defaults. */
export function resetSettings(): RuntimeSettings {
  current = buildDefaultSettings();
  persist();
  return current;
}

/** Convenience: API key for the active provider, or throw if missing. */
export function requireActiveApiKey(): string {
  const s = current;
  const k = s.provider === "anthropic" ? s.anthropic.apiKey : s.google.apiKey;
  if (k && k.trim()) return k;
  const envName = s.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GOOGLE_API_KEY";
  throw new Error(
    `Missing API key for provider=${s.provider}. Set it in the Settings page or via ${envName} / AI_API_KEY in .env.`,
  );
}

/** Convenience: model id for the active provider. */
export function getActiveModel(): string {
  const s = current;
  return s.provider === "anthropic" ? s.anthropic.model : s.google.model;
}

/** Throw a user-friendly error if the active provider has no key. */
export function assertActiveProviderKey(): void {
  requireActiveApiKey();
}

export function getActiveProvider(): ProviderName {
  return current.provider;
}

function persist(): void {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify(current, null, 2),
      "utf-8",
    );
  } catch (e) {
    console.error("[settings] failed to persist settings.json:", e);
  }
}

/**
 * Public, key-redacted snapshot for the GET /settings response. We
 * never want to ship raw API keys to the browser (or leak them via
 * screenshots). Instead we return whether each provider has a key set
 * plus the last 4 characters as a "yep, it's the right one" hint.
 */
export interface PublicSettings {
  provider: ProviderName;
  anthropic: { model: string; hasApiKey: boolean; apiKeyHint: string };
  google: {
    model: string;
    thinkingBudget: number;
    hasApiKey: boolean;
    apiKeyHint: string;
  };
  apiUrl: string;
  temperature: number;
  maxOutputTokens: number;
  pdfRenderDpi: number;
  systemPrompt: string;
  userPrompt: string;
}

export function getPublicSettings(): PublicSettings {
  const s = current;
  return {
    provider: s.provider,
    anthropic: {
      model: s.anthropic.model,
      hasApiKey: Boolean(s.anthropic.apiKey),
      apiKeyHint: maskKey(s.anthropic.apiKey),
    },
    google: {
      model: s.google.model,
      thinkingBudget: s.google.thinkingBudget,
      hasApiKey: Boolean(s.google.apiKey),
      apiKeyHint: maskKey(s.google.apiKey),
    },
    apiUrl: s.apiUrl,
    temperature: s.temperature,
    maxOutputTokens: s.maxOutputTokens,
    pdfRenderDpi: s.pdfRenderDpi,
    systemPrompt: s.systemPrompt,
    userPrompt: s.userPrompt,
  };
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `••••${key.slice(-4)}`;
}
