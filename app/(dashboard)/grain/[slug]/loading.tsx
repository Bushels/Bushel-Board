import { Skeleton } from "@/components/ui/skeleton";

export default function GrainDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 border-b border-border/40 pb-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[400px] rounded-xl" />
    </div>
  );
}
