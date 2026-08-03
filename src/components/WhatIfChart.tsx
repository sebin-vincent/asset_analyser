import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import { formatInr, formatInrCompact } from '../utils/format';
import type { ChartPoint } from '../types/fund';

export interface WhatIfLine {
  schemeCode: number;
  name: string;
  colorIndex: number;
}

interface WhatIfChartProps {
  chartData: ChartPoint[];
  lines: WhatIfLine[];
  totalInvested: number;
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
    <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-3 py-2 text-sm shadow-lg dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
      <p className="mb-1.5 text-xs text-[#898781]">{formatAxisDate(label)}</p>
      <ul className="space-y-1">
        {rows.map(({ line, value }) => (
          <li key={line.schemeCode} className="flex items-center gap-3">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorForIndex(line.colorIndex, mode) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[#0b0b0b] dark:text-white">
              {line.name}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-[#0b0b0b] dark:text-white">
              {formatInr(value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 border-t border-[#e1e0d9] pt-1.5 text-xs text-[#898781] dark:border-[#2c2c2a]">
        Invested so far {formatInr(invested)}
      </p>
    </div>
  );
}

export function WhatIfChart({ chartData, lines, totalInvested }: WhatIfChartProps) {
  const mode = useColorScheme();
  const axisColor = mode === 'dark' ? '#898781' : '#73726c';
  const gridColor = mode === 'dark' ? '#2c2c2a' : '#e1e0d9';

  return (
    <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] p-4 dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => formatAxisDate(v)}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: gridColor }}
          />
          <YAxis
            tickFormatter={formatInrCompact}
            stroke={axisColor}
            tick={{ fill: axisColor, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          <Tooltip
            content={<WhatIfTooltip lines={lines} mode={mode} invested={totalInvested} />}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} />

          {/* Everything above this line is profit. ifOverflow="hidden" because the "discard"
              default silently drops the element when it falls outside the y-domain. */}
          <ReferenceLine
            y={totalInvested}
            ifOverflow="hidden"
            stroke={axisColor}
            strokeDasharray="4 4"
            strokeWidth={1}
            zIndex={450} // ReferenceLine defaults to 400, tying with <Line> and resolving by DOM order
            label={{
              value: `Invested ${formatInrCompact(totalInvested)}`,
              position: 'insideTopLeft',
              fill: axisColor,
              fontSize: 11,
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
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
