import { useEffect, useRef, useState } from 'react';

export function TradebookHelp() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How to get your tradebook CSV file"
        className="flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:text-acc focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.9" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Getting your tradebook CSV"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-lg border border-line bg-plate p-6 shadow-lg"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-ink">Getting your tradebook CSV</p>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-plate-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
              >
                ✕
              </button>
            </div>

            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
              <li>Open Zerodha Console → Reports → Tradebook.</li>
              <li>Set Segment to "Mutual funds".</li>
              <li>Pick the date range covering your holding period.</li>
              <li>Click Download and choose CSV.</li>
            </ol>

            <img
              src="/download_order_history.png"
              alt="Zerodha Console Tradebook report screen showing the Mutual funds segment and Download CSV link"
              className="mt-4 w-full rounded-md border border-line"
            />
          </div>
        </div>
      )}
    </>
  );
}
