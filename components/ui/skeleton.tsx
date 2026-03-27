import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// A skeleton placeholder for table-style lists
function SkeletonTable({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("w-full space-y-0", className)}>
      {/* Header row */}
      <div className="flex gap-4 px-4 py-3 border-b border-stone-100">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 bg-stone-200/70" style={{ maxWidth: i === 0 ? "40%" : undefined }} />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div key={rowIdx} className="flex gap-4 px-4 py-3.5 border-b border-stone-50 last:border-0">
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton
              key={colIdx}
              className="h-3 flex-1 bg-stone-100"
              style={{ maxWidth: colIdx === 0 ? "40%" : undefined, opacity: 1 - rowIdx * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// A skeleton placeholder for metric/summary cards
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-stone-100 bg-white p-5 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24 bg-stone-100" />
        <Skeleton className="h-6 w-6 rounded-lg bg-stone-100" />
      </div>
      <Skeleton className="h-7 w-32 bg-stone-200/60" />
      <Skeleton className="h-2.5 w-20 bg-stone-100" />
    </div>
  )
}

export { Skeleton, SkeletonTable, SkeletonCard }
