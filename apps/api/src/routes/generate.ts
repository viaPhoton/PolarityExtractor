import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireSession } from "../session/store.js";
import { generateTestPlan } from "../inject/output.js";
import { hasBlockingIssues, validateDrawing } from "../polarity/validate.js";

export const generateRouter = Router();

const GenerateRequest = z.object({ sessionId: z.string() });

/**
 * POST /generate - build ONE combined test-plan file covering every
 * fiber across every connector pair, validate it, write it to disk,
 * and record the path on the session. The browser then GETs
 * /download/:id to stream the file.
 */
generateRouter.post("/", async (req, res, next) => {
  try {
    const parsed = GenerateRequest.parse(req.body);
    const s = requireSession(parsed.sessionId);
    const drawing = s.edited ?? s.extracted;
    if (!drawing) {
      res.status(400).json({ error: "session has no extracted drawing" });
      return;
    }
    const validation = validateDrawing(drawing);
    if (hasBlockingIssues(validation)) {
      res.status(400).json({
        error: "Cannot generate: validation issues remain",
        validation,
      });
      return;
    }

    s.status = "generating";
    const sessionDir = path.dirname(s.pdfPath);
    const result = await generateTestPlan(sessionDir, drawing);
    s.outputPath = result.filePath;
    s.outputFilename = result.filename;
    s.fibersPerCable = result.fibersPerCable;
    s.status = "ready";

    res.json({
      sessionId: s.id,
      filename: result.filename,
      fibersPerCable: result.fibersPerCable,
    });
  } catch (e) {
    next(e);
  }
});
