interface ThesisBannerProps {
  title: string;
  body: string;
}

export function ThesisBanner({ title, body }: ThesisBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-canola/20 bg-gradient-to-r from-canola/5 to-transparent p-5 pl-7">
      {/* Gold left accent bar */}
      <div className="absolute left-0 top-0 h-full w-1 bg-canola" />

      <p className="text-[0.65rem] font-semibold uppercase tracking-[3px] text-canola mb-1.5">
        Active Thesis
      </p>
      <h3 className="font-display text-lg font-semibold text-foreground mb-1">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
