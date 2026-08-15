import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
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
import type { DotItemDotProps, InverseScaleFunction } from 'recharts';
import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex, deltaColor } from '../utils/colors';
import { formatAxisDate } from '../utils/dateUtils';
import { formatPctSigned } from '../utils/format';
import type { FundDelta, FundNav } from '../utils/selectionDelta';
import type { ChartPoint, ChartSelection, FundReturnSummary, SelectedFund } from '../types/fund';

interface ComparisonChartProps {
  chartData: ChartPoint[];
  funds: SelectedFund[];
  summaries: FundReturnSummary[];
  selection: ChartSelection;
  onPick: (time: number) => void;
  navsAt: (time: number) => FundNav[];
  deltasBetween: (start: number, end: number) => FundDelta[];
}

interface TooltipEntry {
  value?: number | null;
}

// Tokens as literals: this component already switches every color by `mode` at
// the JS level (Recharts stroke/fill props don't accept CSS custom properties),
// so these mirror src/index.css rather than reading it — keep them in sync if
// the palette in index.css changes.
const TOKENS = {
  light: { plate: '#fcfcfb', line: '#e3e2da', ink: '#0b0b0b', ink3: '#898781', acc: '#14615c' },
  dark: { plate: '#1a1a19', line: '#2c2c2a', ink: '#f4f3ee', ink3: '#8f8d86', acc: '#4bb3aa' },
} as const;

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
      <span className="truncate text-ink-2">{name}</span>
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
    <div className="rounded-lg border border-line bg-plate px-3 py-2 text-sm shadow-lg">
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
      <p className="mb-1.5 font-mono text-xs text-ink-3">
        {formatAxisDate(label)} <span className="opacity-70">· vs {formatAxisDate(anchorTime)}</span>
      </p>,
      <>
        {valued.map((d) => (
          <TooltipRow key={d.schemeCode} color={colorFor(d.schemeCode)} name={d.name}>
            <span className="font-mono font-semibold tabular-nums" style={{ color: deltaColor(d.pctChange, mode) }}>
              {formatPctSigned(d.pctChange)}
            </span>
          </TooltipRow>
        ))}
        {rest.map((d) => (
          <TooltipRow key={d.schemeCode} color={colorFor(d.schemeCode)} name={d.name}>
            <span className="text-xs text-ink-3">{d.kind === 'no-update' ? 'no update' : '—'}</span>
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
    <p className="mb-1.5 font-mono text-xs text-ink-3">{formatAxisDate(label)}</p>,
    <>
      {rows.map((row) => (
        <TooltipRow key={row.schemeCode} color={colorFor(row.schemeCode)} name={row.name}>
          <span className="font-mono font-semibold tabular-nums text-ink">{row.nav.toFixed(2)}</span>
        </TooltipRow>
      ))}
    </>,
  );
}

const DRAG_TOLERANCE_PX = 4;

// Renders nothing for every point except the series' last one, where it draws an
// emphasized dot plus a value label — the "value rail" that lets each line name its
// own final number without a second glance at the table. Reads cx/cy straight from
// Recharts' own per-point layout, so it needs no geometry access of its own.
function makeEndpointDot(lastIndex: number, color: string, plateColor: string, inkColor: string) {
  return (props: DotItemDotProps) => {
    const { cx, cy, index, value } = props;
    if (cx == null || cy == null || index !== lastIndex || typeof value !== 'number') {
      return <circle cx={cx ?? -10} cy={cy ?? -10} r={0} fill="none" />;
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={3.5} fill={color} stroke={plateColor} strokeWidth={2} />
        <text
          x={cx + 8}
          y={cy + 4}
          fontSize={11}
          fontWeight={600}
          fontFamily="var(--font-mono)"
          fill={inkColor}
        >
          {formatPctSigned(value, 1)}
        </text>
      </g>
    );
  };
}

export function ComparisonChart({
  chartData,
  funds,
  summaries,
  selection,
  onPick,
  navsAt,
  deltasBetween,
}: ComparisonChartProps) {
  const mode = useColorScheme();
  const t = TOKENS[mode];
  const gridColor = t.line;
  const axisColor = t.ink3;
  // The accent, not a series hue: petrol never appears in CATEGORICAL_PALETTE, so
  // the band can't be mistaken for a fund's own color.
  const bandFill = t.acc;
  const bandOpacity = 0.09;

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
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!interactive || !down || e.button !== 0) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    // Same commit whether this is a plain click or a drag's release — a drag's press end
    // already promoted the anchor in handlePointerMove, so this call is symmetric with a
    // first click's.
    const time = resolveTime(e.clientX, e.clientY);
    if (time !== null) onPick(time);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownRef.current;
    let picking = isPicking;

    // A press that moves past the drag tolerance while not already mid-pick is a drag:
    // promote the press origin to the anchor now, exactly as a first click would have.
    if (down && selection.phase !== 'picking') {
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > DRAG_TOLERANCE_PX) {
        const anchorTime = resolveTime(down.x, down.y);
        if (anchorTime !== null) {
          onPick(anchorTime);
          picking = true;
        }
      }
    }

    if (!picking) return; // avoid pointer-rate re-renders when there's nothing to preview
    setHoverTime(resolveTime(e.clientX, e.clientY));
  };

  const handlePointerLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    // Mid-drag, capture keeps move/up targeted here regardless of physical pointer position —
    // don't cancel the gesture just because it crossed our bounds.
    if (pointerDownRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) return;
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
      ? 'Click or drag to a second date to compare · Esc to cancel'
      : selection.phase === 'idle'
        ? 'Click two dates, or drag between them, to compare the change'
        : null;

  // Leader/trailer/spread read straight off the already-computed return summaries —
  // no new math, just min/max over numbers the returns table shows too. Unlike the
  // two-point selection delta (which must never subtract two range-baselined
  // percentages), this *is* a plain difference: two independent, already-correct
  // total-return percentages, hence labelled in percentage points, not percent.
  const sortedSummaries = [...summaries].sort((a, b) => b.absoluteReturnPct - a.absoluteReturnPct);
  const leader = sortedSummaries[0] ?? null;
  const trailer = sortedSummaries.length > 1 ? sortedSummaries[sortedSummaries.length - 1] : null;
  const lastIndex = chartData.length - 1;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-plate">
      <div className="flex flex-wrap items-end gap-5 border-b border-line px-4 py-3">
        {leader && (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Leading</span>
            <span
              className="font-mono text-lg font-semibold tabular-nums"
              style={{ color: deltaColor(leader.absoluteReturnPct, mode) }}
            >
              {formatPctSigned(leader.absoluteReturnPct)}
            </span>
            <span className="max-w-[22ch] truncate text-xs text-ink-2" title={leader.name}>
              {leader.name}
            </span>
          </div>
        )}
        {trailer && (
          <>
            <div className="h-8 w-px self-center bg-line" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Trailing</span>
              <span
                className="font-mono text-lg font-semibold tabular-nums"
                style={{ color: deltaColor(trailer.absoluteReturnPct, mode) }}
              >
                {formatPctSigned(trailer.absoluteReturnPct)}
              </span>
              <span className="max-w-[22ch] truncate text-xs text-ink-2" title={trailer.name}>
                {trailer.name}
              </span>
            </div>
            <div className="h-8 w-px self-center bg-line" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-wider text-ink-3 uppercase">Spread</span>
              <span className="font-mono text-lg font-semibold tabular-nums text-ink">
                {(leader.absoluteReturnPct - trailer.absoluteReturnPct).toFixed(2)} pp
              </span>
            </div>
          </>
        )}
        {hint && (
          <p className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
            {hint}
            {isPicking && <kbd className="rounded border border-line px-1 font-mono text-[10px]">Esc</kbd>}
          </p>
        )}
      </div>

      <div
        ref={wrapperRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={`select-none ${interactive ? 'cursor-crosshair' : ''}`}
      >
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={chartData} margin={{ top: 12, right: 72, left: 0, bottom: 0 }}>
            <GeometryProbe geometryRef={geometryRef} />
            <CartesianGrid stroke={gridColor} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="date"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => formatAxisDate(v)}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12, fontFamily: 'var(--font-mono)' }}
              tickLine={false}
              axisLine={{ stroke: gridColor }}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              stroke={axisColor}
              tick={{ fill: axisColor, fontSize: 12, fontFamily: 'var(--font-mono)' }}
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
                dot={makeEndpointDot(lastIndex, colorForIndex(fund.colorIndex, mode), t.plate, t.ink)}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* HTML legend rather than Recharts' <Legend>: that component colors the label
          text with the series stroke, which the project's own convention forbids —
          identity comes from a swatch beside the text, never text wearing the color. */}
      {funds.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-4 py-2.5">
          {funds.map((fund) => (
            <span key={fund.schemeCode} className="flex items-center gap-2 text-xs text-ink-2">
              <span
                className="h-0.5 w-3 shrink-0"
                style={{ backgroundColor: colorForIndex(fund.colorIndex, mode) }}
                aria-hidden
              />
              <span className="max-w-[220px] truncate">{fund.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
