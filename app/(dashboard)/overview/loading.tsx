import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      <section>
        <Skeleton className="h-6 w-64 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-[400px] rounded-xl" />
      </section>
    </div>
  );
}
