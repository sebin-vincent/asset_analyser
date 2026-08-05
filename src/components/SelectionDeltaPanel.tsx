import { Flag } from './Flag';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import { formatPctSigned } from '../utils/format';
import type { FundDelta } from '../utils/selectionDelta';
import type { SelectedFund } from '../types/fund';

interface SelectionDeltaPanelProps {
  deltas: FundDelta[];
  funds: SelectedFund[];
  startTime: number;
  endTime: number;
  onClear: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function hasValue(delta: FundDelta): delta is Extract<FundDelta, { kind: 'ok' | 'partial' }> {
  return delta.kind === 'ok' || delta.kind === 'partial';
}

export function SelectionDeltaPanel({
  deltas,
  funds,
  startTime,
  endTime,
  onClear,
}: SelectionDeltaPanelProps) {
  const mode = useColorScheme();
  const colorIndexByCode = new Map(funds.map((f) => [f.schemeCode, f.colorIndex]));

  // Rows carrying a number sort by performance; the rest keep their original order below them,
  // rather than interleaving at an implied 0%.
  const valued = deltas.filter(hasValue).sort((a, b) => b.pctChange - a.pctChange);
  const unvalued = deltas.filter((d) => !hasValue(d));
  const rows = [...valued, ...unvalued];

  const spanDays = Math.round((endTime - startTime) / DAY_MS);

  const swatchFor = (schemeCode: number) => {
    const idx = colorIndexByCode.get(schemeCode);
    return idx === undefined ? 'transparent' : colorForIndex(idx, mode);
  };

  return (
    <div className="rounded-lg border border-line bg-plate">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-acc-wash px-4 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-sm font-medium text-ink">
            {formatAxisDate(startTime)} → {formatAxisDate(endTime)}
          </span>
          <span className="font-mono text-xs text-ink-3">
            {spanDays} {spanDays === 1 ? 'day' : 'days'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md border border-line bg-plate px-2 py-1 text-xs text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
        >
          Clear
        </button>
      </div>

      <ul className="divide-y divide-line">
        {rows.map((delta) => (
          <li key={delta.schemeCode} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span
              className="h-0.5 w-3 shrink-0"
              style={{ backgroundColor: swatchFor(delta.schemeCode) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink" title={delta.name}>
              {delta.name}
            </span>

            {hasValue(delta) ? (
              <>
                <span className="hidden shrink-0 font-mono text-xs tabular-nums text-ink-3 sm:inline">
                  {delta.startNav.toFixed(2)} → {delta.endNav.toFixed(2)}
                </span>
                {delta.kind === 'partial' && (
                  <Flag
                    title={`Data only from ${formatAxisDate(delta.startTime)} — this fund starts partway through the selection`}
                  >
                    Partial
                  </Flag>
                )}
                <span
                  className="w-20 shrink-0 text-right font-mono font-semibold tabular-nums"
                  style={{ color: deltaColor(delta.pctChange, mode) }}
                >
                  {formatPctSigned(delta.pctChange)}
                </span>
              </>
            ) : (
              <span className="shrink-0 text-xs text-ink-3">
                {delta.kind === 'no-update'
                  ? `No NAV update in this window (last priced ${formatAxisDate(delta.atTime)})`
                  : 'No data in this window'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
