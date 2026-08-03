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

export function DateRangePicker({ range, onChange, earliestAvailable }: DateRangePickerProps) {
  const today = startOfToday();

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
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            disabled={preset.kind === 'max' && !earliestAvailable}
            className="rounded-md px-2.5 py-1 text-sm text-[#52514e] hover:bg-[#f0efec] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#c3c2b7] dark:hover:bg-[#2c2c2a]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-l border-[#e1e0d9] pl-3 dark:border-[#2c2c2a]">
        <input
          type="date"
          value={toDateInputValue(range.start)}
          max={toDateInputValue(range.end)}
          onChange={(e) => onChange({ ...range, start: new Date(e.target.value + 'T00:00:00Z') })}
          className="rounded-md border border-[#e1e0d9] bg-[#fcfcfb] px-2 py-1 text-sm text-[#0b0b0b] dark:border-[#2c2c2a] dark:bg-[#1a1a19] dark:text-white"
        />
        <span className="text-sm text-[#898781]">to</span>
        <input
          type="date"
          value={toDateInputValue(range.end)}
          min={toDateInputValue(range.start)}
          max={toDateInputValue(today)}
          onChange={(e) => onChange({ ...range, end: new Date(e.target.value + 'T00:00:00Z') })}
          className="rounded-md border border-[#e1e0d9] bg-[#fcfcfb] px-2 py-1 text-sm text-[#0b0b0b] dark:border-[#2c2c2a] dark:bg-[#1a1a19] dark:text-white"
        />
      </div>
    </div>
  );
}
