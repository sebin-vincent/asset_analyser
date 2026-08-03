import { useColorScheme } from '../hooks/useColorScheme';
import { colorForIndex } from '../utils/colors';
import type { SelectedFund } from '../types/fund';

interface SelectedFundsListProps {
  funds: SelectedFund[];
  onRemove: (schemeCode: number) => void;
  loading: Record<number, boolean>;
  errors: Record<number, string>;
  onRetry: (schemeCode: number) => void;
  partialRangeNotes: Record<number, string>;
}

export function SelectedFundsList({
  funds,
  onRemove,
  loading,
  errors,
  onRetry,
  partialRangeNotes,
}: SelectedFundsListProps) {
  const mode = useColorScheme();

  if (funds.length === 0) {
    return (
      <p className="text-sm text-[#898781]">
        No funds selected yet — search above and add a few to compare.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {funds.map((fund) => {
        const color = colorForIndex(fund.colorIndex, mode);
        const note = partialRangeNotes[fund.schemeCode];
        const error = errors[fund.schemeCode];
        return (
          <li
            key={fund.schemeCode}
            className="flex max-w-xs items-center gap-2 rounded-full border border-[#e1e0d9] bg-[#fcfcfb] py-1.5 pl-3 pr-2 text-sm dark:border-[#2c2c2a] dark:bg-[#1a1a19]"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="truncate text-[#0b0b0b] dark:text-white" title={fund.name}>
              {fund.name}
            </span>
            {loading[fund.schemeCode] && (
              <span className="shrink-0 text-xs text-[#898781]">loading…</span>
            )}
            {error && (
              <button
                type="button"
                onClick={() => onRetry(fund.schemeCode)}
                className="shrink-0 text-xs text-[#e34948] underline"
                title={error}
              >
                retry
              </button>
            )}
            {note && !error && (
              <span className="shrink-0 text-xs text-[#898781]" title={note}>
                ⓘ
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(fund.schemeCode)}
              aria-label={`Remove ${fund.name}`}
              className="shrink-0 text-[#898781] hover:text-[#0b0b0b] dark:hover:text-white"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
