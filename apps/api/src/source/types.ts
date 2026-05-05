import type { PageImage } from "@polarity/shared";

/**
 * The image media types we accept for upload. Both Anthropic Claude
 * and Google Gemini accept this set; PDFs get rendered to image/png.
 */
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * One page of source material ready to send to the LLM. PDFs produce
 * one SourcePage per rendered page; image uploads produce exactly one.
 */
export interface SourcePage {
  index: number;
  /** Raw image bytes (no data: prefix). */
  image: Buffer;
  /** MIME type of `image`. */
  mediaType: SupportedImageType;
  /** Pixel width, or 0 if it couldn't be probed. */
  width: number;
  /** Pixel height, or 0 if it couldn't be probed. */
  height: number;
}

export function toPageImage(p: SourcePage): PageImage {
  return {
    index: p.index,
    dataUrl: `data:${p.mediaType};base64,${p.image.toString("base64")}`,
    width: p.width,
    height: p.height,
  };
}

export function isSupportedImageType(mt: string): mt is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mt);
}
