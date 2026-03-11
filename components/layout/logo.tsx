import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export function Logo({
  size = 96,
  className,
  priority = true,
}: LogoProps) {
  const width = size;
  const height = Math.round(size * 0.75);

  return (
    <Image
      src="/logo.svg"
      alt="Bushel Board"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto", className)}
    />
  );
}
