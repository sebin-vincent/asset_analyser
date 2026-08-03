interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-[420px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#e1e0d9] text-center dark:border-[#2c2c2a]">
      <p className="text-sm font-medium text-[#0b0b0b] dark:text-white">{title}</p>
      {description && <p className="max-w-sm text-sm text-[#898781]">{description}</p>}
    </div>
  );
}
