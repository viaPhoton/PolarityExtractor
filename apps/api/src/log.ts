/**
 * Tiny structured logger for the API. Designed for `pnpm dev` monitoring
 * — every line is one row of `[HH:MM:SS.mmm] LEVEL [scope] message
 * key=value …`, which sorts well, greps well, and stays readable when
 * pnpm prefixes each line with `apps/api dev:`.
 *
 * Usage:
 *   const log = createLogger("upload");
 *   log.info("session created", { sessionId, file: name, sizeKB });
 *
 * Levels are filtered by the `LOG_LEVEL` env var (debug/info/warn/error,
 * default = info). The HTTP middleware in `index.ts` also routes 5xx
 * responses through `error()` so failures stand out.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const threshold =
  LEVEL_RANK[envLevel as Level] ?? LEVEL_RANK.info;

const LEVEL_PAINT: Record<Level, (s: string) => string> = {
  debug: (s) => `\x1b[90m${s}\x1b[0m`,
  info: (s) => s,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  error: (s) => `\x1b[31m${s}\x1b[0m`,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}
function timestamp(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
    d.getSeconds(),
  )}.${pad3(d.getMilliseconds())}`;
}

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") {
    return /[\s"=]/.test(v) ? JSON.stringify(v) : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Error) return JSON.stringify(v.message);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function formatExtras(extras?: Record<string, unknown>): string {
  if (!extras) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(extras)) {
    if (v === undefined) continue;
    parts.push(`${k}=${formatValue(v)}`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export interface Logger {
  debug(msg: string, extras?: Record<string, unknown>): void;
  info(msg: string, extras?: Record<string, unknown>): void;
  warn(msg: string, extras?: Record<string, unknown>): void;
  error(msg: string, extras?: Record<string, unknown>): void;
  /** Create a sub-scope, e.g. `log.child("session=abc12345")`. */
  child(subScope: string): Logger;
}

function emit(
  scope: string,
  level: Level,
  msg: string,
  extras?: Record<string, unknown>,
): void {
  if (LEVEL_RANK[level] < threshold) return;
  const tag = level.toUpperCase().padEnd(5);
  const line = `[${timestamp()}] ${tag} [${scope}] ${msg}${formatExtras(extras)}`;
  const painted = LEVEL_PAINT[level](line);
  if (level === "error") console.error(painted);
  else if (level === "warn") console.warn(painted);
  else console.log(painted);
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, extras) => emit(scope, "debug", msg, extras),
    info: (msg, extras) => emit(scope, "info", msg, extras),
    warn: (msg, extras) => emit(scope, "warn", msg, extras),
    error: (msg, extras) => emit(scope, "error", msg, extras),
    child: (sub) => createLogger(`${scope}/${sub}`),
  };
}

/* ------------------------------------------------------------------ */
/* Convenience helpers used across the codebase                       */
/* ------------------------------------------------------------------ */

/** Short session id for log lines (first 8 chars of the UUID). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}
