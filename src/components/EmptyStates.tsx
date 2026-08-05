interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-plate text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink-3">{description}</p>}
    </div>
  );
}
