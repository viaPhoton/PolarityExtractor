import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
import { uploadFile } from "@/lib/api.js";
import { useSession } from "@/store/session.js";
import { cn } from "@/lib/cn.js";

const ACCEPTED_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;
const ACCEPT_ATTR = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

export default function UploadPage() {
  const navigate = useNavigate();
  const reset = useSession((s) => s.reset);
  const setSessionId = useSession((s) => s.setSessionId);
  const setPdfFilename = useSession((s) => s.setPdfFilename);
  const provider = useSession((s) => s.provider);
  const providerLabel = providerDisplayName(provider);

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      const ok = ACCEPTED_EXTS.some((e) => lower.endsWith(e));
      if (!ok) {
        setError(
          `Unsupported file type: ${file.name}. Accepted: PDF, PNG, JPEG, WebP, GIF.`,
        );
        return;
      }
      setError(null);
      setBusy(true);
      reset();
      try {
        const { sessionId } = await uploadFile(file);
        setSessionId(sessionId);
        setPdfFilename(file.name);
        navigate(`/verify/${sessionId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [navigate, reset, setSessionId, setPdfFilename],
  );

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        Upload an engineering drawing
      </h1>
      <p className="mt-2 max-w-xl text-center text-sm text-slate-600">
        Drop a fiber-optic cable assembly drawing (PDF) — or a screenshot /
        photo of a polarity table (PNG, JPEG, WebP, GIF) — to extract its
        polarity map. The extraction runs through {providerLabel} vision and
        you'll have a chance to verify and edit before generating test plans.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void submit(f);
        }}
        className={cn(
          "mt-8 flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-white p-12 text-center transition",
          dragOver
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 hover:border-slate-400",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            <span className="text-sm text-slate-700">
              Uploading and starting extraction…
            </span>
          </>
        ) : (
          <>
            <Upload className="h-10 w-10 text-slate-400" />
            <span className="text-base font-medium text-slate-800">
              Drop a PDF or image here, or click to choose
            </span>
            <span className="text-xs text-slate-500">
              Up to 64 MB · PDF · PNG · JPEG · WebP · GIF
            </span>
          </>
        )}
        <input
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void submit(f);
          }}
        />
      </label>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}

      <div className="mt-10 flex items-center gap-3 text-xs text-slate-500">
        <FileText className="h-4 w-4" />
        <span>
          The original file stays on this machine. Only the rendered pages /
          uploaded image are sent to {providerLabel} for extraction.
        </span>
      </div>
    </div>
  );
}

function providerDisplayName(p: "anthropic" | "google" | null): string {
  if (p === "google") return "Gemini";
  if (p === "anthropic") return "Claude";
  return "the LLM";
}
