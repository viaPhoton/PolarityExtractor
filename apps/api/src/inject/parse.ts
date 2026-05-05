import fs from "node:fs/promises";

export interface ParsedTemplate {
  /**
   * The raw bytes preceding the JSON body. The reference templates
   * store this as 10 ASCII chars ("0085C29217") followed immediately by
   * `{`. Other templates may differ — we always treat whatever sits
   * before the first `{` as opaque header bytes to preserve byte-for-byte.
   */
  prefix: Buffer;
  /** Parsed JSON body. */
  json: Record<string, unknown>;
}

/**
 * Parse a test-plan template from disk. Splits off the prefix bytes and
 * JSON-parses the rest. If the file is not in <prefix><JSON> form we
 * throw a descriptive error.
 */
export async function parseTemplate(filePath: string): Promise<ParsedTemplate> {
  const buf = await fs.readFile(filePath);
  return parseTemplateBuffer(buf);
}

export function parseTemplateBuffer(buf: Buffer): ParsedTemplate {
  const firstBrace = buf.indexOf(0x7b /* '{' */);
  if (firstBrace === -1) {
    throw new Error("Template has no JSON body (no '{' found)");
  }
  const prefix = buf.subarray(0, firstBrace);
  const jsonText = buf.subarray(firstBrace).toString("utf8");
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (e) {
    throw new Error(
      `Template JSON parse failed at byte ${firstBrace}: ${(e as Error).message}`,
    );
  }
  if (typeof json !== "object" || json === null) {
    throw new Error("Template JSON must be an object");
  }
  return { prefix, json: json as Record<string, unknown> };
}

/**
 * Re-assemble a template file: prefix bytes + single-line JSON
 * (no pretty-printing — the reference templates have no whitespace).
 */
export function buildTemplateBytes(t: ParsedTemplate): Buffer {
  const jsonString = JSON.stringify(t.json);
  return Buffer.concat([t.prefix, Buffer.from(jsonString, "utf8")]);
}
