import { useRef, useState } from 'react';
import { formatInr } from '../utils/format';
import { parseTradebook, type TradebookFund, type TradebookParse } from '../utils/tradebook';

interface TradebookUploadProps {
  onLoad: (funds: TradebookFund[]) => void;
  onClear: () => void;
  loadedFund: TradebookFund | null;
}

function describeError(parse: Exclude<TradebookParse, { kind: 'ok' }>): string {
  switch (parse.kind) {
    case 'empty':
      return 'That file has no rows. Export your tradebook from Zerodha Console and try again.';
    case 'missing-columns':
      return `The file is missing required columns: ${parse.columns.join(', ')}. This should be a Zerodha tradebook export (pipe-separated).`;
    case 'contains-sells': {
      const listed = parse.rows
        .slice(0, 3)
        .map((r) => `line ${r.line} (${r.date})`)
        .join(', ');
      const more = parse.rows.length > 3 ? ` and ${parse.rows.length - 3} more` : '';
      return `This file contains ${parse.rows.length} redemption${parse.rows.length === 1 ? '' : 's'} — ${listed}${more}. Only purchase history is supported for now, and ignoring a redemption would overstate the result. Remove the sell rows and re-upload.`;
    }
    case 'no-buys':
      return 'No purchase rows found in that file.';
    case 'bad-rows':
      return `Could not read ${parse.lines.length} row${parse.lines.length === 1 ? '' : 's'} (line${parse.lines.length === 1 ? '' : 's'} ${parse.lines.slice(0, 5).join(', ')}). Check the quantity, price and date columns.`;
  }
}

export function TradebookUpload({ onLoad, onClear, loadedFund }: TradebookUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    const text = await file.text();
    const parsed = parseTradebook(text);
    if (parsed.kind !== 'ok') {
      setError(describeError(parsed));
      onClear();
      return;
    }
    onLoad(parsed.funds);
  };

  if (loadedFund) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-plate px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{loadedFund.symbol}</p>
          <p className="font-mono text-xs text-ink-3">
            {loadedFund.trades.length} {loadedFund.trades.length === 1 ? 'purchase' : 'purchases'} ·{' '}
            {formatInr(loadedFund.totalInvested)} invested · {loadedFund.totalUnits.toFixed(3)} units
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (inputRef.current) inputRef.current.value = '';
            onClear();
          }}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-ink-2 hover:bg-plate-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
        >
          Upload a different file
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? 'border-acc bg-acc-wash' : 'border-line-strong bg-plate hover:border-ink-3'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className="mb-1 text-acc">
          <path
            d="M11 14.5V3.5M11 3.5 7.2 7.3M11 3.5l3.8 3.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 13.5v2.8a2.2 2.2 0 0 0 2.2 2.2h10.6a2.2 2.2 0 0 0 2.2-2.2v-2.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm font-medium text-ink">Drop your Zerodha tradebook CSV here, or click to choose</p>
        <p className="text-xs text-ink-3">
          Console → Reports → Tradebook → Mutual funds → download CSV. Nothing leaves your browser.
        </p>
      </label>

      {error && (
        <p className="mt-2 rounded-md border border-danger-line bg-danger-wash px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
