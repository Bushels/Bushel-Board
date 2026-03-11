import Link from "next/link";
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className={cn(
          "absolute inset-0",
          isEvening
            ? "bg-[linear-gradient(180deg,#10233a_0%,#32516b_36%,#d58a57_78%,#8c5e32_100%)]"
            : "bg-[linear-gradient(180deg,#f8f2e1_0%,#f2d79a_34%,#e3a85b_72%,#9f7a32_100%)]"
        )}
      />
      <div
        className={cn(
          "absolute -left-16 top-16 h-64 w-64 rounded-full blur-3xl",
          isEvening ? "bg-[#f7c28d]/20" : "bg-white/65"
        )}
      />
      <div
        className={cn(
          "absolute -right-20 top-10 h-72 w-72 rounded-full blur-3xl",
          isEvening ? "bg-[#1e3652]/35" : "bg-[#fff7dc]/70"
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

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,480px)] lg:px-8 lg:py-10">
        <section className="flex flex-col justify-between gap-8 text-white">
          <div className="space-y-6">
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-3 rounded-full border border-white/25 bg-white/12 px-4 py-2.5 shadow-[0_18px_40px_-28px_rgba(22,25,18,0.65)] backdrop-blur-xl transition-colors hover:bg-white/18"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-white/88 shadow-sm">
                <Logo variant="mark" size={20} />
              </span>
              <span className="text-sm font-semibold tracking-[0.08em] text-white">
                Bushel Board
              </span>
            </Link>

            <div className="max-w-2xl space-y-4">
              <div className="inline-flex rounded-full border border-white/25 bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/85 backdrop-blur-xl">
                {content.badge}
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-white/70">
                {modeLabel}
              </p>
              <h1 className="max-w-xl font-display text-4xl leading-tight text-white sm:text-5xl">
                {content.title}
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-white/82 sm:text-lg">
                {content.description}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {content.proofPoints.map((point) => (
              <div
                key={point}
                className="rounded-[1.7rem] border border-white/20 bg-white/12 px-4 py-4 text-sm text-white/84 shadow-[0_20px_35px_-30px_rgba(22,25,18,0.7)] backdrop-blur-xl"
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
