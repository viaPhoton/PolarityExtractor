import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import { getSession } from "../session/store.js";
import { createLogger, formatBytes, shortId } from "../log.js";

export const downloadRouter = Router();
const log = createLogger("download");

/**
 * GET /download/:id - stream the single combined test-plan .txt file
 * generated for this session. Returns 404 if the file has not been
 * generated yet (POST /generate must run first).
 */
downloadRouter.get("/:id", (req, res) => {
  const s = getSession(req.params.id);
  if (!s) {
    log.warn("session not found", { session: shortId(req.params.id) });
    res.status(404).json({ error: "session not found" });
    return;
  }
  if (!s.outputPath || !fs.existsSync(s.outputPath)) {
    log.warn("test plan not generated", { session: shortId(s.id) });
    res.status(404).json({ error: "test plan not generated yet" });
    return;
  }
  const stat = fs.statSync(s.outputPath);
  log.info("serving", {
    session: shortId(s.id),
    filename: s.outputFilename,
    size: formatBytes(stat.size),
  });
  res.download(s.outputPath, s.outputFilename ?? path.basename(s.outputPath));
});
