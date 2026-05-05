import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractedDrawing } from "@polarity/shared";
import { parseTemplate, type ParsedTemplate } from "./parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");

export interface TemplateDescriptor {
  /** Filename relative to apps/api/src/templates/ */
  file: string;
  description: string;
  /** True if a single-mode template, false if multi-mode. */
  singleMode: boolean;
}

/**
 * Registered base templates. v1 ships exactly one (the verified
 * 12F SM MPO Polarity A reference). The build step mutates it to
 * fit any extracted drawing — so this single entry is sufficient as
 * a starting structure for every supported case.
 *
 * To add more templates: drop the .txt file in apps/api/src/templates/
 * and add an entry here. The selector below picks the closest match,
 * but the build step handles fiber-count, polarity, and connector
 * differences automatically.
 */
export const TEMPLATE_REGISTRY: TemplateDescriptor[] = [
  {
    file: "sm_mpo12_mpo12_polarity_a.txt",
    description: "Single-mode MPO 12F Polarity A reference template",
    singleMode: true,
  },
];

const cache = new Map<string, ParsedTemplate>();

export async function loadTemplate(file: string): Promise<ParsedTemplate> {
  const cached = cache.get(file);
  if (cached) return cached;
  const full = path.join(TEMPLATES_DIR, file);
  const parsed = await parseTemplate(full);
  cache.set(file, parsed);
  return parsed;
}

/**
 * Pick the best base template for a drawing. Currently we only have
 * one template; we mutate it for every output. The matching logic is
 * here so we can extend the registry later without touching callers.
 */
export async function selectTemplate(
  drawing: ExtractedDrawing,
): Promise<ParsedTemplate> {
  const sm = drawing.coreSize.startsWith("SINGLEMODE");
  const candidate =
    TEMPLATE_REGISTRY.find((t) => t.singleMode === sm) ??
    TEMPLATE_REGISTRY[0];
  if (!candidate) {
    throw new Error("No base templates registered");
  }
  return loadTemplate(candidate.file);
}
