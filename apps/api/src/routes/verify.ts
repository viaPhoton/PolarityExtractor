import { Router } from "express";
import { ExtractedDrawing, VerifyRequest } from "@polarity/shared";
import { requireSession } from "../session/store.js";
import { validateDrawing, hasBlockingIssues } from "../polarity/validate.js";

export const verifyRouter = Router();

/**
 * POST /verify - persist the user's edits to the in-memory session.
 * Re-runs validation and reports any blocking issues so the UI can
 * gate the "Approve & generate" button.
 */
verifyRouter.post("/", (req, res) => {
  const parsed = VerifyRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const s = requireSession(parsed.data.sessionId);
  // Re-validate with the canonical schema in case the client lied.
  const drawing = ExtractedDrawing.parse(parsed.data.edited);
  s.edited = drawing;
  const validation = validateDrawing(drawing);
  s.status = hasBlockingIssues(validation) ? "needs_verification" : "verified";
  res.json({
    sessionId: s.id,
    status: s.status,
    validation,
  });
});
