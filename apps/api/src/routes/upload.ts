import { Router } from "express";
import multer from "multer";
import { createSession, requireSession, setStage } from "../session/store.js";
import { prepareSource, ACCEPTED_MIME_TYPES, detectMediaType } from "../source/prepare.js";
import { toPageImage } from "../source/types.js";
import { extractDrawing } from "../llm/extract.js";
import { validateDrawing, hasBlockingIssues } from "../polarity/validate.js";
import { assertActiveProviderKey, getSettings } from "../settings/store.js";
import { createLogger, formatBytes, formatMs, shortId } from "../log.js";

export const uploadRouter = Router();
const log = createLogger("upload");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mt = detectMediaType({
      filename: file.originalname,
      filePath: "",
      mimeType: file.mimetype,
    });
    if (ACCEPTED_MIME_TYPES.includes(mt)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype || "unknown"} (${file.originalname}). Accepted: PDF, PNG, JPEG, WebP, GIF.`,
        ),
      );
    }
  },
});

/**
 * POST /upload — accepts a single file under either field name "pdf"
 * (legacy) or "file" (preferred for non-PDF uploads). The body may be
 * a PDF or any supported image format; prepareSource handles the
 * dispatch.
 */
uploadRouter.post(
  "/",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const file = pickFile(req);
      if (!file) {
        res.status(400).json({
          error: "missing upload (expected field 'file' or 'pdf')",
        });
        return;
      }
      try {
        assertActiveProviderKey();
      } catch (e) {
        res
          .status(500)
          .json({ error: e instanceof Error ? e.message : String(e) });
        return;
      }
      const session = await createSession(
        file.originalname || "drawing",
        file.buffer,
        file.mimetype || "application/octet-stream",
      );
      log.info("session created", {
        session: shortId(session.id),
        file: session.pdfFilename,
        mime: session.mimeType,
        size: formatBytes(file.size),
      });
      res.json({ sessionId: session.id });

      // Kick off extraction asynchronously. Errors are stored on the
      // session and surfaced via /sessions/:id.
      void runExtraction(session.id).catch((e) => {
        const s = requireSession(session.id);
        s.status = "error";
        s.stage = "done";
        s.error = e instanceof Error ? e.message : String(e);
        log.error("extraction failed", {
          session: shortId(session.id),
          message: e instanceof Error ? e.message : String(e),
        });
        if (e instanceof Error && e.stack) console.error(e.stack);
      });
    } catch (e) {
      next(e);
    }
  },
);

function pickFile(req: import("express").Request): Express.Multer.File | undefined {
  const files = req.files as
    | { file?: Express.Multer.File[]; pdf?: Express.Multer.File[] }
    | undefined;
  return files?.file?.[0] ?? files?.pdf?.[0] ?? req.file;
}

async function runExtraction(sessionId: string): Promise<void> {
  const s = requireSession(sessionId);
  const sessionTag = shortId(sessionId);
  const startedAt = Date.now();
  s.status = "extracting";
  setStage(s, "rendering_pages");
  log.info("extraction start", { session: sessionTag, file: s.pdfFilename });

  const pages = await prepareSource(
    {
      filename: s.pdfFilename,
      filePath: s.pdfPath,
      mimeType: s.mimeType,
    },
    getSettings().pdfRenderDpi,
    {
      onTotal: (total) => {
        s.pageCount = total;
      },
      onPage: (rendered) => {
        s.pagesRendered = rendered;
      },
    },
  );
  // For non-PDF uploads pageCount may not have been set by onTotal.
  s.pageCount = pages.length;
  s.pagesRendered = pages.length;
  s.pageImages = pages.map(toPageImage);

  setStage(s, "calling_model");
  const { drawing, attempts, provider, model } = await extractDrawing(pages, {
    onAttempt: (attempt) => {
      s.modelAttempts = attempt;
      setStage(s, attempt === 1 ? "calling_model" : "retrying");
    },
    onValidating: () => {
      setStage(s, "validating");
    },
  });
  s.extracted = drawing;
  s.edited = drawing;
  s.status = "needs_verification";
  setStage(s, "done");

  const validation = validateDrawing(drawing);
  const failingPairs = validation.filter((v) => v.issues.length > 0).length;
  log.info("extraction done", {
    session: sessionTag,
    provider,
    model,
    attempts,
    pairs: drawing.connectorPairs.length,
    fibers: drawing.totalFibers,
    polarity: drawing.polarityType,
    blocking: hasBlockingIssues(validation),
    failingPairs,
    took: formatMs(Date.now() - startedAt),
  });
}
