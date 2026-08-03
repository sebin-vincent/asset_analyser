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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e1e0d9] bg-[#fcfcfb] px-4 py-3 dark:border-[#2c2c2a] dark:bg-[#1a1a19]">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#0b0b0b] dark:text-white">
            {loadedFund.symbol}
          </p>
          <p className="text-xs text-[#898781]">
            {loadedFund.trades.length}{' '}
            {loadedFund.trades.length === 1 ? 'purchase' : 'purchases'} ·{' '}
            {formatInr(loadedFund.totalInvested)} invested · {loadedFund.totalUnits.toFixed(3)}{' '}
            units
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (inputRef.current) inputRef.current.value = '';
            onClear();
          }}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-[#52514e] hover:bg-[#f0efec] dark:text-[#c3c2b7] dark:hover:bg-[#2c2c2a]"
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
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
          dragging
            ? 'border-[#2a78d6] bg-[#f0f6fd] dark:border-[#3987e5] dark:bg-[#16202c]'
            : 'border-[#e1e0d9] bg-[#fcfcfb] hover:border-[#c9c8c0] dark:border-[#2c2c2a] dark:bg-[#1a1a19] dark:hover:border-[#3d3d3a]'
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
        <p className="text-sm font-medium text-[#0b0b0b] dark:text-white">
          Drop your Zerodha tradebook CSV here, or click to choose
        </p>
        <p className="mt-1 text-xs text-[#898781]">
          Console → Reports → Tradebook → Mutual funds → download CSV. Nothing leaves your browser.
        </p>
      </label>

      {error && (
        <p className="mt-2 rounded-md border border-[#f0c9c9] bg-[#fdf4f4] px-3 py-2 text-sm text-[#a13333] dark:border-[#4a2626] dark:bg-[#251818] dark:text-[#e88f8f]">
          {error}
        </p>
      )}
    </div>
  );
}
