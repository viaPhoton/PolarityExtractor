import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ExtractedDrawing,
  PageImage,
  SessionStatus,
} from "@polarity/shared";
import { config } from "../config.js";

/**
 * Granular sub-step inside the broad `status` lifecycle. Surfaced to
 * the UI so the loading screen can show what's actually happening
 * (rendering pages, calling the model, retrying validation, ...).
 */
export type ExtractionStage =
  | "queued"
  | "rendering_pages"
  | "calling_model"
  | "retrying"
  | "validating"
  | "done";

export interface Session {
  id: string;
  status: SessionStatus;
  /** Granular extraction sub-step. Updated as the pipeline progresses. */
  stage: ExtractionStage;
  /** Wall-clock when the session was created (ms). */
  createdAt: number;
  /** Wall-clock when the current `stage` was entered (ms). */
  stageStartedAt: number;
  /** How many PDF pages have been rendered so far (0 for image uploads). */
  pagesRendered: number;
  /** Number of model attempts (1 = first try, 2 = retry after validation). */
  modelAttempts: number;
  /** Original filename of the uploaded source (PDF or image). */
  pdfFilename: string;
  /** Path to the saved upload on disk. */
  pdfPath: string;
  /** MIME type of the uploaded source as supplied by the browser. */
  mimeType: string;
  pageImages: PageImage[];
  pageCount: number | null;
  extracted: ExtractedDrawing | null;
  edited: ExtractedDrawing | null;
  /** Path to the generated combined test-plan file (single .txt). */
  outputPath: string | null;
  /** Filename of the generated test-plan file (basename of outputPath). */
  outputFilename: string | null;
  /** Total active fibers written into the generated file. */
  fibersPerCable: number | null;
  error: string | null;
}

const sessions = new Map<string, Session>();

export async function ensureWorkDir(): Promise<void> {
  await fs.mkdir(config.workDir, { recursive: true });
}

export async function createSession(
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<Session> {
  await ensureWorkDir();
  const id = randomUUID();
  const sessionDir = path.join(config.workDir, id);
  await fs.mkdir(sessionDir, { recursive: true });

  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const pdfPath = path.join(sessionDir, safeName);
  await fs.writeFile(pdfPath, buffer);

  const now = Date.now();
  const session: Session = {
    id,
    status: "uploaded",
    stage: "queued",
    createdAt: now,
    stageStartedAt: now,
    pagesRendered: 0,
    modelAttempts: 0,
    pdfFilename: filename,
    pdfPath,
    mimeType,
    pageImages: [],
    pageCount: null,
    extracted: null,
    edited: null,
    outputPath: null,
    outputFilename: null,
    fibersPerCable: null,
    error: null,
  };
  sessions.set(id, session);
  return session;
}

/**
 * Move a session to the next stage and reset the stage timer. Use this
 * everywhere stage changes happen so the UI's "elapsed in this step"
 * stays accurate.
 */
export function setStage(s: Session, stage: ExtractionStage): void {
  s.stage = stage;
  s.stageStartedAt = Date.now();
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function requireSession(id: string): Session {
  const s = sessions.get(id);
  if (!s) throw new Error(`Session not found: ${id}`);
  return s;
}

export async function deleteSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  const dir = path.dirname(s.pdfPath);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Periodic janitor: drops sessions older than 6 hours. */
export function startJanitor(): void {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.createdAt > SIX_HOURS) {
        void deleteSession(id);
      }
    }
  }, 30 * 60 * 1000).unref();
}
