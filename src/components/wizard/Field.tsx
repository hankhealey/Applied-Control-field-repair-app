export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function SectionHeader({
  title,
  subtitle,
  tone = "default",
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "amber" | "emerald";
}) {
  const toneClasses = {
    default: "border-[var(--border-solid)] bg-[var(--bg-surface)]",
    amber: "border-amber-300 bg-[var(--color-warning-bg)]",
    emerald: "border-emerald-300 bg-[var(--color-success-bg)]",
  }[tone];
  return (
    <div className={`rounded-t-xl border px-5 py-3 ${toneClasses}`}>
      <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
      {subtitle && <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>}
    </div>
  );
}
