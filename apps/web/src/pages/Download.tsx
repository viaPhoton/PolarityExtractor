import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, FileText } from "lucide-react";
import { downloadUrl, getSession } from "@/lib/api.js";
import { useSession } from "@/store/session.js";

export default function DownloadPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const outputFilename = useSession((s) => s.outputFilename);
  const fibersPerCable = useSession((s) => s.fibersPerCable);
  const setOutputFilename = useSession((s) => s.setOutputFilename);
  const setFibersPerCable = useSession((s) => s.setFibersPerCable);
  const reset = useSession((s) => s.reset);

  // Re-fetch the session on direct nav (e.g. browser refresh on /download/:id)
  // so the filename + fiber count display correctly without re-running
  // /generate.
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => {
        if (s.outputFilename) setOutputFilename(s.outputFilename);
        if (s.fibersPerCable != null) setFibersPerCable(s.fibersPerCable);
      })
      .catch(() => undefined);
  }, [sessionId, setOutputFilename, setFibersPerCable]);

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-4 px-6">
      <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      <h1 className="text-xl font-semibold text-slate-900">
        Test plan ready
      </h1>
      <p className="text-center text-sm text-slate-600">
        {fibersPerCable != null
          ? `Generated a single test-plan file covering all ${fibersPerCable} fibers.`
          : "Your combined test-plan file is ready."}
      </p>
      {outputFilename && (
        <div className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700">
          <FileText className="h-3.5 w-3.5 text-slate-400" />
          {outputFilename}
        </div>
      )}
      <a
        href={downloadUrl(sessionId)}
        className="mt-2 inline-flex items-center gap-2 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Download className="h-4 w-4" />
        Download test plan
      </a>
      <div className="mt-4 flex items-center gap-4 text-sm">
        <Link
          to={`/verify/${sessionId}`}
          className="inline-flex items-center gap-1 text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to verify
        </Link>
        <span className="text-slate-300">·</span>
        <button
          type="button"
          onClick={() => {
            reset();
            navigate("/");
          }}
          className="text-slate-500 underline-offset-2 hover:underline"
        >
          Process another drawing
        </button>
      </div>
    </div>
  );
}
