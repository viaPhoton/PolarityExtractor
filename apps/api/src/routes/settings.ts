import { Router } from "express";
import {
  getPublicSettings,
  resetSettings,
  SettingsPatchSchema,
  updateSettings,
} from "../settings/store.js";

export const settingsRouter = Router();

/**
 * GET /settings - the current runtime configuration. API keys are
 * masked (never sent to the browser in plaintext) but `hasApiKey`
 * tells the UI whether one is set, and `apiKeyHint` shows the last
 * four characters as a "yep, it's the right one" cue.
 */
settingsRouter.get("/", (_req, res) => {
  res.json(getPublicSettings());
});

/**
 * PUT /settings - apply a partial update.
 *
 * For string fields (model, prompts, ...) any value sent overwrites
 * the current setting. For API keys an empty string is treated as "no
 * change" so the UI can omit untouched password fields without
 * accidentally clearing them. Send a non-empty value to update,
 * or use POST /reset to wipe everything back to env defaults.
 */
settingsRouter.put("/", (req, res) => {
  const parsed = SettingsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid settings patch",
      issues: parsed.error.issues,
    });
    return;
  }
  try {
    updateSettings(parsed.data);
    res.json(getPublicSettings());
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/**
 * POST /settings/reset - blow away the persisted settings.json and
 * fall back to the env-derived defaults.
 */
settingsRouter.post("/reset", (_req, res) => {
  resetSettings();
  res.json(getPublicSettings());
});
