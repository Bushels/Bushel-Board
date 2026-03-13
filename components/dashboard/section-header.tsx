interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function SectionHeader({ title, subtitle, children }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="border-l-[3px] border-canola pl-3">
        <h2 className="text-lg font-display font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
