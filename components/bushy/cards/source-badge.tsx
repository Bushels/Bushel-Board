import {
  User,
  Users,
  Building2,
  Globe,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { SourceTag } from "../types";

const CONFIG: Record<SourceTag, { icon: LucideIcon; className: string }> = {
  "your history": { icon: User, className: "bg-canola/12 text-canola" },
  "local reports": { icon: Users, className: "bg-prairie/12 text-prairie" },
  "posted pricing": {
    icon: Building2,
    className: "bg-[#2e6b9e]/12 text-[#2e6b9e]",
  },
  "national market": {
    icon: Globe,
    className: "bg-muted-foreground/12 text-muted-foreground",
  },
  sponsored: { icon: Star, className: "bg-amber-500/12 text-amber-600" },
};

interface SourceBadgeProps {
  tag: SourceTag;
}

export function SourceBadge({ tag }: SourceBadgeProps) {
  const { icon: Icon, className } = CONFIG[tag];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {tag}
    </span>
  );
}
