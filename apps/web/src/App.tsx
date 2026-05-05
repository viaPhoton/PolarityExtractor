import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Cable, Settings as SettingsIcon } from "lucide-react";
import { getHealth } from "@/lib/api.js";
import { useSession } from "@/store/session.js";
import { cn } from "@/lib/cn.js";

interface AppProps {
  children: ReactNode;
}

export default function App({ children }: AppProps) {
  const location = useLocation();
  const onSettings = location.pathname.startsWith("/settings");
  const step = stepFromPath(location.pathname);
  const provider = useSession((s) => s.provider);
  const model = useSession((s) => s.model);
  const setProvider = useSession((s) => s.setProvider);
  const setModel = useSession((s) => s.setModel);
  const sessionId = useSession((s) => s.sessionId);
  const drawing = useSession((s) => s.drawing);
  const outputFilename = useSession((s) => s.outputFilename);

  useEffect(() => {
    if (provider && model) return;
    getHealth()
      .then((h) => {
        setProvider(h.provider);
        setModel(h.model);
      })
      .catch(() => undefined);
  }, [provider, model, setProvider, setModel]);

  // A step is reachable when we have the session state needed to render
  // its page meaningfully. Upload is always reachable. Verify needs an
  // active session id. Download needs a generated output file (or we'd
  // land on a 404 from /api/download/:id).
  const verifyHref = sessionId ? `/verify/${sessionId}` : null;
  const downloadHref =
    sessionId && (outputFilename || drawing) ? `/download/${sessionId}` : null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 text-slate-900">
            <Cable className="h-5 w-5 text-indigo-600" />
            <span className="font-semibold">Polarity Extractor</span>
            {model && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                {model}
              </span>
            )}
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {!onSettings && (
              <>
                <Step
                  active={step === 1}
                  done={step > 1}
                  label="1. Upload"
                  to="/"
                />
                <Sep />
                <Step
                  active={step === 2}
                  done={step > 2}
                  label="2. Verify"
                  to={verifyHref}
                />
                <Sep />
                <Step
                  active={step === 3}
                  done={false}
                  label="3. Download"
                  to={downloadHref}
                />
                <span className="mx-2 h-5 w-px bg-slate-200" aria-hidden />
              </>
            )}
            <Link
              to="/settings"
              aria-label="Settings"
              title="Settings"
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-sm",
                onSettings
                  ? "bg-indigo-600 text-white"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function Step({
  active,
  done,
  label,
  to,
}: {
  active: boolean;
  done: boolean;
  label: string;
  to: string | null;
}) {
  let cls = "rounded px-2 py-1 transition-colors";
  if (active) cls += " bg-indigo-600 text-white";
  else if (done) cls += " text-emerald-700";
  else cls += " text-slate-500";
  if (to && !active) cls += " hover:bg-slate-100 hover:text-slate-800";
  if (!to) cls += " cursor-default opacity-60";

  if (to) {
    return (
      <Link to={to} className={cls}>
        {label}
      </Link>
    );
  }
  return <span className={cls}>{label}</span>;
}

function Sep() {
  return <span className="text-slate-300">›</span>;
}

function stepFromPath(p: string): number {
  if (p.startsWith("/verify")) return 2;
  if (p.startsWith("/download")) return 3;
  return 1;
}
