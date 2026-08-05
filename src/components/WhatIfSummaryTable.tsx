import { Flag } from './Flag';
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
  // Same winner WhatIfChart's "Best alternative" readout names — passed down rather
  // than re-derived, so the table and the chart header can't disagree.
  bestAlternativeCode: number | null;
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

export function WhatIfSummaryTable({ rows, actualFinalValue, bestAlternativeCode }: WhatIfSummaryTableProps) {
  const mode = useColorScheme();
  if (rows.length === 0) return null;

  // A fund can be valid yet valued a few days behind the others if it stopped reporting recently.
  // "Value today" would be quietly wrong for it, so the row says which day it is actually from.
  const latestValuation = Math.max(
    ...rows.map((r) => (hasValue(r.simulation) ? r.simulation.finalTime : 0)),
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-plate">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-plate-2 text-left font-mono text-[10px] tracking-wider text-ink-3 uppercase">
            <th className="px-3 py-2 font-normal">Fund</th>
            <th className="px-3 py-2 text-right font-normal">Invested</th>
            <th className="px-3 py-2 text-right font-normal">Value today</th>
            <th className="px-3 py-2 text-right font-normal">Gain</th>
            <th className="px-3 py-2 text-right font-normal">Return</th>
            <th
              className="px-3 py-2 text-right font-normal"
              title="Annualised, accounting for when each purchase was made"
            >
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
            const isBest = !isActual && bestAlternativeCode === simulation.schemeCode;

            return (
              <tr
                key={simulation.schemeCode}
                className={`border-b border-line last:border-0 ${isBest ? 'bg-acc-wash' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-0.5 w-3 shrink-0"
                      style={{ backgroundColor: colorForIndex(colorIndex, mode) }}
                      aria-hidden
                    />
                    <span className="truncate text-ink" title={simulation.name}>
                      {simulation.name}
                    </span>
                    {isActual && <Flag>Yours</Flag>}
                    {valued && simulation.skippedAmount > 0 && (
                      <Flag
                        title={`This fund did not exist for ${simulation.skippedPurchases.length} of your purchases — ${formatInr(simulation.skippedAmount)} could not be invested in it.`}
                      >
                        Gap
                      </Flag>
                    )}
                  </div>
                </td>

                {valued ? (
                  <>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                      {formatInr(simulation.invested)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-medium tabular-nums text-ink">
                      {formatInr(simulation.finalValue)}
                      {simulation.finalTime < latestValuation && (
                        <span className="block font-sans text-xs font-normal text-ink-3">
                          as of {formatAxisDate(simulation.finalTime)}
                        </span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums"
                      style={{ color: deltaColor(simulation.gain, mode) }}
                    >
                      {formatInrSigned(simulation.gain)}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums"
                      style={{ color: deltaColor(simulation.returnPct, mode) }}
                    >
                      {formatPctSigned(simulation.returnPct)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-ink-2">
                      {simulation.xirrPct === null ? '—' : formatPctSigned(simulation.xirrPct)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      {versus === null ? (
                        <span className="text-ink-3">—</span>
                      ) : (
                        <span style={{ color: deltaColor(versus, mode) }}>{formatInrSigned(versus)}</span>
                      )}
                    </td>
                  </>
                ) : (
                  <td colSpan={6} className="px-3 py-2 text-right text-xs text-ink-3">
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
