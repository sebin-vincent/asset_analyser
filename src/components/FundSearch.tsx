import { useState } from 'react';
import { useFundSearch } from '../hooks/useFundSearch';
import type { SchemeSearchResult } from '../types/fund';

interface FundSearchProps {
  onAdd: (fund: SchemeSearchResult) => void;
  existingCodes: Set<number>;
}

export function FundSearch({ onAdd, existingCodes }: FundSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { results, loading, error, isQueryTooShort } = useFundSearch(query);

  const handleSelect = (fund: SchemeSearchResult) => {
    onAdd(fund);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3"
        >
          <circle cx="6" cy="6" r="4.4" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9.4 9.4 12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder="Search for a mutual fund (e.g. ITI Multi Cap Fund)"
          className="w-full rounded-lg border border-line bg-ground px-4 py-2.5 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-acc focus:outline-none focus:ring-2 focus:ring-acc-wash"
        />
      </div>

      {isOpen && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-line bg-plate shadow-lg">
          {isQueryTooShort && <p className="px-4 py-3 text-sm text-ink-3">Keep typing (3+ characters)…</p>}
          {!isQueryTooShort && loading && <p className="px-4 py-3 text-sm text-ink-3">Searching…</p>}
          {!isQueryTooShort && error && <p className="px-4 py-3 text-sm text-danger">Search failed: {error}</p>}
          {!isQueryTooShort && !loading && !error && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-3">No matching funds found — try a different name.</p>
          )}
          {!isQueryTooShort &&
            !loading &&
            results.slice(0, 30).map((fund) => {
              const alreadyAdded = existingCodes.has(fund.schemeCode);
              return (
                <button
                  key={fund.schemeCode}
                  type="button"
                  disabled={alreadyAdded}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(fund)}
                  className="block w-full truncate px-4 py-2.5 text-left text-sm text-ink hover:bg-plate-2 disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
                  title={fund.schemeName}
                >
                  {fund.schemeName}
                  {alreadyAdded && <span className="ml-2 text-xs text-ink-3">(already added)</span>}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
