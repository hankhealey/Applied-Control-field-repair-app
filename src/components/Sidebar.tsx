"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// ── RR brand icon — 2-tone dark blue + grey ───────────────────────────────────
function RRIcon({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="rounded">
          <rect width="38" height="38" rx="9" />
        </clipPath>
      </defs>
      <rect width="38" height="38" rx="9" fill="#111827" />
      <rect x="0" y="0" width="19" height="38" fill="#0F2D52" clipPath="url(#rounded)" />
      <rect x="19" y="0" width="19" height="38" fill="#1F2937" clipPath="url(#rounded)" />
      <line x1="19" y1="6" x2="19" y2="32" stroke="#0a1520" strokeWidth="1" />
      <text x="4" y="28" fontFamily="system-ui,-apple-system,Arial,sans-serif" fontWeight="900" fontSize="22" fill="#2563EB">R</text>
      <text x="19" y="28" fontFamily="system-ui,-apple-system,Arial,sans-serif" fontWeight="900" fontSize="22" fill="#6B7280">R</text>
      <rect x="0" y="0" width="38" height="1.5" rx="9" fill="white" opacity="0.05" />
    </svg>
  );
}

// ── PDF Import icon ───────────────────────────────────────────────────────────
function ImportIcon({ active }: { active: boolean }) {
  const doc = active ? "#93C5FD" : "#374151";
  const arrow = active ? "#FCD34D" : "#4B5563";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="38" rx="9" fill={active ? "#0C2D50" : "#1A2330"} />
      {/* Document shape */}
      <rect x="9" y="5" width="16" height="20" rx="2" fill={doc} opacity="0.9" />
      <path d="M20 5l5 5h-5V5z" fill={active ? "#1E4A7A" : "#2D3A48"} />
      {/* Horizontal lines on doc */}
      <rect x="11" y="13" width="8" height="1.5" rx="0.75" fill={active ? "#1E4A7A" : "#2D3A48"} opacity="0.7" />
      <rect x="11" y="16.5" width="10" height="1.5" rx="0.75" fill={active ? "#1E4A7A" : "#2D3A48"} opacity="0.7" />
      <rect x="11" y="20" width="6" height="1.5" rx="0.75" fill={active ? "#1E4A7A" : "#2D3A48"} opacity="0.7" />
      {/* Down-arrow badge (import) */}
      <circle cx="27" cy="27" r="7" fill={active ? "#1D4ED8" : "#374151"} />
      <path d="M27 22v8M24 27l3 3 3-3" stroke={arrow} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Generic placeholder icon ──────────────────────────────────────────────────
function PlaceholderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="#253A50" />
    </svg>
  );
}

// ── App nav item ──────────────────────────────────────────────────────────────
function AppItem({
  label,
  active,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`relative flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-colors ${
        active
          ? "bg-white/10"
          : disabled
          ? "opacity-30 cursor-not-allowed"
          : "hover:bg-white/5"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-3 h-8 w-1 rounded-r-full bg-blue-300" />
      )}
      {children}
      <span className={`text-[9px] font-semibold tracking-wide ${active ? "text-blue-200" : "text-[#4B6280]"}`}>
        {label}
      </span>
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isImport = pathname.startsWith("/import");
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 640;
  });

  return (
    <>
      {/* Sidebar panel */}
      <nav
        className="relative flex shrink-0 flex-col border-r border-[#2D2D2D] bg-[#374151] transition-all duration-300"
        style={{ width: open ? 60 : 0, overflow: "hidden" }}
      >
        {/* App icons — dark blue section at top */}
        <div className="w-[60px] bg-[#0C1E30] flex flex-col gap-1 px-1 pt-4 pb-3">
          <AppItem label="RR" active={!isImport} onClick={() => router.push("/")}>
            <RRIcon size={38} />
          </AppItem>

          <AppItem label="Import" active={isImport} onClick={() => router.push("/import")}>
            <ImportIcon active={isImport} />
          </AppItem>

          <AppItem label="Orders" disabled>
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] bg-[#101D29]">
              <PlaceholderIcon />
            </div>
          </AppItem>

          <AppItem label="Assets" disabled>
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[9px] bg-[#101D29]">
              <PlaceholderIcon />
            </div>
          </AppItem>
        </div>

        {/* Gray fill area — stretches to push collapse button to bottom */}
        <div className="flex-1" />

        {/* Collapse button — bottom of gray section */}
        <div className="w-[60px] pb-3 flex justify-center">
          <button
            onClick={() => setOpen(false)}
            title="Hide app bar"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-white/5 hover:text-[#9CA3AF]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Re-open tab — visible only when sidebar is hidden */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Show app bar"
          className="flex h-14 w-5 shrink-0 items-center justify-center border-r border-[#2D2D2D] bg-[#374151] text-[#6B7280] transition-colors hover:text-[#9CA3AF]"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2L8 7L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  );
}
