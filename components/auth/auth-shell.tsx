import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/layout/logo";
import { getAuthSceneContent, type AuthScene } from "@/lib/auth/auth-scene";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  scene: AuthScene;
  modeLabel: string;
  children: React.ReactNode;
}

export function AuthShell({ scene, modeLabel, children }: AuthShellProps) {
  const isEvening = scene === "evening";
  const content = getAuthSceneContent(scene);
  const shellTextClass = isEvening ? "text-white" : "text-wheat-950";
  const shellMutedTextClass = isEvening ? "text-white/82" : "text-wheat-700";
  const badgeClass = isEvening
    ? "border-white/25 bg-white/12 text-white/85"
    : "border-white/50 bg-white/36 text-wheat-700 shadow-[0_12px_24px_-18px_rgba(42,38,30,0.38)]";
  const modeLabelClass = isEvening ? "text-white/70" : "text-wheat-800/90";
  const logoLinkClass = isEvening
    ? "border-white/30 bg-white/15 hover:bg-white/22"
    : "border-white/50 bg-white/34 hover:bg-white/46";
  const logoTextClass = isEvening ? "text-white" : "text-wheat-900";
  const topCopyWrapperClass = isEvening
    ? ""
    : "rounded-[2.15rem] border border-white/32 bg-white/14 px-5 py-5 shadow-[0_26px_60px_-42px_rgba(42,38,30,0.42)] backdrop-blur-md sm:px-6";
  const proofCardClass = isEvening
    ? "border-white/20 bg-white/12 text-white/84"
    : "border-white/35 bg-white/18 text-wheat-800 shadow-[0_20px_35px_-30px_rgba(42,38,30,0.48)]";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={cn(
          "absolute inset-0",
          isEvening
            ? "bg-[linear-gradient(180deg,#10233a_0%,#32516b_36%,#d58a57_78%,#8c5e32_100%)]"
            : "bg-[linear-gradient(180deg,#efe3c0_0%,#e7cf94_32%,#d89e59_70%,#8f6a2d_100%)]"
        )}
      />
      {!isEvening && (
        <div className="absolute inset-x-0 top-0 h-[48vh] bg-[radial-gradient(circle_at_12%_10%,rgba(255,255,255,0.38),rgba(255,255,255,0.14)_30%,rgba(255,255,255,0)_62%)]" />
      )}
      <div
        className={cn(
          "absolute -left-16 top-16 h-64 w-64 rounded-full blur-3xl",
          isEvening ? "bg-[#f7c28d]/20" : "bg-[#fff4cf]/82"
        )}
      />
      <div
        className={cn(
          "absolute -right-20 top-10 h-72 w-72 rounded-full blur-3xl",
          isEvening ? "bg-[#1e3652]/35" : "bg-[#f6e6b1]/68"
        )}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-[42vh]",
          isEvening
            ? "bg-[linear-gradient(180deg,rgba(16,35,58,0)_0%,rgba(55,47,30,0.35)_12%,#43341f_100%)]"
            : "bg-[linear-gradient(180deg,rgba(227,168,91,0)_0%,rgba(129,114,58,0.42)_16%,#746230_100%)]"
        )}
      />
      <div
        className={cn(
          "absolute bottom-0 left-[-10%] h-56 w-[70%] rounded-t-[100%] blur-2xl",
          isEvening ? "bg-[#51653a]/35" : "bg-[#6f7f3b]/30"
        )}
      />
      <div
        className={cn(
          "absolute bottom-[-3rem] right-[-8%] h-64 w-[68%] rounded-t-[100%] blur-2xl",
          isEvening ? "bg-[#2f3f24]/60" : "bg-[#55622d]/55"
        )}
      />

      {/* Scattered wheat stalks across the bottom */}
      {[
        { left: "3%", bottom: "2%", rotate: -8, scale: 1.1, opacity: 0.25 },
        { left: "10%", bottom: "0%", rotate: 4, scale: 1.3, opacity: 0.3 },
        { left: "18%", bottom: "1%", rotate: -3, scale: 1.0, opacity: 0.2 },
        { left: "26%", bottom: "3%", rotate: 7, scale: 1.15, opacity: 0.22 },
        { left: "35%", bottom: "0%", rotate: -5, scale: 1.25, opacity: 0.28 },
        { left: "44%", bottom: "2%", rotate: 2, scale: 1.0, opacity: 0.18 },
        { left: "52%", bottom: "1%", rotate: -6, scale: 1.2, opacity: 0.25 },
        { left: "60%", bottom: "0%", rotate: 5, scale: 1.35, opacity: 0.3 },
        { left: "68%", bottom: "3%", rotate: -2, scale: 1.05, opacity: 0.2 },
        { left: "76%", bottom: "1%", rotate: 8, scale: 1.2, opacity: 0.26 },
        { left: "84%", bottom: "0%", rotate: -4, scale: 1.15, opacity: 0.22 },
        { left: "92%", bottom: "2%", rotate: 3, scale: 1.3, opacity: 0.28 },
      ].map((stalk, i) => (
        <Image
          key={i}
          src="/wheat-mark.svg"
          alt=""
          width={32}
          height={32}
          className="pointer-events-none absolute select-none"
          style={{
            left: stalk.left,
            bottom: stalk.bottom,
            transform: `rotate(${stalk.rotate}deg) scale(${stalk.scale})`,
            opacity: isEvening ? stalk.opacity * 0.7 : stalk.opacity,
            filter: isEvening ? "brightness(0.7) sepia(0.3)" : "none",
          }}
        />
      ))}

      {/* Top-left logo — always visible regardless of layout/viewport */}
      <div className="absolute left-4 top-4 z-10 sm:left-6 sm:top-5">
        <Link
          href="/"
          className={cn(
            "inline-flex items-center gap-2.5 rounded-[1.4rem] border px-3 py-2 shadow-[0_14px_32px_-24px_rgba(22,25,18,0.55)] backdrop-blur-xl transition-colors",
            logoLinkClass
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-white/90 shadow-sm">
            <Logo variant="mark" size={18} />
          </span>
          <span className={cn("text-sm font-semibold tracking-wide", logoTextClass)}>
            Bushel Board
          </span>
        </Link>
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,480px)] lg:px-8 lg:py-10">
        <section className={cn("flex flex-col justify-between gap-8", shellTextClass)}>
          <div className="space-y-6">
            <div className={cn("max-w-2xl space-y-4 pt-20 sm:pt-16 lg:pt-0", topCopyWrapperClass)}>
              <div className={cn(
                "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] backdrop-blur-xl",
                badgeClass
              )}>
                {content.badge}
              </div>
              <p className={cn("text-sm font-medium uppercase tracking-[0.3em]", modeLabelClass)}>
                {modeLabel}
              </p>
              <h1 className="max-w-xl font-display no-ligatures text-4xl leading-tight sm:text-5xl">
                {content.title}
              </h1>
              <p className={cn("max-w-xl text-base leading-relaxed sm:text-lg", shellMutedTextClass)}>
                {content.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {content.proofPoints.map((point) => (
              <div
                key={point}
                className={cn(
                  "rounded-[1.7rem] border px-4 py-4 text-sm backdrop-blur-xl",
                  proofCardClass
                )}
              >
                {point}
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-center lg:justify-end">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
