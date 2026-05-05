/**
 * TIA-598 12-color sequence + the swatch hex used by the SVG diagram
 * and the editable cells. Lowercase keys; the LLM is instructed to
 * normalise its output to these names.
 */
export const FIBER_COLORS = [
  "blue",
  "orange",
  "green",
  "brown",
  "slate",
  "white",
  "red",
  "black",
  "yellow",
  "violet",
  "rose",
  "aqua",
] as const;

export type FiberColor = (typeof FIBER_COLORS)[number];

export const COLOR_HEX: Record<string, string> = {
  blue: "#1e40af",
  orange: "#f97316",
  green: "#15803d",
  brown: "#7c2d12",
  slate: "#64748b",
  white: "#f1f5f9",
  red: "#dc2626",
  black: "#0f172a",
  yellow: "#eab308",
  violet: "#7c3aed",
  rose: "#e11d48",
  aqua: "#06b6d4",
};

export function colorHex(name: string): string {
  return COLOR_HEX[name.toLowerCase()] ?? "#94a3b8";
}

export function isLightColor(name: string): boolean {
  const n = name.toLowerCase();
  return n === "white" || n === "yellow" || n === "aqua";
}
