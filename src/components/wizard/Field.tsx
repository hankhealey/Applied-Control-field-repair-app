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
      <span className="mb-1 block text-sm font-medium text-zinc-600">
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
    default: "border-zinc-200 bg-zinc-50",
    amber: "border-amber-300 bg-amber-50",
    emerald: "border-emerald-300 bg-emerald-50",
  }[tone];
  return (
    <div className={`rounded-t-xl border px-5 py-3 ${toneClasses}`}>
      <h3 className="font-semibold text-zinc-900">{title}</h3>
      {subtitle && <p className="text-sm text-zinc-600">{subtitle}</p>}
    </div>
  );
}
