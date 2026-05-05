import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertCircle,
  Brain,
  CheckCircle2,
  CircleDot,
  FileImage,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type {
  ConnectorPair,
  ExtractedDrawing,
  PolarityType,
  CoreSize,
  EndFaceGeometry,
} from "@polarity/shared";
import { getPages, getSession, postGenerate, postVerify } from "@/lib/api.js";
import { useSession, type ExtractionProgress } from "@/store/session.js";
import { PdfViewer } from "@/components/PdfViewer.js";
import { PolarityGrid } from "@/components/PolarityGrid.js";
import { PolarityDiagram } from "@/components/PolarityDiagram.js";
import { cn } from "@/lib/cn.js";

const POLL_MS = 1500;

export default function VerifyPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const setSessionId = useSession((s) => s.setSessionId);
  const status = useSession((s) => s.status);
  const setStatus = useSession((s) => s.setStatus);
  const drawing = useSession((s) => s.drawing);
  const setDrawing = useSession((s) => s.setDrawing);
  const validation = useSession((s) => s.validation);
  const setValidation = useSession((s) => s.setValidation);
  const pages = useSession((s) => s.pages);
  const setPages = useSession((s) => s.setPages);
  const acknowledged = useSession((s) => s.acknowledged);
  const setAcknowledged = useSession((s) => s.setAcknowledged);
  const error = useSession((s) => s.error);
  const setError = useSession((s) => s.setError);
  const setOutputFilename = useSession((s) => s.setOutputFilename);
  const setFibersPerCable = useSession((s) => s.setFibersPerCable);
  const setProgress = useSession((s) => s.setProgress);

  const originalRef = useRef<ExtractedDrawing | null>(null);
  const [generating, setGenerating] = useState(false);

  // Initial load + polling.
  useEffect(() => {
    if (!sessionId) return;
    setSessionId(sessionId);
    let cancelled = false;
    let pollHandle: number | null = null;
    let pagesLoaded = false;

    async function tick() {
      try {
        const s = await getSession(sessionId);
        if (cancelled) return;
        setStatus(s.status);
        setProgress({
          stage: s.stage,
          stageStartedAt: s.stageStartedAt,
          startedAt: s.createdAt,
          pageCount: s.pageCount,
          pagesRendered: s.pagesRendered,
          modelAttempts: s.modelAttempts,
        });
        if (s.error) setError(s.error);
        if (s.extracted) {
          if (!originalRef.current) originalRef.current = s.extracted;
          setDrawing(s.extracted);
          setValidation(s.validation);
        }
        if (
          (s.status === "needs_verification" || s.status === "verified") &&
          !pagesLoaded
        ) {
          pagesLoaded = true;
          const { pages: p } = await getPages(sessionId);
          if (!cancelled) setPages(p);
        }
        if (s.status === "extracting" || s.status === "uploaded") {
          pollHandle = window.setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    void tick();
    return () => {
      cancelled = true;
      if (pollHandle != null) window.clearTimeout(pollHandle);
    };
  }, [sessionId, setSessionId, setStatus, setDrawing, setValidation, setPages, setError, setProgress]);

  const blocking = useMemo(
    () => validation.some((v) => v.issues.length > 0),
    [validation],
  );

  if (status === "extracting" || status === "uploaded" || (!drawing && !error)) {
    return <ExtractionPending />;
  }

  if (error || status === "error") {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-3 px-6">
        <AlertCircle className="h-8 w-8 text-rose-600" />
        <div className="text-base font-medium text-slate-900">
          Extraction failed
        </div>
        <pre className="max-w-xl whitespace-pre-wrap rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          {error}
        </pre>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800"
        >
          Try another drawing
        </button>
      </div>
    );
  }

  if (!drawing) return null;

  // All connector pairs in a trunk share the same polarity, so we
  // edit one representative pair and broadcast the fiber map to every
  // other pair (preserving each pair's distinct legId / breakout
  // metadata). This collapses the historical per-pair selector down
  // to a single editor.
  const representativePair = drawing.connectorPairs[0];

  function patchDrawing(patch: Partial<ExtractedDrawing>) {
    const next = { ...drawing!, ...patch };
    setDrawing(next);
    void postVerify(sessionId, next)
      .then((r) => {
        setStatus(r.status);
        setValidation(r.validation);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  function patchPolarity(next: ConnectorPair) {
    const pairs = drawing!.connectorPairs.map((p) => ({
      ...p,
      fibers: next.fibers.map((f) => ({ ...f })),
    }));
    patchDrawing({ connectorPairs: pairs });
  }

  function resetPolarity() {
    if (!originalRef.current) return;
    const origFibers = originalRef.current.connectorPairs[0]?.fibers;
    if (!origFibers) return;
    const pairs = drawing!.connectorPairs.map((p) => ({
      ...p,
      fibers: origFibers.map((f) => ({ ...f })),
    }));
    patchDrawing({ connectorPairs: pairs });
  }

  async function approveAndGenerate() {
    setGenerating(true);
    setError(null);
    try {
      // Persist latest edits first.
      await postVerify(sessionId, drawing!);
      const r = await postGenerate(sessionId);
      setOutputFilename(r.filename);
      setFibersPerCable(r.fibersPerCable);
      navigate(`/download/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    // Use flex (not grid) so we can give each column a hard height cap
    // (`min-h-0 overflow-hidden`). Without this, the LEFT column's PDF
    // image expands the row taller than the viewport and the RIGHT
    // column's approval bar gets clipped under main's overflow-hidden.
    <div className="flex h-full min-h-0">
      <section className="flex h-full min-h-0 w-1/2 min-w-0 flex-col overflow-hidden border-r border-slate-200">
        <PdfViewer pages={pages} />
      </section>
      <section className="flex h-full min-h-0 w-1/2 min-w-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to upload
            </Link>
          </div>
          <SummaryHeader drawing={drawing} onChange={(p) => patchDrawing(p)} />
          {representativePair && (
            <div className="mt-5 grid grid-cols-1 gap-5">
              <div className="rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                All {drawing.connectorPairs.length} connector pairs share the
                same polarity. Edits here apply to every pair.
              </div>
              <PolarityGrid
                pair={representativePair}
                onChange={patchPolarity}
                onReset={resetPolarity}
              />
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-slate-800">
                  Polarity diagram
                </div>
                <PolarityDiagram
                  pair={representativePair}
                  shellSize={shellSize(representativePair, drawing.fibersPerConnector)}
                />
                <ValidationSummary validation={validation} />
              </div>
            </div>
          )}
          {drawing.notes && drawing.notes.length > 0 && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-1 font-medium">Extraction notes</div>
              <ul className="list-inside list-disc space-y-1">
                {drawing.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <ApprovalBar
          blocking={blocking}
          acknowledged={acknowledged}
          onAck={setAcknowledged}
          onApprove={approveAndGenerate}
          generating={generating}
        />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const STAGES = [
  {
    id: "rendering_pages",
    icon: FileImage,
    title: "Rendering drawing pages",
    description: "Converting each PDF page to a high-resolution PNG so the model can see it.",
  },
  {
    id: "calling_model",
    icon: Brain,
    title: "Reading the polarity table",
    description: "Sending the pages to the vision model and waiting for structured JSON.",
  },
  {
    id: "retrying",
    icon: Brain,
    title: "Re-asking the model",
    description: "First response didn't pass validation. Showing the model the error and retrying.",
  },
  {
    id: "validating",
    icon: ShieldCheck,
    title: "Validating the response",
    description: "Parsing the JSON and checking colors, positions, and Type-A/B/C rules.",
  },
] as const;

const VISIBLE_STAGES = STAGES.filter((s) => s.id !== "retrying");

const TIPS = [
  "Type-A keeps positions in order; Type-B mirrors them across the centre; Type-C swaps adjacent pairs.",
  "Base-8 connectors physically use a 12-position MTP shell — positions 5-8 are dark.",
  "TIA-598 colour order: blue, orange, green, brown, slate, white, red, black, yellow, violet, rose, aqua.",
  "A 288F trunk with Base-8 connectors has 36 connector pairs, each carrying 8 live fibers.",
  "Set AI_THINKING_BUDGET=0 to disable Gemini's reasoning tokens for the fastest responses.",
  "Lower PDF_RENDER_DPI (e.g. 120) to speed up extraction on simple, high-contrast drawings.",
] as const;

function ExtractionPending() {
  const provider = useSession((s) => s.provider);
  const model = useSession((s) => s.model);
  const progress = useSession((s) => s.progress);
  const providerLabel =
    provider === "google" ? "Gemini" : provider === "anthropic" ? "Claude" : "the LLM";

  const startedAt = progress?.startedAt ?? Date.now();
  const elapsedMs = useElapsed(startedAt);
  const tip = useRollingTip();

  const activeStage = progress?.stage ?? "queued";
  const stageIndex = VISIBLE_STAGES.findIndex((s) => stageMatches(s.id, activeStage));
  // "retrying" surfaces alongside calling_model; treat queued as rendering.
  const effectiveIndex = stageIndex === -1
    ? activeStage === "queued"
      ? 0
      : VISIBLE_STAGES.length - 1
    : stageIndex;
  const isRetry = activeStage === "retrying";

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <div>
            <div className="text-base font-semibold text-slate-900">
              Extracting polarity map…
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {providerLabel}
              {model ? <> · <span className="font-mono">{model}</span></> : null}
              {" · "}
              <span className="tabular-nums">{formatElapsed(elapsedMs)} elapsed</span>
            </div>
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {VISIBLE_STAGES.map((stage, i) => {
            const status: "done" | "active" | "pending" =
              i < effectiveIndex
                ? "done"
                : i === effectiveIndex
                  ? "active"
                  : "pending";
            return (
              <StageRow
                key={stage.id}
                icon={stage.icon}
                title={stage.title}
                description={
                  isRetry && stage.id === "calling_model"
                    ? "First response failed validation — re-asking the model with the error."
                    : stage.description
                }
                status={status}
                detail={detailFor(stage.id, progress)}
              />
            );
          })}
        </ol>

        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <span className="font-medium">Tip · </span>
          {tip}
        </div>
      </div>
    </div>
  );
}

function StageRow({
  icon: Icon,
  title,
  description,
  status,
  detail,
}: {
  icon: typeof FileImage;
  title: string;
  description: string;
  status: "done" | "active" | "pending";
  detail?: string | null;
}) {
  return (
    <li className="flex items-start gap-3">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border",
          status === "done" && "border-emerald-200 bg-emerald-50 text-emerald-600",
          status === "active" && "border-indigo-200 bg-indigo-50 text-indigo-600",
          status === "pending" && "border-slate-200 bg-slate-50 text-slate-400",
        )}
      >
        {status === "done" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : status === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-medium",
            status === "pending" ? "text-slate-400" : "text-slate-900",
          )}
        >
          {title}
          {detail ? (
            <span
              className={cn(
                "ml-2 rounded px-1.5 py-0.5 font-mono text-[10px]",
                status === "active"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600",
              )}
            >
              {detail}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-0.5 text-xs",
            status === "pending" ? "text-slate-400" : "text-slate-500",
          )}
        >
          {description}
        </div>
      </div>
      {status === "pending" ? (
        <CircleDot className="mt-2 h-3 w-3 flex-shrink-0 text-slate-200" />
      ) : null}
    </li>
  );
}

function stageMatches(rowId: string, active: string): boolean {
  if (rowId === "calling_model") return active === "calling_model" || active === "retrying";
  return rowId === active;
}

function detailFor(
  stageId: (typeof VISIBLE_STAGES)[number]["id"],
  p: ExtractionProgress | null,
): string | null {
  if (!p) return null;
  if (stageId === "rendering_pages") {
    if (p.pageCount && p.pageCount > 1) {
      return `${p.pagesRendered}/${p.pageCount} pages`;
    }
    return null;
  }
  if (stageId === "calling_model" && p.modelAttempts > 1) {
    return `attempt ${p.modelAttempts}`;
  }
  return null;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(handle);
  }, []);
  return now - startedAt;
}

function useRollingTip(): string {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const handle = window.setInterval(
      () => setIdx((i) => (i + 1) % TIPS.length),
      6000,
    );
    return () => window.clearInterval(handle);
  }, []);
  return TIPS[idx]!;
}

function SummaryHeader({
  drawing,
  onChange,
}: {
  drawing: ExtractedDrawing;
  onChange: (p: Partial<ExtractedDrawing>) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{drawing.documentNumber}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">
        {drawing.description}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Chip
          label="Part #"
          value={drawing.partNumber}
          onChange={(v) => onChange({ partNumber: v })}
        />
        <Chip
          label="Total fibers"
          value={String(drawing.totalFibers)}
          onChange={(v) =>
            onChange({ totalFibers: Number.parseInt(v || "0", 10) })
          }
        />
        <Chip
          label="Fibers / conn"
          value={String(drawing.fibersPerConnector)}
          onChange={(v) =>
            onChange({ fibersPerConnector: Number.parseInt(v || "0", 10) })
          }
        />
        <ChipSelect
          label="Polarity"
          value={drawing.polarityType}
          options={["A", "B", "C", "U", "CUSTOM"]}
          onChange={(v) => onChange({ polarityType: v as PolarityType })}
        />
        <ChipSelect
          label="End face"
          value={drawing.endFaceGeometry}
          options={["APC", "UPC"]}
          onChange={(v) => onChange({ endFaceGeometry: v as EndFaceGeometry })}
        />
        <ChipSelect
          label="Core"
          value={drawing.coreSize}
          options={[
            "SINGLEMODE_OS2",
            "SINGLEMODE_OS1",
            "MULTIMODE_OM3",
            "MULTIMODE_OM4",
            "MULTIMODE_OM5",
          ]}
          onChange={(v) => onChange({ coreSize: v as CoreSize })}
        />
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Polarity Type: {drawing.polarityType} (auto-detected) ·{" "}
        {drawing.totalFibers} fibers · {drawing.connectorPairs.length} connector
        pair{drawing.connectorPairs.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
      />
    </label>
  );
}

function ChipSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-900"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function ValidationSummary({
  validation,
}: {
  validation: { pairId: string; issues: string[] }[];
}) {
  const total = validation.length;
  const failing = validation.filter((v) => v.issues.length > 0);
  if (total === 0) return null;
  if (failing.length === 0) {
    return (
      <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        All {total} connector pair{total === 1 ? "" : "s"} validated cleanly.
      </div>
    );
  }
  // Surface the unique issue strings (since all pairs share the same
  // polarity, a real polarity error usually fires on every pair and
  // listing 48 identical bullets is just noise).
  const unique = Array.from(
    new Set(failing.flatMap((v) => v.issues)),
  );
  return (
    <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
      <div className="mb-1 font-medium">
        {failing.length} of {total} pair{failing.length === 1 ? "" : "s"} failed
        validation
      </div>
      <ul className="list-inside list-disc space-y-0.5">
        {unique.map((i, k) => (
          <li key={k}>{i}</li>
        ))}
      </ul>
      <div className="mt-2 text-[11px] text-rose-700">
        Affected pairs:{" "}
        <span className="font-mono">
          {failing
            .slice(0, 6)
            .map((v) => v.pairId)
            .join(", ")}
          {failing.length > 6 ? `, … (+${failing.length - 6} more)` : ""}
        </span>
      </div>
    </div>
  );
}

function ApprovalBar({
  blocking,
  acknowledged,
  onAck,
  onApprove,
  generating,
}: {
  blocking: boolean;
  acknowledged: boolean;
  onAck: (b: boolean) => void;
  onApprove: () => void;
  generating: boolean;
}) {
  const disabled = blocking || !acknowledged || generating;
  return (
    <div className="border-t border-slate-200 bg-white px-6 py-3">
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAck(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        I have verified this extraction matches the drawing.
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={onApprove}
        className={cn(
          "mt-2 w-full rounded px-3 py-2 text-sm font-medium",
          disabled
            ? "cursor-not-allowed bg-slate-200 text-slate-500"
            : "bg-indigo-600 text-white hover:bg-indigo-700",
        )}
      >
        {generating ? "Generating…" : "Approve & generate test plans"}
      </button>
      {blocking && (
        <div className="mt-1 text-xs text-rose-600">
          Resolve all per-pair issues before generating.
        </div>
      )}
    </div>
  );
}

function shellSize(pair: ConnectorPair, fibersPerConnector: number): number {
  const t = (pair.endA.connectorType + " " + pair.endB.connectorType).toUpperCase();
  if (t.includes("16")) return 16;
  if (t.includes("12")) return 12;
  if (t.includes("8")) return 12; // Base-8-in-12F shell
  return fibersPerConnector;
}
