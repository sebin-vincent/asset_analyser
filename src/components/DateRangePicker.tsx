import { toDateInputValue } from '../utils/dateUtils';
import type { DateRange } from '../types/fund';

interface DateRangePickerProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
  earliestAvailable: Date | null; // used for the "Max" preset; null until at least one fund has loaded
}

interface Preset {
  label: string;
  months?: number;
  years?: number;
  kind?: 'ytd' | 'max';
}

const PRESETS: Preset[] = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: 'YTD', kind: 'ytd' },
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: 'Max', kind: 'max' },
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// A preset is "active" when it exactly reproduces the current range — not tracked as
// its own state, so it can never drift from the range that's actually plotted.
function activePresetLabel(range: DateRange, today: Date, earliestAvailable: Date | null): string | null {
  const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
  if (!sameDay(range.end, today)) return null;
  for (const preset of PRESETS) {
    if (preset.kind === 'max') {
      if (earliestAvailable && sameDay(range.start, earliestAvailable)) return preset.label;
      continue;
    }
    if (preset.kind === 'ytd') {
      if (sameDay(range.start, new Date(today.getFullYear(), 0, 1))) return preset.label;
      continue;
    }
    const start = new Date(today);
    if (preset.months) start.setMonth(start.getMonth() - preset.months);
    if (preset.years) start.setFullYear(start.getFullYear() - preset.years);
    if (sameDay(range.start, start)) return preset.label;
  }
  return null;
}

export function DateRangePicker({ range, onChange, earliestAvailable }: DateRangePickerProps) {
  const today = startOfToday();
  const active = activePresetLabel(range, today, earliestAvailable);

  const applyPreset = (preset: Preset) => {
    if (preset.kind === 'max') {
      onChange({ start: earliestAvailable ?? today, end: today });
      return;
    }
    if (preset.kind === 'ytd') {
      onChange({ start: new Date(today.getFullYear(), 0, 1), end: today });
      return;
    }
    const start = new Date(today);
    if (preset.months) start.setMonth(start.getMonth() - preset.months);
    if (preset.years) start.setFullYear(start.getFullYear() - preset.years);
    onChange({ start, end: today });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="group" aria-label="Date range preset" className="flex overflow-hidden rounded-md border border-line">
        {PRESETS.map((preset, i) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={active === preset.label}
            onClick={() => applyPreset(preset)}
            disabled={preset.kind === 'max' && !earliestAvailable}
            className={`px-2.5 py-1 font-mono text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
              i > 0 ? 'border-l border-line' : ''
            } ${
              active === preset.label
                ? 'bg-acc font-semibold text-white'
                : 'bg-plate text-ink-2 hover:bg-plate-2 hover:text-ink'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-l border-line pl-3">
        <input
          type="date"
          value={toDateInputValue(range.start)}
          max={toDateInputValue(range.end)}
          onChange={(e) => onChange({ ...range, start: new Date(e.target.value + 'T00:00:00Z') })}
          className="rounded-md border border-line bg-ground px-2 py-1 font-mono text-sm text-ink focus:border-acc focus:outline-none focus:ring-2 focus:ring-acc-wash"
        />
        <span className="text-sm text-ink-3">to</span>
        <input
          type="date"
          value={toDateInputValue(range.end)}
          min={toDateInputValue(range.start)}
          max={toDateInputValue(today)}
          onChange={(e) => onChange({ ...range, end: new Date(e.target.value + 'T00:00:00Z') })}
          className="rounded-md border border-line bg-ground px-2 py-1 font-mono text-sm text-ink focus:border-acc focus:outline-none focus:ring-2 focus:ring-acc-wash"
        />
      </div>
    </div>
  );
}
