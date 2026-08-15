import { Flag } from './Flag';
import { Spinner } from './Spinner';
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
    return <p className="text-sm text-ink-3">No funds selected yet — search above and add a few to compare.</p>;
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
            className="flex max-w-xs items-center gap-2 rounded-full border border-line bg-ground py-1.5 pr-2 pl-3 text-sm"
          >
            <span className="h-0.5 w-3 shrink-0" style={{ backgroundColor: color }} aria-hidden />
            <span className="truncate text-ink" title={fund.name}>
              {fund.name}
            </span>
            {loading[fund.schemeCode] && (
              <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">
                <Spinner className="h-3 w-3 text-acc" />
                Loading NAV history…
              </span>
            )}
            {error && (
              <button
                type="button"
                onClick={() => onRetry(fund.schemeCode)}
                className="shrink-0 text-xs text-danger underline"
                title={error}
              >
                retry
              </button>
            )}
            {note && !error && <Flag title={note}>Partial</Flag>}
            <button
              type="button"
              onClick={() => onRemove(fund.schemeCode)}
              aria-label={`Remove ${fund.name}`}
              className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-plate-2 hover:text-ink"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
