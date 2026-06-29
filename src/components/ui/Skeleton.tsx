interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className = "", rounded = false }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${rounded ? "rounded-full" : ""} ${className}`}
      aria-hidden="true"
    />
  );
}

export function ReportRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-4 w-4" rounded />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-24 opacity-60" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-3.5 w-20" />
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="card overflow-hidden" aria-label="Loading reports">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={i > 0 ? "border-t" : ""}
          style={{ borderColor: "var(--border)" }}
        >
          <ReportRowSkeleton />
        </div>
      ))}
    </div>
  );
}
