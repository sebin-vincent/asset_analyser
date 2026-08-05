import { Flag } from './Flag';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import { formatPctSigned } from '../utils/format';
import type { FundReturnSummary, SelectedFund } from '../types/fund';

interface ReturnsSummaryTableProps {
  summaries: FundReturnSummary[];
  funds: SelectedFund[];
}

export function ReturnsSummaryTable({ summaries, funds }: ReturnsSummaryTableProps) {
  const mode = useColorScheme();
  const colorIndexByCode = new Map(funds.map((f) => [f.schemeCode, f.colorIndex]));

  if (summaries.length === 0) return null;

  // Rank reflects performance; row order does not change — that stays fund-list order,
  // same as everywhere else in the app that lists funds.
  const rankByCode = new Map(
    [...summaries]
      .sort((a, b) => b.absoluteReturnPct - a.absoluteReturnPct)
      .map((s, i) => [s.schemeCode, i + 1]),
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-plate">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-plate-2 text-left font-mono text-[10px] tracking-wider text-ink-3 uppercase">
            <th className="px-3 py-2 font-normal">Fund</th>
            <th className="px-3 py-2 font-normal">From</th>
            <th className="px-3 py-2 font-normal">To</th>
            <th className="px-3 py-2 text-right font-normal">Return</th>
            <th className="px-3 py-2 text-right font-normal">CAGR</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => {
            const colorIndex = colorIndexByCode.get(s.schemeCode) ?? 0;
            const rank = rankByCode.get(s.schemeCode);
            const isLeader = summaries.length > 1 && rank === 1;
            return (
              <tr
                key={s.schemeCode}
                className={`border-b border-line last:border-0 ${isLeader ? 'bg-acc-wash' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 shrink-0 font-mono text-xs text-ink-3">{rank}</span>
                    <span
                      className="h-0.5 w-3 shrink-0"
                      style={{ backgroundColor: colorForIndex(colorIndex, mode) }}
                      aria-hidden
                    />
                    <span className="truncate text-ink" title={s.name}>
                      {s.name}
                    </span>
                    {s.isPartialRange && (
                      <Flag title="Fund's data starts after the selected range start">Partial</Flag>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-ink-2">
                  {formatAxisDate(s.startDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-ink-2">
                  {formatAxisDate(s.endDate)}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums"
                  style={{ color: deltaColor(s.absoluteReturnPct, mode) }}
                >
                  {formatPctSigned(s.absoluteReturnPct)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                  {s.cagrPct === null ? '—' : formatPctSigned(s.cagrPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
