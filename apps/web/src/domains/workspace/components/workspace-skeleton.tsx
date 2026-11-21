import { Skeleton } from "@repo/web/components/ui/skeleton";

/**
 * A workspace screen in outline while its data loads, so its columns hold
 * their place: the left column (index, findings), the document in the
 * center and the agent on the right. `header` adds an opening's title row
 * and tabs above them.
 */
export function WorkspaceSkeleton({ header = false }: { header?: boolean }) {
  return (
    <div aria-hidden="true" className="flex min-h-0 w-full flex-1 flex-col">
      {header && (
        <div className="flex flex-col gap-3 border-b px-4 pt-4">
          <Skeleton className="h-8 w-96 max-w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex gap-6 pb-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-36" />
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="bg-muted/60 hidden w-80 shrink-0 flex-col gap-3 border-r p-4 lg:flex">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="mt-2 h-3 w-16" />
          {[72, 56, 64, 80, 48, 60].map((width, index) => (
            <Skeleton
              key={index}
              className="h-4"
              style={{ width: `${width}%` }}
            />
          ))}
          <Skeleton className="mt-4 h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="flex min-w-0 flex-1 justify-center overflow-hidden p-8">
          <div className="flex w-full max-w-2xl flex-col gap-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="mt-4 h-6 w-56" />
            {[100, 92, 96, 70, 88, 94, 60].map((width, index) => (
              <Skeleton
                key={index}
                className="h-4"
                style={{ width: `${width}%` }}
              />
            ))}
            <Skeleton className="mt-4 h-6 w-48" />
            {[90, 84, 96, 66].map((width, index) => (
              <Skeleton
                key={index}
                className="h-4"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
        <div className="bg-muted/60 hidden w-96 shrink-0 flex-col gap-3 border-l p-4 lg:flex">
          <Skeleton className="h-8 w-48" />
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-24 w-full rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}

/** A centered page in outline (settings and the like). */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="w-full overflow-hidden">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
