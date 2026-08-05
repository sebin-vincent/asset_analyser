import type { ReactNode } from 'react';

interface FlagProps {
  children: ReactNode;
  title?: string;
}

// A labelled, hoverable caveat chip — the promoted form of the bare "ⓘ" glyph. This
// app's failure mode is a plausible wrong number, so every honest-uncertainty signal
// the pure modules already compute (partial range, skipped purchases, no NAV update,
// stale valuation) gets a name a reader can see without hovering, not just a tooltip.
export function Flag({ children, title }: FlagProps) {
  return (
    <span
      title={title}
      className="shrink-0 rounded border border-brass bg-brass-wash px-1 font-mono text-[9.5px] tracking-wide text-brass uppercase"
    >
      {children}
    </span>
  );
}
