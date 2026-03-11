import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
  variant?: "full" | "mark";
}

export function Logo({
  size = 96,
  className,
  priority = true,
  variant = "full",
}: LogoProps) {
  const width = size;
  const height = variant === "mark" ? size : Math.round(size * 0.75);
  const src = variant === "mark" ? "/favicon.svg" : "/logo.svg";
  const alt = variant === "mark" ? "Bushel Board icon" : "Bushel Board";

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto object-contain", className)}
    />
  );
}
