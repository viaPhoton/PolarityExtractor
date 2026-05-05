import { Router } from "express";
import { getSession } from "../session/store.js";
import { validateDrawing } from "../polarity/validate.js";

export const sessionRouter = Router();

/**
 * GET /sessions/:id - status + optionally extracted data + page images.
 * The verification UI long-polls this endpoint until status leaves
 * "extracting".
 */
sessionRouter.get("/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json({
    sessionId: s.id,
    status: s.status,
    stage: s.stage,
    stageStartedAt: s.stageStartedAt,
    createdAt: s.createdAt,
    pdfFilename: s.pdfFilename,
    pageCount: s.pageCount,
    pagesRendered: s.pagesRendered,
    modelAttempts: s.modelAttempts,
    error: s.error,
    extracted: s.edited ?? s.extracted,
    validation: s.edited ?? s.extracted ? validateDrawing((s.edited ?? s.extracted)!) : [],
    outputFilename: s.outputFilename,
    fibersPerCable: s.fibersPerCable,
  });
});

/**
 * GET /sessions/:id/pages - the rendered PDF pages as data URLs.
 * Returned separately because they're large and the polling loop
 * shouldn't keep refetching them.
 */
sessionRouter.get("/:id/pages", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json({ pages: s.pageImages });
});
