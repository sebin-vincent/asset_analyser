import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import { hasValue, type FundSimulation } from '../utils/counterfactual';
import { formatAxisDate } from '../utils/dateUtils';
import { formatInr, formatInrSigned, formatPctSigned } from '../utils/format';

export interface WhatIfRow {
  simulation: FundSimulation;
  colorIndex: number;
  isActual: boolean;
}

interface WhatIfSummaryTableProps {
  rows: WhatIfRow[];
  actualFinalValue: number | null;
}

const UNAVAILABLE_REASON: Record<
  Extract<FundSimulation, { kind: 'unavailable' }>['reason'],
  string
> = {
  'no-nav-data': 'No NAV history available for this fund',
  'launched-after-all-purchases': 'This fund launched after all of your purchases',
  'history-ends-before-purchases':
    'This fund stopped publishing a NAV before your purchases — it cannot be compared',
};

export function WhatIfSummaryTable({ rows, actualFinalValue }: WhatIfSummaryTableProps) {
  const mode = useColorScheme();
  if (rows.length === 0) return null;

  const ink = 'text-[#52514e] dark:text-[#c3c2b7]';
  // A fund can be valid yet valued a few days behind the others if it stopped reporting recently.
  // "Value today" would be quietly wrong for it, so the row says which day it is actually from.
  const latestValuation = Math.max(
    ...rows.map((r) => (hasValue(r.simulation) ? r.simulation.finalTime : 0)),
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e1e0d9] dark:border-[#2c2c2a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e1e0d9] text-left text-xs text-[#898781] dark:border-[#2c2c2a]">
            <th className="px-3 py-2 font-normal">Fund</th>
            <th className="px-3 py-2 text-right font-normal">Invested</th>
            <th className="px-3 py-2 text-right font-normal">Value today</th>
            <th className="px-3 py-2 text-right font-normal">Gain</th>
            <th className="px-3 py-2 text-right font-normal">Return</th>
            <th className="px-3 py-2 text-right font-normal" title="Annualised, accounting for when each purchase was made">
              XIRR
            </th>
            <th className="px-3 py-2 text-right font-normal">vs your fund</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ simulation, colorIndex, isActual }) => {
            const valued = hasValue(simulation);
            const versus =
              valued && !isActual && actualFinalValue !== null
                ? simulation.finalValue - actualFinalValue
                : null;

            return (
              <tr
                key={simulation.schemeCode}
                className="border-b border-[#e1e0d9] last:border-0 dark:border-[#2c2c2a]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForIndex(colorIndex, mode) }}
                      aria-hidden
                    />
                    <span
                      className="truncate text-[#0b0b0b] dark:text-white"
                      title={simulation.name}
                    >
                      {simulation.name}
                    </span>
                    {isActual && (
                      <span className="shrink-0 rounded bg-[#f0efec] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#52514e] dark:bg-[#2c2c2a] dark:text-[#c3c2b7]">
                        yours
                      </span>
                    )}
                    {valued && simulation.skippedAmount > 0 && (
                      <span
                        className="shrink-0 text-xs text-[#898781]"
                        title={`This fund did not exist for ${simulation.skippedPurchases.length} of your purchases — ${formatInr(simulation.skippedAmount)} could not be invested in it.`}
                      >
                        ⓘ
                      </span>
                    )}
                  </div>
                </td>

                {valued ? (
                  <>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${ink}`}>
                      {formatInr(simulation.invested)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-[#0b0b0b] dark:text-white">
                      {formatInr(simulation.finalValue)}
                      {simulation.finalTime < latestValuation && (
                        <span className="block text-xs font-normal text-[#898781]">
                          as of {formatAxisDate(simulation.finalTime)}
                        </span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                      style={{ color: deltaColor(simulation.gain, mode) }}
                    >
                      {formatInrSigned(simulation.gain)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums"
                      style={{ color: deltaColor(simulation.returnPct, mode) }}
                    >
                      {formatPctSigned(simulation.returnPct)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${ink}`}>
                      {simulation.xirrPct === null ? '—' : formatPctSigned(simulation.xirrPct)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                      {versus === null ? (
                        <span className="text-[#898781]">—</span>
                      ) : (
                        <span style={{ color: deltaColor(versus, mode) }}>
                          {formatInrSigned(versus)}
                        </span>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={6} className="px-3 py-2 text-right text-xs text-[#898781]">
                    {UNAVAILABLE_REASON[simulation.reason]}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
