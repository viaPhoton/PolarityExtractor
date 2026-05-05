import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { getSession } from "../session/store.js";

export const downloadRouter = Router();

/**
 * GET /download/:id - stream the single combined test-plan .txt file
 * generated for this session. Returns 404 if the file has not been
 * generated yet (POST /generate must run first).
 */
downloadRouter.get("/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (!s.outputPath || !fs.existsSync(s.outputPath)) {
    res.status(404).json({ error: "test plan not generated yet" });
    return;
  }
  res.download(s.outputPath, s.outputFilename ?? path.basename(s.outputPath));
});
