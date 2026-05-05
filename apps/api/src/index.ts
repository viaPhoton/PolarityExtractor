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

async function main() {
  await ensureWorkDir();
  loadSettings();
  startJanitor();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

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
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[api] error:", err);
      res.status(500).json({ error: message });
    },
  );

  app.listen(config.port, () => {
    console.log(
      `[api] listening on http://localhost:${config.port} (provider=${getActiveProvider()}, model=${getActiveModel()})`,
    );
  });
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
