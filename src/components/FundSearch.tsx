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
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder="Search for a mutual fund (e.g. HDFC Large Cap Fund)"
        className="w-full rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-4 py-2.5 text-sm text-[#0b0b0b] placeholder:text-[#898781] focus:border-[#2a78d6] focus:outline-none dark:border-[#2c2c2a] dark:bg-[#1a1a19] dark:text-white dark:placeholder:text-[#898781]"
      />

      {isOpen && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] shadow-lg dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
          {isQueryTooShort && (
            <p className="px-4 py-3 text-sm text-[#898781]">Keep typing (3+ characters)…</p>
          )}
          {!isQueryTooShort && loading && (
            <p className="px-4 py-3 text-sm text-[#898781]">Searching…</p>
          )}
          {!isQueryTooShort && error && (
            <p className="px-4 py-3 text-sm text-[#e34948]">Search failed: {error}</p>
          )}
          {!isQueryTooShort && !loading && !error && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-[#898781]">No matching funds found — try a different name.</p>
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
                  className="block w-full truncate px-4 py-2.5 text-left text-sm text-[#0b0b0b] hover:bg-[#f0efec] disabled:cursor-not-allowed disabled:text-[#898781] disabled:hover:bg-transparent dark:text-white dark:hover:bg-[#2c2c2a]"
                  title={fund.schemeName}
                >
                  {fund.schemeName}
                  {alreadyAdded && <span className="ml-2 text-xs text-[#898781]">(already added)</span>}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
