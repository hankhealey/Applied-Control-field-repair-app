import { ReportStatus } from "@/lib/types";

const STYLES: Record<ReportStatus, string> = {
  Draft: "bg-zinc-100 text-zinc-700",
  "In Progress": "bg-amber-500 text-white",
  Complete: "bg-emerald-600 text-white",
};

export default function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
