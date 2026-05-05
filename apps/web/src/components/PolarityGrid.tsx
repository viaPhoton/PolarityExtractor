import { useMemo } from "react";
import type { ConnectorPair, Fiber } from "@polarity/shared";
import { FIBER_COLORS, colorHex, isLightColor } from "@/lib/colors.js";
import { cn } from "@/lib/cn.js";

interface Props {
  pair: ConnectorPair;
  onChange: (next: ConnectorPair) => void;
  /**
   * Revert to the original (LLM-extracted) polarity. The page handles
   * scope: edits and resets are applied to every connector pair, since
   * the whole trunk shares one polarity map.
   */
  onReset: () => void;
}

/**
 * Editable per-fiber grid. Columns:
 *   Fiber # · End A Pos · End A Color · End B Pos · End B Color
 */
export function PolarityGrid({ pair, onChange, onReset }: Props) {
  const rows = useMemo(
    () =>
      pair.fibers.map((f, idx) => ({ idx, ...f })),
    [pair.fibers],
  );

  function update(idx: number, patch: Partial<Fiber>) {
    const next = pair.fibers.map((f, i) =>
      i === idx ? { ...f, ...patch } : f,
    );
    onChange({ ...pair, fibers: next });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm">
        <div className="font-medium text-slate-800">
          Fibers · {pair.fibers.length}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          Reset to extraction
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Fiber #</th>
              <th className="px-3 py-2 text-left font-medium">End A pos</th>
              <th className="px-3 py-2 text-left font-medium">End A color</th>
              <th className="px-3 py-2 text-left font-medium">End B pos</th>
              <th className="px-3 py-2 text-left font-medium">End B color</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.idx}
                className="border-t border-slate-100 odd:bg-white even:bg-slate-50/50"
              >
                <td className="px-3 py-2 text-slate-500">{r.idx + 1}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={r.endAPosition}
                    onChange={(e) =>
                      update(r.idx, {
                        endAPosition: Number.parseInt(e.target.value || "0", 10),
                      })
                    }
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <ColorSelect
                    value={r.endAColor}
                    onChange={(v) => update(r.idx, { endAColor: v })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={r.endBPosition}
                    onChange={(e) =>
                      update(r.idx, {
                        endBPosition: Number.parseInt(e.target.value || "0", 10),
                      })
                    }
                    className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <ColorSelect
                    value={r.endBColor}
                    onChange={(v) => update(r.idx, { endBColor: v })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const known = FIBER_COLORS.includes(value as (typeof FIBER_COLORS)[number]);
  const list = known ? FIBER_COLORS : [value, ...FIBER_COLORS];
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full border",
          isLightColor(value) ? "border-slate-400" : "border-transparent",
        )}
        style={{ backgroundColor: colorHex(value) }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-slate-200 bg-white px-2 py-1"
      >
        {list.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
