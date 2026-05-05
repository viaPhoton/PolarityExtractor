import { create } from "zustand";
import type {
  ExtractedDrawing,
  PageImage,
  SessionStatus,
} from "@polarity/shared";
import type { ExtractionStage } from "@/lib/api.js";

export interface ExtractionProgress {
  stage: ExtractionStage;
  /** ms epoch when the current stage was entered. */
  stageStartedAt: number;
  /** ms epoch when the session was created (start of the whole pipeline). */
  startedAt: number;
  pageCount: number | null;
  pagesRendered: number;
  modelAttempts: number;
}

interface SessionState {
  sessionId: string | null;
  status: SessionStatus | "idle";
  pageCount: number | null;
  pages: PageImage[];
  pdfFilename: string | null;
  drawing: ExtractedDrawing | null;
  validation: { pairId: string; issues: string[] }[];
  acknowledged: boolean;
  error: string | null;
  /** Filename of the generated combined test-plan file. */
  outputFilename: string | null;
  /** Active fiber count covered by the generated file. */
  fibersPerCable: number | null;
  /** Live progress of the in-flight extraction. */
  progress: ExtractionProgress | null;
  provider: "anthropic" | "google" | null;
  model: string | null;

  setSessionId: (id: string) => void;
  setStatus: (s: SessionStatus | "idle") => void;
  setPages: (pages: PageImage[]) => void;
  setPageCount: (n: number | null) => void;
  setPdfFilename: (n: string | null) => void;
  setDrawing: (d: ExtractedDrawing | null) => void;
  setValidation: (v: { pairId: string; issues: string[] }[]) => void;
  setAcknowledged: (b: boolean) => void;
  setError: (e: string | null) => void;
  setOutputFilename: (n: string | null) => void;
  setFibersPerCable: (n: number | null) => void;
  setProgress: (p: ExtractionProgress | null) => void;
  setProvider: (p: "anthropic" | "google" | null) => void;
  setModel: (m: string | null) => void;

  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  sessionId: null,
  status: "idle",
  pageCount: null,
  pages: [],
  pdfFilename: null,
  drawing: null,
  validation: [],
  acknowledged: false,
  error: null,
  outputFilename: null,
  fibersPerCable: null,
  progress: null,
  provider: null,
  model: null,

  setSessionId: (id) => set({ sessionId: id }),
  setStatus: (s) => set({ status: s }),
  setPages: (pages) => set({ pages }),
  setPageCount: (n) => set({ pageCount: n }),
  setPdfFilename: (n) => set({ pdfFilename: n }),
  setDrawing: (d) => set({ drawing: d }),
  setValidation: (v) => set({ validation: v }),
  setAcknowledged: (b) => set({ acknowledged: b }),
  setError: (e) => set({ error: e }),
  setOutputFilename: (n) => set({ outputFilename: n }),
  setFibersPerCable: (n) => set({ fibersPerCable: n }),
  setProgress: (p) => set({ progress: p }),
  setProvider: (p) => set({ provider: p }),
  setModel: (m) => set({ model: m }),

  reset: () =>
    set((cur) => ({
      sessionId: null,
      status: "idle",
      pageCount: null,
      pages: [],
      pdfFilename: null,
      drawing: null,
      validation: [],
      acknowledged: false,
      error: null,
      outputFilename: null,
      fibersPerCable: null,
      progress: null,
      // Keep provider/model — they describe the server config, not the
      // session — so we avoid a refetch flicker between flows.
      provider: cur.provider,
      model: cur.model,
    })),
}));
