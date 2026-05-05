import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { getSettings, requireActiveApiKey } from "../settings/store.js";
import {
  NonRetryableExtractionError,
  type TransportRequest,
  type Turn,
} from "./provider.js";

/**
 * Gemini (Google Gen AI SDK, @google/genai) transport.
 *
 * Uses `models.generateContent` with `responseMimeType: "application/json"`
 * and the system prompt routed through `systemInstruction`. Each user
 * turn becomes a `Content` with role "user"; the first user turn (the
 * one tagged `includeImages: true`) carries every PDF page as an
 * `inlineData` part. Assistant turns become role "model".
 *
 * Honours the runtime `apiUrl` setting if set (for proxies / regional
 * endpoints).
 */
export async function extractWithGoogle(
  req: TransportRequest,
): Promise<string> {
  const settings = getSettings();
  const apiKey = requireActiveApiKey();
  const client = new GoogleGenAI({
    apiKey,
    ...(settings.apiUrl
      ? { httpOptions: { baseUrl: settings.apiUrl } }
      : {}),
  });

  const imageParts: Part[] = req.images.map((img) => ({
    inlineData: { mimeType: img.mediaType, data: img.data },
  }));

  const contents: Content[] = req.turns.map((t) => ({
    role: t.role === "assistant" ? "model" : "user",
    parts: buildParts(t, imageParts),
  }));

  const response = await client.models.generateContent({
    model: settings.google.model,
    contents,
    config: {
      systemInstruction: req.systemPrompt,
      responseMimeType: "application/json",
      temperature: settings.temperature,
      maxOutputTokens: settings.maxOutputTokens,
      // Disable / cap the 2.5-series reasoning tokens. For Flash and
      // Flash-Lite this is the single biggest latency win on a
      // structured-extraction task. For Pro pass a small positive
      // budget via the Settings page.
      thinkingConfig: { thinkingBudget: settings.google.thinkingBudget },
    },
  });

  // Pull the candidate's finishReason BEFORE returning text. Even
  // truncated responses surface text — we still want to fail loudly so
  // the caller doesn't waste a retry on the same token cap.
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason as string | undefined;

  const text =
    (response.text ?? "").toString().trim() || readCandidateText(candidate);

  if (finishReason && finishReason !== "STOP") {
    if (finishReason === "MAX_TOKENS") {
      throw new NonRetryableExtractionError(
        `model output truncated at maxOutputTokens=${settings.maxOutputTokens}. ` +
          `This drawing's full polarity JSON does not fit in the current cap. ` +
          `Raise "Max output tokens" on the Settings page (Gemini 2.5 supports up to 65,536) and re-upload.`,
      );
    }
    throw new NonRetryableExtractionError(
      `model stopped with finishReason=${finishReason}. ` +
        `Raw text length: ${text.length}. ` +
        `This is a provider-side block (safety, recitation, language, etc.) and cannot be fixed by retrying.`,
    );
  }

  return text;
}

function readCandidateText(
  candidate: { content?: { parts?: Part[] } } | undefined,
): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return "";
  const joined = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");
  return joined.trim();
}

function buildParts(turn: Turn, imageParts: Part[]): Part[] {
  if (turn.role === "assistant") {
    return [{ text: turn.text }];
  }
  return turn.includeImages
    ? [...imageParts, { text: turn.text }]
    : [{ text: turn.text }];
}
