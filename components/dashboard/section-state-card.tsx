import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionStateCardProps {
  title: string;
  message: string;
  className?: string;
}

export function SectionStateCard({
  title,
  message,
  className,
}: SectionStateCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-muted-foreground/20 bg-muted/30 p-6 text-center",
        className
      )}
    >
      <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
