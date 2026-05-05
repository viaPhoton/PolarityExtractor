import type {
  ExtractedDrawing,
  PageImage,
  SessionStatus,
} from "@polarity/shared";

const BASE = "/api";

export interface HealthResponse {
  ok: boolean;
  provider: "anthropic" | "google";
  model: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export type ProviderName = "anthropic" | "google";

export interface SettingsResponse {
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

/**
 * Partial update payload. Anything omitted is left unchanged.
 * For API keys, an empty string is also treated as "leave unchanged"
 * so the form can always send the current state without clearing
 * passwords the user didn't retype.
 */
export interface SettingsPatch {
  provider?: ProviderName;
  anthropic?: { apiKey?: string; model?: string };
  google?: { apiKey?: string; model?: string; thinkingBudget?: number };
  apiUrl?: string;
  temperature?: number;
  maxOutputTokens?: number;
  pdfRenderDpi?: number;
  systemPrompt?: string;
  userPrompt?: string;
}

export async function getSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${BASE}/settings`);
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export async function updateSettings(
  patch: SettingsPatch,
): Promise<SettingsResponse> {
  const res = await fetch(`${BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export async function resetSettings(): Promise<SettingsResponse> {
  const res = await fetch(`${BASE}/settings/reset`, { method: "POST" });
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export type ExtractionStage =
  | "queued"
  | "rendering_pages"
  | "calling_model"
  | "retrying"
  | "validating"
  | "done";

export interface SessionResponse {
  sessionId: string;
  status: SessionStatus;
  stage: ExtractionStage;
  /** Wall-clock when the current `stage` was entered (ms epoch). */
  stageStartedAt: number;
  /** Wall-clock when the session was created (ms epoch). */
  createdAt: number;
  pdfFilename: string;
  pageCount: number | null;
  pagesRendered: number;
  modelAttempts: number;
  error: string | null;
  extracted: ExtractedDrawing | null;
  validation: { pairId: string; issues: string[] }[];
  outputFilename: string | null;
  fibersPerCable: number | null;
}

/**
 * Upload a PDF or image file. The server's multer handler accepts the
 * "file" field (preferred) and also "pdf" (legacy) for back-compat.
 */
export async function uploadFile(file: File): Promise<{ sessionId: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

/** @deprecated Use {@link uploadFile}. Kept for any external callers. */
export const uploadPdf = uploadFile;

export async function getSession(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export async function getPages(
  sessionId: string,
): Promise<{ pages: PageImage[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/pages`);
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export async function postVerify(
  sessionId: string,
  edited: ExtractedDrawing,
): Promise<{
  sessionId: string;
  status: SessionStatus;
  validation: { pairId: string; issues: string[] }[];
}> {
  const res = await fetch(`${BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, edited }),
  });
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export async function postGenerate(
  sessionId: string,
): Promise<{ sessionId: string; filename: string; fibersPerCable: number }> {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(await safeError(res));
  return res.json();
}

export function downloadUrl(sessionId: string): string {
  return `${BASE}/download/${sessionId}`;
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (typeof j?.error === "string") return j.error;
    return JSON.stringify(j);
  } catch {
    return res.statusText;
  }
}
