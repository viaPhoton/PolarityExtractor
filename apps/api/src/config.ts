import dotenv from "dotenv";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * Load .env from the nearest ancestor directory that contains one.
 * Supports both `.env` next to apps/api/package.json (per-app config)
 * and `.env` at the monorepo root (single source for all apps).
 */
function loadEnv(): void {
  const seen = new Set<string>();
  let dir = process.cwd();
  while (!seen.has(dir)) {
    seen.add(dir);
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadEnv();

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

/**
 * Static, env-only configuration. Anything tunable while the server is
 * running (provider, model, prompts, DPI, ...) lives in the runtime
 * settings store at apps/api/src/settings/store.ts and is editable via
 * the Settings page.
 */
export const config = {
  port: Number.parseInt(optional("PORT", "3000"), 10),
  workDir: path.join(os.tmpdir(), "polarity-app"),
};
