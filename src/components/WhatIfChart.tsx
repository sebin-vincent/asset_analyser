import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DotItemDotProps } from 'recharts';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import type { FundSimulation } from '../utils/counterfactual';
import { formatAxisDate } from '../utils/dateUtils';
import { formatInr, formatInrCompact, formatInrSigned, formatPctSigned } from '../utils/format';
import type { ChartPoint } from '../types/fund';

export interface WhatIfLine {
  schemeCode: number;
  name: string;
  colorIndex: number;
}

// Same mirror of src/index.css as ComparisonChart.tsx — Recharts props take literal
// colors, not CSS custom properties.
const TOKENS = {
  light: { plate: '#fcfcfb', line: '#e3e2da', ink: '#0b0b0b', ink3: '#898781' },
  dark: { plate: '#1a1a19', line: '#2c2c2a', ink: '#f4f3ee', ink3: '#8f8d86' },
} as const;

interface WhatIfChartProps {
  chartData: ChartPoint[];
  lines: WhatIfLine[];
  totalInvested: number;
  actual: Extract<FundSimulation, { kind: 'ok' | 'partial' }> | null;
  bestAlternative: { schemeCode: number; name: string; versus: number } | null;
}

interface TooltipEntry {
  value?: number | null;
}

interface WhatIfTooltipProps {
  // Injected by Recharts. The custom props below avoid every injected name.
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  lines: WhatIfLine[];
  mode: 'light' | 'dark';
  invested: number;
}

function WhatIfTooltip({ active, payload, label, lines, mode, invested }: WhatIfTooltipProps) {
  // Recharts renders custom content even when the box is invisible: a row where every series is
  // null yields payload: [] and a hidden wrapper, but this component still mounts and runs.
  if (!active || !payload?.length || typeof label !== 'number') return null;

  const rows = lines
    .map((line, idx) => ({ line, value: payload[idx]?.value }))
    .filter((row): row is { line: WhatIfLine; value: number } => typeof row.value === 'number')
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-plate px-3 py-2 text-sm shadow-lg">
      <p className="mb-1.5 font-mono text-xs text-ink-3">{formatAxisDate(label)}</p>
      <ul className="space-y-1">
        {rows.map(({ line, value }) => (
          <li key={line.schemeCode} className="flex items-center gap-3">
            <span
              className="h-0.5 w-3 shrink-0"
              style={{ backgroundColor: colorForIndex(line.colorIndex, mode) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink-2">{line.name}</span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-ink">
              {formatInr(value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-line pt-1.5 font-mono text-xs text-ink-3">
        Invested so far {formatInr(invested)}
      </p>
    </div>
  );
}

// Mirrors ComparisonChart's endpoint dot: renders only at each line's last point, with
// a rupee value rather than a percentage.
function makeEndpointDot(lastIndex: number, color: string, plateColor: string, inkColor: string) {
  return (props: DotItemDotProps) => {
    const { cx, cy, index, value } = props;
    if (cx == null || cy == null || index !== lastIndex || typeof value !== 'number') {
      return <circle cx={cx ?? -10} cy={cy ?? -10} r={0} fill="none" />;
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={3.5} fill={color} stroke={plateColor} strokeWidth={2} />
        <text x={cx + 8} y={cy + 4} fontSize={11} fontWeight={600} fontFamily="var(--font-mono)" fill={inkColor}>
          {formatInrCompact(value)}
        </text>
      </g>
    );
  };
}

export function WhatIfChart({ chartData, lines, totalInvested, actual, bestAlternative }: WhatIfChartProps) {
  const mode = useColorScheme();
  const t = TOKENS[mode];
  const lastIndex = chartData.length - 1;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-plate">
      <div className="flex flex-wrap items-end gap-5 border-b border-line px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Invested</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-ink">
            {formatInr(totalInvested)}
          </span>
        </div>
        {actual && (
          <>
            <div className="h-8 w-px self-center bg-line" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Your fund today</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-ink">
                {formatInr(actual.finalValue)}
              </span>
              <span className="font-mono text-xs" style={{ color: deltaColor(actual.gain, mode) }}>
                {formatInrSigned(actual.gain)} · {formatPctSigned(actual.returnPct)}
              </span>
            </div>
          </>
        )}
        {bestAlternative && (
          <>
            <div className="h-8 w-px self-center bg-line" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Best alternative</span>
              <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: deltaColor(bestAlternative.versus, mode) }}>
                {formatInrSigned(bestAlternative.versus)}
              </span>
              <span className="max-w-[22ch] truncate text-xs text-ink-2" title={bestAlternative.name}>
                {bestAlternative.name}
              </span>
            </div>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 12, right: 84, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={t.line} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatAxisDate(v)}
            stroke={t.ink3}
            tick={{ fill: t.ink3, fontSize: 12, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={{ stroke: t.line }}
          />
          <YAxis
            tickFormatter={formatInrCompact}
            stroke={t.ink3}
            tick={{ fill: t.ink3, fontSize: 12, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip content={<WhatIfTooltip lines={lines} mode={mode} invested={totalInvested} />} />

          {/* Everything above this line is profit. ifOverflow="hidden" because the "discard"
              default silently drops the element when it falls outside the y-domain. */}
          <ReferenceLine
            y={totalInvested}
            ifOverflow="hidden"
            stroke={t.ink3}
            strokeDasharray="4 4"
            strokeWidth={1}
            zIndex={450} // ReferenceLine defaults to 400, tying with <Line> and resolving by DOM order
            label={{
              value: `Invested ${formatInrCompact(totalInvested)}`,
              position: 'insideTopLeft',
              fill: t.ink3,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
          />

          {lines.map((line) => (
            <Line
              key={line.schemeCode}
              type="monotone"
              dataKey={String(line.schemeCode)}
              name={line.name}
              stroke={colorForIndex(line.colorIndex, mode)}
              strokeWidth={2}
              dot={makeEndpointDot(lastIndex, colorForIndex(line.colorIndex, mode), t.plate, t.ink)}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* HTML legend — see ComparisonChart.tsx for why this replaces Recharts' <Legend>. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-4 py-2.5">
        {lines.map((line) => (
          <span key={line.schemeCode} className="flex items-center gap-2 text-xs text-ink-2">
            <span
              className="h-0.5 w-3 shrink-0"
              style={{ backgroundColor: colorForIndex(line.colorIndex, mode) }}
              aria-hidden
            />
            <span className="max-w-[220px] truncate">{line.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
