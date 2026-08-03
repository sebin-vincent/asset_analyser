import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import type { FundReturnSummary, SelectedFund } from '../types/fund';

interface ReturnsSummaryTableProps {
  summaries: FundReturnSummary[];
  funds: SelectedFund[];
}

export function ReturnsSummaryTable({ summaries, funds }: ReturnsSummaryTableProps) {
  const mode = useColorScheme();
  const colorIndexByCode = new Map(funds.map((f) => [f.schemeCode, f.colorIndex]));

  if (summaries.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e1e0d9] dark:border-[#2c2c2a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e1e0d9] text-left text-xs text-[#898781] dark:border-[#2c2c2a]">
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
            return (
              <tr key={s.schemeCode} className="border-b border-[#e1e0d9] last:border-0 dark:border-[#2c2c2a]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForIndex(colorIndex, mode) }}
                      aria-hidden
                    />
                    <span className="truncate text-[#0b0b0b] dark:text-white" title={s.name}>
                      {s.name}
                    </span>
                    {s.isPartialRange && (
                      <span className="shrink-0 text-xs text-[#898781]" title="Fund's data starts after the selected range start">
                        ⓘ
                      </span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#52514e] dark:text-[#c3c2b7]">
                  {formatAxisDate(s.startDate)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#52514e] dark:text-[#c3c2b7]">
                  {formatAxisDate(s.endDate)}
                </td>
                <td
                  className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums"
                  style={{ color: deltaColor(s.absoluteReturnPct, mode) }}
                >
                  {s.absoluteReturnPct >= 0 ? '+' : ''}
                  {s.absoluteReturnPct.toFixed(2)}%
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#52514e] dark:text-[#c3c2b7]">
                  {s.cagrPct === null ? '—' : `${s.cagrPct >= 0 ? '+' : ''}${s.cagrPct.toFixed(2)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
