import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { uploadRouter } from "./routes/upload.js";
import { sessionRouter } from "./routes/session.js";
import { verifyRouter } from "./routes/verify.js";
import { generateRouter } from "./routes/generate.js";
import { downloadRouter } from "./routes/download.js";
import { settingsRouter } from "./routes/settings.js";
import { startJanitor, ensureWorkDir } from "./session/store.js";
import { getActiveModel, getActiveProvider, loadSettings } from "./settings/store.js";
import { createLogger, formatMs } from "./log.js";

const log = createLogger("api");

async function main() {
  await ensureWorkDir();
  loadSettings();
  startJanitor();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // HTTP access log: one line per request on completion. Health and
  // session-poll endpoints fire constantly while the verify page is
  // open, so they're logged at debug to keep `pnpm dev` quiet.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const noisy =
        req.path === "/health" ||
        (req.method === "GET" && req.path.startsWith("/sessions/"));
      const fields = {
        status,
        method: req.method,
        path: req.originalUrl,
        ms: formatMs(ms),
      };
      if (status >= 500) log.error("request failed", fields);
      else if (status >= 400) log.warn("request rejected", fields);
      else if (noisy) log.debug("request", fields);
      else log.info("request", fields);
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      provider: getActiveProvider(),
      model: getActiveModel(),
    });
  });

  app.use("/upload", uploadRouter);
  app.use("/sessions", sessionRouter);
  app.use("/verify", verifyRouter);
  app.use("/generate", generateRouter);
  app.use("/download", downloadRouter);
  app.use("/settings", settingsRouter);

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      log.error("unhandled error", {
        method: req.method,
        path: req.originalUrl,
        message,
      });
      if (stack) console.error(stack);
      res.status(500).json({ error: message });
    },
  );

  app.listen(config.port, () => {
    log.info("listening", {
      url: `http://localhost:${config.port}`,
      provider: getActiveProvider(),
      model: getActiveModel(),
      logLevel: process.env.LOG_LEVEL || "info",
    });
  });
}

main().catch((err) => {
  log.error("fatal startup error", {
    message: err instanceof Error ? err.message : String(err),
  });
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
