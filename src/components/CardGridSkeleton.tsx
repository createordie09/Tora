export default function CardGridSkeleton({ count = 6, label = 'Chargement…' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[92px] rounded-xl bg-surface-1 border border-white/5 p-3.5 animate-pulse" aria-hidden="true">
          <div className="w-9 h-9 rounded-lg bg-surface-1 mb-2.5" />
          <div className="h-2.5 w-3/4 rounded bg-surface-2" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
