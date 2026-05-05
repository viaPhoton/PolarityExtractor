import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Save,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  getSettings,
  resetSettings,
  updateSettings,
  type ProviderName,
  type SettingsPatch,
  type SettingsResponse,
} from "@/lib/api.js";
import { cn } from "@/lib/cn.js";

/**
 * Local form state mirrors SettingsResponse but uses plain strings for
 * API key inputs (empty string = "no change"). The page hydrates from
 * the server, then submits a partial patch on save.
 */
interface FormState {
  provider: ProviderName;
  anthropicModel: string;
  anthropicApiKey: string;
  googleModel: string;
  googleApiKey: string;
  googleThinkingBudget: string;
  apiUrl: string;
  temperature: string;
  maxOutputTokens: string;
  pdfRenderDpi: string;
  systemPrompt: string;
  userPrompt: string;
}

function toForm(s: SettingsResponse): FormState {
  return {
    provider: s.provider,
    anthropicModel: s.anthropic.model,
    anthropicApiKey: "",
    googleModel: s.google.model,
    googleApiKey: "",
    googleThinkingBudget: String(s.google.thinkingBudget),
    apiUrl: s.apiUrl,
    temperature: String(s.temperature),
    maxOutputTokens: String(s.maxOutputTokens),
    pdfRenderDpi: String(s.pdfRenderDpi),
    systemPrompt: s.systemPrompt,
    userPrompt: s.userPrompt,
  };
}

function diff(form: FormState, server: SettingsResponse): SettingsPatch {
  const patch: SettingsPatch = {};
  if (form.provider !== server.provider) patch.provider = form.provider;

  const anthropic: SettingsPatch["anthropic"] = {};
  if (form.anthropicModel !== server.anthropic.model) {
    anthropic.model = form.anthropicModel;
  }
  if (form.anthropicApiKey !== "") anthropic.apiKey = form.anthropicApiKey;
  if (Object.keys(anthropic).length > 0) patch.anthropic = anthropic;

  const google: SettingsPatch["google"] = {};
  if (form.googleModel !== server.google.model) google.model = form.googleModel;
  if (form.googleApiKey !== "") google.apiKey = form.googleApiKey;
  const tb = Number.parseInt(form.googleThinkingBudget, 10);
  if (Number.isFinite(tb) && tb !== server.google.thinkingBudget) {
    google.thinkingBudget = tb;
  }
  if (Object.keys(google).length > 0) patch.google = google;

  if (form.apiUrl !== server.apiUrl) patch.apiUrl = form.apiUrl;
  const temp = Number.parseFloat(form.temperature);
  if (Number.isFinite(temp) && temp !== server.temperature) patch.temperature = temp;
  const maxTok = Number.parseInt(form.maxOutputTokens, 10);
  if (Number.isFinite(maxTok) && maxTok !== server.maxOutputTokens) {
    patch.maxOutputTokens = maxTok;
  }
  const dpi = Number.parseInt(form.pdfRenderDpi, 10);
  if (Number.isFinite(dpi) && dpi !== server.pdfRenderDpi) patch.pdfRenderDpi = dpi;
  if (form.systemPrompt !== server.systemPrompt) patch.systemPrompt = form.systemPrompt;
  if (form.userPrompt !== server.userPrompt) patch.userPrompt = form.userPrompt;

  return patch;
}

export default function SettingsPage() {
  const [server, setServer] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (cancelled) return;
        setServer(s);
        setForm(toForm(s));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => {
    if (!form || !server) return false;
    const p = diff(form, server);
    return Object.keys(p).length > 0;
  }, [form, server]);

  async function onSave() {
    if (!form || !server) return;
    setSaving(true);
    setError(null);
    try {
      const patch = diff(form, server);
      const next = await updateSettings(patch);
      setServer(next);
      setForm(toForm(next));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!confirm("Reset all settings to defaults? This will clear API keys you've entered through this page.")) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const next = await resetSettings();
      setServer(next);
      setForm(toForm(next));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
              <p className="mt-1 text-sm text-slate-600">
                Edit the runtime configuration used for every extraction.
                Changes apply on the next upload — no restart needed.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={resetting || saving}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving || resetting || !form}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium",
                dirty && !saving && !resetting
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500",
              )}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedAt && !dirty ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving…" : savedAt && !dirty ? "Saved" : "Save changes"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {!form && !error && (
          <div className="mt-10 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        )}

        {form && server && (
          <div className="mt-6 space-y-6 pb-12">
            <ProviderCard form={form} setForm={setForm} server={server} />
            <ModelKeysCard form={form} setForm={setForm} server={server} />
            <GenerationCard form={form} setForm={setForm} />
            <RenderCard form={form} setForm={setForm} />
            <PromptCard
              title="System prompt"
              description="Sent as the system message on every request. Defines the role and the hard rules the model must follow."
              value={form.systemPrompt}
              onChange={(v) => setForm({ ...form, systemPrompt: v })}
            />
            <PromptCard
              title="User prompt"
              description="Sent as the first user message alongside the rendered drawing pages. Defines the JSON shape the model must return."
              value={form.userPrompt}
              onChange={(v) => setForm({ ...form, userPrompt: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProviderCard({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
  server: SettingsResponse;
}) {
  return (
    <Card title="Active provider" subtitle="Pick which vision LLM to use for the next extraction.">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ProviderRadio
          label="Anthropic (Claude)"
          checked={form.provider === "anthropic"}
          onChange={() => setForm({ ...form, provider: "anthropic" })}
        />
        <ProviderRadio
          label="Google (Gemini)"
          checked={form.provider === "google"}
          onChange={() => setForm({ ...form, provider: "google" })}
        />
      </div>
    </Card>
  );
}

function ProviderRadio({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition",
        checked
          ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-300"
          : "border-slate-200 bg-white hover:border-slate-300",
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 text-indigo-600"
      />
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </label>
  );
}

function ModelKeysCard({
  form,
  setForm,
  server,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
  server: SettingsResponse;
}) {
  return (
    <Card
      title="Models & API keys"
      subtitle="Per-provider model id and API key. Keys are stored on the server and never sent back to the browser in plaintext."
    >
      <div className="space-y-5">
        <ProviderSection
          name="Anthropic"
          isActive={form.provider === "anthropic"}
          model={form.anthropicModel}
          onModelChange={(v) => setForm({ ...form, anthropicModel: v })}
          modelPlaceholder="claude-opus-4-7"
          apiKey={form.anthropicApiKey}
          onApiKeyChange={(v) => setForm({ ...form, anthropicApiKey: v })}
          hasApiKey={server.anthropic.hasApiKey}
          apiKeyHint={server.anthropic.apiKeyHint}
        />
        <ProviderSection
          name="Google"
          isActive={form.provider === "google"}
          model={form.googleModel}
          onModelChange={(v) => setForm({ ...form, googleModel: v })}
          modelPlaceholder="gemini-2.5-flash"
          apiKey={form.googleApiKey}
          onApiKeyChange={(v) => setForm({ ...form, googleApiKey: v })}
          hasApiKey={server.google.hasApiKey}
          apiKeyHint={server.google.apiKeyHint}
        >
          <NumberField
            label="Thinking budget"
            help="0 = disabled (fastest), -1 = automatic, N = max reasoning tokens. Pro IGNORES 0 — try 256 for Pro."
            value={form.googleThinkingBudget}
            onChange={(v) => setForm({ ...form, googleThinkingBudget: v })}
            min={-1}
            step={1}
          />
        </ProviderSection>
      </div>
    </Card>
  );
}

function ProviderSection({
  name,
  isActive,
  model,
  onModelChange,
  modelPlaceholder,
  apiKey,
  onApiKeyChange,
  hasApiKey,
  apiKeyHint,
  children,
}: {
  name: string;
  isActive: boolean;
  model: string;
  onModelChange: (v: string) => void;
  modelPlaceholder: string;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  hasApiKey: boolean;
  apiKeyHint: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive ? "border-indigo-200 bg-indigo-50/40" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{name}</h3>
        {isActive && (
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-700">
            Active
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Model id"
          value={model}
          onChange={onModelChange}
          placeholder={modelPlaceholder}
        />
        <ApiKeyField
          label="API key"
          value={apiKey}
          onChange={onApiKeyChange}
          hasApiKey={hasApiKey}
          apiKeyHint={apiKeyHint}
        />
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function GenerationCard({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
}) {
  return (
    <Card
      title="Generation parameters"
      subtitle="Sampling controls applied to every model call."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label="Temperature"
          help="0 = deterministic. Higher values add variation; we recommend keeping it 0 for tabular extraction."
          value={form.temperature}
          onChange={(v) => setForm({ ...form, temperature: v })}
          min={0}
          max={2}
          step={0.1}
        />
        <NumberField
          label="Max output tokens"
          help="12000 fits even 576F drawings; lower it to lower the latency ceiling."
          value={form.maxOutputTokens}
          onChange={(v) => setForm({ ...form, maxOutputTokens: v })}
          min={256}
          step={256}
        />
        <TextField
          label="API URL override (optional)"
          value={form.apiUrl}
          onChange={(v) => setForm({ ...form, apiUrl: v })}
          placeholder="leave empty to use the SDK default"
        />
      </div>
    </Card>
  );
}

function RenderCard({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
}) {
  return (
    <Card
      title="PDF rendering"
      subtitle="DPI for converting PDF pages to PNGs before they're shipped to the model."
    >
      <NumberField
        label="Render DPI"
        help="150 is fast and accurate for typical polarity tables. Bump to 200-250 for very dense or scanned drawings."
        value={form.pdfRenderDpi}
        onChange={(v) => setForm({ ...form, pdfRenderDpi: v })}
        min={72}
        max={600}
        step={10}
      />
    </Card>
  );
}

function PromptCard({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Card title={title} subtitle={description}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="block max-h-[480px] min-h-[200px] w-full resize-y rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    </label>
  );
}

function NumberField({
  label,
  help,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  help?: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      {help && <span className="text-[11px] text-slate-500">{help}</span>}
    </label>
  );
}

function ApiKeyField({
  label,
  value,
  onChange,
  hasApiKey,
  apiKeyHint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hasApiKey: boolean;
  apiKeyHint: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <span>{label}</span>
        <span className="text-[10px] normal-case tracking-normal text-slate-400">
          {hasApiKey ? `set · ${apiKeyHint}` : "not set"}
        </span>
      </span>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={hasApiKey ? "leave blank to keep existing" : "paste a new key"}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded border border-slate-200 bg-white py-1.5 pl-2 pr-8 font-mono text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide" : "Show"}
          className="absolute inset-y-0 right-1 flex items-center px-1 text-slate-400 hover:text-slate-600"
        >
          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}
