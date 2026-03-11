import Image from "next/image";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/logo.svg"
      alt="Bushel Board"
      width={size}
      height={size}
      priority
      className="h-auto w-auto"
    />
  );
}
