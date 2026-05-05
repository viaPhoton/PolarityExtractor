import Anthropic from "@anthropic-ai/sdk";
import { getSettings, requireActiveApiKey } from "../settings/store.js";
import {
  NonRetryableExtractionError,
  type TransportRequest,
} from "./provider.js";

/**
 * Claude (Anthropic Messages API) transport. Each user turn from the
 * dispatcher becomes one user message; the first one with
 * `includeImages: true` carries every page as a base64 image block.
 *
 * Honours the runtime `apiUrl` setting if set (for proxies / regional
 * endpoints).
 */
export async function extractWithAnthropic(
  req: TransportRequest,
): Promise<string> {
  const settings = getSettings();
  const apiKey = requireActiveApiKey();
  const client = new Anthropic({
    apiKey,
    ...(settings.apiUrl ? { baseURL: settings.apiUrl } : {}),
  });

  const imageBlocks: Anthropic.ImageBlockParam[] = req.images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType,
      data: img.data,
    },
  }));

  const messages: Anthropic.MessageParam[] = req.turns.map((t) => {
    if (t.role === "assistant") {
      return {
        role: "assistant",
        content: [{ type: "text", text: t.text }],
      };
    }
    return {
      role: "user",
      content: t.includeImages
        ? [...imageBlocks, { type: "text", text: t.text }]
        : [{ type: "text", text: t.text }],
    };
  });

  const response = await client.messages.create({
    model: settings.anthropic.model,
    max_tokens: settings.maxOutputTokens,
    temperature: settings.temperature,
    system: req.systemPrompt,
    messages,
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  // Anthropic surfaces "max_tokens" in stop_reason when the model hits
  // the per-call cap. Treat that as non-retryable so the dispatcher
  // doesn't burn a second call on the same truncation.
  if (response.stop_reason === "max_tokens") {
    throw new NonRetryableExtractionError(
      `model output truncated at max_tokens=${settings.maxOutputTokens}. ` +
        `This drawing's full polarity JSON does not fit in the current cap. ` +
        `Raise "Max output tokens" on the Settings page and re-upload.`,
    );
  }

  return text;
}
