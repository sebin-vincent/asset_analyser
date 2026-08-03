import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisInverseDataSnapScale,
} from 'recharts';
import type { InverseScaleFunction } from 'recharts';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import type { ChartPoint, ChartSelection, SelectedFund } from '../types/fund';

interface ComparisonChartProps {
  chartData: ChartPoint[];
  funds: SelectedFund[];
  selection: ChartSelection;
  onPick: (time: number) => void;
}

interface TooltipEntry {
  color?: string;
  name?: string;
  value?: number | null;
}

interface ChartGeometry {
  plotArea: { x: number; y: number; width: number; height: number };
  inverseSnap: InverseScaleFunction;
}

// Renders nothing — exists only to read chart geometry from inside the chart context, where the
// Recharts hooks are usable, and hand it to the pointer handlers on the wrapper.
function GeometryProbe({ geometryRef }: { geometryRef: React.RefObject<ChartGeometry | null> }) {
  const plotArea = usePlotArea();
  const inverseSnap = useXAxisInverseDataSnapScale();
  // No dep array: geometry changes on every resize/layout pass, and the write is a bare assignment.
  useEffect(() => {
    geometryRef.current = plotArea && inverseSnap ? { plotArea, inverseSnap } : null;
  });
  return null;
}

function ComparisonTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload.filter((entry) => entry.value !== null && entry.value !== undefined);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-3 py-2 text-sm shadow-lg dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
      <p className="mb-1.5 text-xs text-[#898781]">{label !== undefined ? formatAxisDate(label) : ''}</p>
      {rows
        .slice()
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .map((entry, idx) => (
          <div key={idx} className="flex items-center gap-2 py-0.5">
            <span
              className="inline-block h-0.5 w-3 shrink-0"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="font-semibold tabular-nums text-[#0b0b0b] dark:text-white">
              {entry.value?.toFixed(2)}%
            </span>
            <span className="truncate text-[#52514e] dark:text-[#c3c2b7]">{entry.name}</span>
          </div>
        ))}
    </div>
  );
}

const DRAG_TOLERANCE_PX = 4;

export function ComparisonChart({ chartData, funds, selection, onPick }: ComparisonChartProps) {
  const mode = useColorScheme();
  const gridColor = mode === 'dark' ? '#2c2c2a' : '#e1e0d9';
  const axisColor = '#898781';
  // Neutral rather than an accent hue, so the band can never be mistaken for a series color.
  const bandFill = mode === 'dark' ? '#ffffff' : '#0b0b0b';
  const bandOpacity = mode === 'dark' ? 0.08 : 0.06;

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const geometryRef = useRef<ChartGeometry | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Below two points every click resolves to the same timestamp, so there is no reachable
  // second endpoint — don't offer the interaction at all.
  const interactive = chartData.length >= 2;
  const isPicking = selection.phase === 'picking';

  // Resolves a viewport x-coordinate to a timestamp snapped to a real data row, or null if the
  // pointer isn't over the plot area. Reading the geometry directly (rather than Recharts'
  // activeLabel) keeps this synchronous — activeLabel is derived from rAF-throttled hover state
  // and lags the click by up to a frame.
  const resolveTime = (clientX: number, clientY: number): number | null => {
    const wrapper = wrapperRef.current;
    const geometry = geometryRef.current;
    if (!wrapper || !geometry) return null;

    const rect = wrapper.getBoundingClientRect();
    const chartX = clientX - rect.left;
    const chartY = clientY - rect.top;
    const { plotArea, inverseSnap } = geometry;

    // Bounds-check both axes: this is what keeps clicks on the legend, the x-axis strip and the
    // y-axis gutter from committing an endpoint.
    if (chartX < plotArea.x || chartX > plotArea.x + plotArea.width) return null;
    if (chartY < plotArea.y || chartY > plotArea.y + plotArea.height) return null;

    const value = inverseSnap(chartX);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!interactive || !down || e.button !== 0) return;

    // A press-and-drag would otherwise read as a click and commit at the release point —
    // and drag is exactly what a Google-Finance-trained user tries first.
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > DRAG_TOLERANCE_PX) return;

    const time = resolveTime(e.clientX, e.clientY);
    if (time !== null) onPick(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPicking) return; // avoid pointer-rate re-renders when there's nothing to preview
    setHoverTime(resolveTime(e.clientX, e.clientY));
  };

  const handlePointerLeave = () => {
    pointerDownRef.current = null;
    setHoverTime(null);
  };

  // Resolve the band to draw: locked shows the committed span, picking previews anchor→cursor.
  let band: { start: number; end: number } | null = null;
  let markers: number[] = [];
  if (selection.phase === 'locked') {
    band = { start: selection.start, end: selection.end };
    markers = [selection.start, selection.end];
  } else if (selection.phase === 'picking') {
    markers = [selection.anchor];
    if (hoverTime !== null && hoverTime !== selection.anchor) {
      band = {
        start: Math.min(selection.anchor, hoverTime),
        end: Math.max(selection.anchor, hoverTime),
      };
      markers = [selection.anchor, hoverTime];
    }
  }

  const hint = !interactive
    ? null
    : isPicking
      ? 'Click a second date to compare · Esc to cancel'
      : selection.phase === 'idle'
        ? 'Click two dates on the chart to compare the change between them'
        : null;

  return (
    <div>
      <p className="mb-1 h-4 text-xs text-[#898781]">{hint}</p>
      <div
        ref={wrapperRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={`select-none ${interactive ? 'cursor-crosshair' : ''}`}
      >
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <GeometryProbe geometryRef={geometryRef} />
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
              tickFormatter={(v: number) => `${v}%`}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            {/* Suppressed mid-pick: it reports range-baselined values, a different quantity
                from the delta the user is in the middle of selecting. */}
            {!isPicking && <Tooltip content={<ComparisonTooltip />} />}
            {funds.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}

            {/* ifOverflow="hidden" on all three: the "discard" default silently drops the whole
                element the moment an endpoint falls outside the domain. */}
            {band && (
              <ReferenceArea
                x1={band.start}
                x2={band.end}
                ifOverflow="hidden"
                fill={bandFill}
                fillOpacity={bandOpacity}
                stroke="none"
              />
            )}
            {markers.map((time) => (
              <ReferenceLine
                key={time}
                x={time}
                ifOverflow="hidden"
                stroke={axisColor}
                strokeDasharray="3 3"
                strokeWidth={1}
                zIndex={450} // ReferenceLine defaults to 400, tying with <Line> and resolving by DOM order
              />
            ))}

            {funds.map((fund) => (
              <Line
                key={fund.schemeCode}
                type="monotone"
                dataKey={String(fund.schemeCode)}
                name={fund.name}
                stroke={colorForIndex(fund.colorIndex, mode)}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
