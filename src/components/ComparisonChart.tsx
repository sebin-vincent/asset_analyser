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
import { colorForIndex, deltaColor } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import type { FundDelta, FundNav } from '../utils/selectionDelta';
import type { ChartPoint, ChartSelection, SelectedFund } from '../types/fund';

interface ComparisonChartProps {
  chartData: ChartPoint[];
  funds: SelectedFund[];
  selection: ChartSelection;
  onPick: (time: number) => void;
  navsAt: (time: number) => FundNav[];
  deltasBetween: (start: number, end: number) => FundDelta[];
}

interface TooltipEntry {
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

interface ComparisonTooltipProps {
  // Injected by Recharts; our own props below don't collide with any Tooltip prop name.
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  funds: SelectedFund[];
  mode: 'light' | 'dark';
  anchorTime: number | null; // non-null only while picking the second point
  navsAt: (time: number) => FundNav[];
  deltasBetween: (start: number, end: number) => FundDelta[];
}

function TooltipRow({
  color,
  name,
  children,
}: {
  color: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="inline-block h-0.5 w-3 shrink-0" style={{ backgroundColor: color }} aria-hidden />
      {children}
      <span className="truncate text-[#52514e] dark:text-[#c3c2b7]">{name}</span>
    </div>
  );
}

// Shows raw NAVs by default, and switches to "% change since the anchor" only while a comparison
// is being picked — a live preview of the number the panel will report on the second click.
// Both readouts come from selectionDelta.ts, so the preview and the committed panel always agree.
function ComparisonTooltip({
  active,
  payload,
  label,
  funds,
  mode,
  anchorTime,
  navsAt,
  deltasBetween,
}: ComparisonTooltipProps) {
  // Recharts renders `content` even when the box is hidden (filterNull leaves payload empty when
  // every series is null at this row), so this guard is what actually suppresses it.
  if (!active || !payload || payload.length === 0) return null;
  if (typeof label !== 'number') return null;

  const colorByCode = new Map(funds.map((f) => [f.schemeCode, colorForIndex(f.colorIndex, mode)]));
  const colorFor = (code: number) => colorByCode.get(code) ?? 'transparent';

  const wrap = (header: React.ReactNode, body: React.ReactNode) => (
    <div className="rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-3 py-2 text-sm shadow-lg dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
      {header}
      {body}
    </div>
  );

  // Hovering the anchor itself is a zero-width span — fall back to NAVs rather than a column of +0.00%.
  const isPreviewingDelta = anchorTime !== null && label !== anchorTime;

  if (isPreviewingDelta) {
    const deltas = deltasBetween(Math.min(anchorTime, label), Math.max(anchorTime, label));
    const valued = deltas
      .filter((d): d is Extract<FundDelta, { kind: 'ok' | 'partial' }> => d.kind === 'ok' || d.kind === 'partial')
      .sort((a, b) => b.pctChange - a.pctChange);
    const rest = deltas.filter((d) => d.kind !== 'ok' && d.kind !== 'partial');
    if (valued.length === 0 && rest.length === 0) return null;

    return wrap(
      <p className="mb-1.5 text-xs text-[#898781]">
        {formatAxisDate(label)} <span className="opacity-70">· vs {formatAxisDate(anchorTime)}</span>
      </p>,
      <>
        {valued.map((d) => (
          <TooltipRow key={d.schemeCode} color={colorFor(d.schemeCode)} name={d.name}>
            <span
              className="font-semibold tabular-nums"
              style={{ color: deltaColor(d.pctChange, mode) }}
            >
              {d.pctChange >= 0 ? '+' : ''}
              {d.pctChange.toFixed(2)}%
            </span>
          </TooltipRow>
        ))}
        {rest.map((d) => (
          <TooltipRow key={d.schemeCode} color={colorFor(d.schemeCode)} name={d.name}>
            <span className="text-xs text-[#898781]">{d.kind === 'no-update' ? 'no update' : '—'}</span>
          </TooltipRow>
        ))}
      </>,
    );
  }

  const navs = navsAt(label);
  if (navs.length === 0) return null;
  // Fund order, not value order: NAVs across funds priced at 104 vs 1247 don't rank meaningfully.
  const order = new Map(funds.map((f, i) => [f.schemeCode, i]));
  const rows = navs
    .slice()
    .sort((a, b) => (order.get(a.schemeCode) ?? 0) - (order.get(b.schemeCode) ?? 0));

  return wrap(
    <p className="mb-1.5 text-xs text-[#898781]">{formatAxisDate(label)}</p>,
    <>
      {rows.map((row) => (
        <TooltipRow key={row.schemeCode} color={colorFor(row.schemeCode)} name={row.name}>
          <span className="font-semibold tabular-nums text-[#0b0b0b] dark:text-white">
            {row.nav.toFixed(2)}
          </span>
        </TooltipRow>
      ))}
    </>,
  );
}

const DRAG_TOLERANCE_PX = 4;

export function ComparisonChart({
  chartData,
  funds,
  selection,
  onPick,
  navsAt,
  deltasBetween,
}: ComparisonChartProps) {
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
            <Tooltip
              content={
                <ComparisonTooltip
                  funds={funds}
                  mode={mode}
                  anchorTime={selection.phase === 'picking' ? selection.anchor : null}
                  navsAt={navsAt}
                  deltasBetween={deltasBetween}
                />
              }
            />
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
