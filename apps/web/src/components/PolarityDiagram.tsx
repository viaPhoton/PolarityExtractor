import type { ConnectorPair } from "@polarity/shared";
import { colorHex, isLightColor } from "@/lib/colors.js";

interface Props {
  pair: ConnectorPair;
  shellSize: number;
}

/**
 * Visual sanity-check diagram. Two vertical strips of color dots (End A
 * left, End B right). For each fiber, draw a line from its End A
 * position to its End B position, using the End A color.
 */
export function PolarityDiagram({ pair, shellSize }: Props) {
  const W = 420;
  const H = 320;
  const padTop = 28;
  const padBot = 22;
  const usable = H - padTop - padBot;
  const stride = usable / Math.max(shellSize - 1, 1);
  const r = 9;

  const xLeft = 80;
  const xRight = W - 80;

  const dotsA = Array.from({ length: shellSize }, (_, i) => i + 1);
  const dotsB = Array.from({ length: shellSize }, (_, i) => i + 1);

  const colorByPosA = new Map<number, string>();
  const colorByPosB = new Map<number, string>();
  for (const f of pair.fibers) {
    colorByPosA.set(f.endAPosition, f.endAColor);
    colorByPosB.set(f.endBPosition, f.endBColor);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-md rounded border border-slate-200 bg-white"
      role="img"
      aria-label={`Polarity diagram for ${pair.pairId}`}
    >
      <text
        x={xLeft}
        y={16}
        textAnchor="middle"
        className="fill-slate-600 text-[11px]"
      >
        End A · {pair.endA.legId}
      </text>
      <text
        x={xRight}
        y={16}
        textAnchor="middle"
        className="fill-slate-600 text-[11px]"
      >
        End B · {pair.endB.legId}
      </text>

      {pair.fibers.map((f) => {
        const yA = padTop + (f.endAPosition - 1) * stride;
        const yB = padTop + (f.endBPosition - 1) * stride;
        return (
          <line
            key={`l-${f.endAPosition}-${f.endBPosition}`}
            x1={xLeft + r}
            y1={yA}
            x2={xRight - r}
            y2={yB}
            stroke={colorHex(f.endAColor)}
            strokeWidth={2}
            opacity={0.8}
          />
        );
      })}

      {dotsA.map((pos) => {
        const y = padTop + (pos - 1) * stride;
        const c = colorByPosA.get(pos);
        const fill = c ? colorHex(c) : "#e2e8f0";
        const strokeLight = c && isLightColor(c) ? "#475569" : fill;
        return (
          <g key={`a-${pos}`}>
            <circle
              cx={xLeft}
              cy={y}
              r={r}
              fill={fill}
              stroke={strokeLight}
              strokeWidth={1}
            />
            <text
              x={xLeft - r - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-slate-700 text-[10px]"
            >
              {pos}
            </text>
          </g>
        );
      })}
      {dotsB.map((pos) => {
        const y = padTop + (pos - 1) * stride;
        const c = colorByPosB.get(pos);
        const fill = c ? colorHex(c) : "#e2e8f0";
        const strokeLight = c && isLightColor(c) ? "#475569" : fill;
        return (
          <g key={`b-${pos}`}>
            <circle
              cx={xRight}
              cy={y}
              r={r}
              fill={fill}
              stroke={strokeLight}
              strokeWidth={1}
            />
            <text
              x={xRight + r + 6}
              y={y + 3}
              textAnchor="start"
              className="fill-slate-700 text-[10px]"
            >
              {pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
