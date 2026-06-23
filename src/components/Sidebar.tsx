"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

function RRIcon({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 38 38"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="rounded">
          <rect width="38" height="38" rx="9" />
        </clipPath>
      </defs>
      <rect width="38" height="38" rx="9" fill="#111827" />
      <rect
        x="0"
        y="0"
        width="19"
        height="38"
        fill="#0F2D52"
        clipPath="url(#rounded)"
      />
      <rect
        x="19"
        y="0"
        width="19"
        height="38"
        fill="#1F2937"
        clipPath="url(#rounded)"
      />
      <line x1="19" y1="6" x2="19" y2="32" stroke="#0a1520" strokeWidth="1" />
      <text
        x="4"
        y="28"
        fontFamily="system-ui,-apple-system,Arial,sans-serif"
        fontWeight="900"
        fontSize="22"
        fill="#2563EB"
      >
        R
      </text>
      <text
        x="19"
        y="28"
        fontFamily="system-ui,-apple-system,Arial,sans-serif"
        fontWeight="900"
        fontSize="22"
        fill="#6B7280"
      >
        R
      </text>
      <rect
        x="0"
        y="0"
        width="38"
        height="1.5"
        rx="9"
        fill="white"
        opacity="0.05"
      />
    </svg>
  );
}

function ImportIcon({ active }: { active: boolean }) {
  const doc = active ? "#93C5FD" : "#374151";
  const arrow = active ? "#FCD34D" : "#4B5563";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect
        width="38"
        height="38"
        rx="9"
        fill={active ? "#0C2D50" : "#1A2330"}
      />
      <rect
        x="9"
        y="5"
        width="16"
        height="20"
        rx="2"
        fill={doc}
        opacity="0.9"
      />
      <path d="M20 5l5 5h-5V5z" fill={active ? "#1E4A7A" : "#2D3A48"} />
      <rect
        x="11"
        y="13"
        width="8"
        height="1.5"
        rx="0.75"
        fill={active ? "#1E4A7A" : "#2D3A48"}
        opacity="0.7"
      />
      <rect
        x="11"
        y="16.5"
        width="10"
        height="1.5"
        rx="0.75"
        fill={active ? "#1E4A7A" : "#2D3A48"}
        opacity="0.7"
      />
      <rect
        x="11"
        y="20"
        width="6"
        height="1.5"
        rx="0.75"
        fill={active ? "#1E4A7A" : "#2D3A48"}
        opacity="0.7"
      />
      <circle cx="27" cy="27" r="7" fill={active ? "#1D4ED8" : "#374151"} />
      <path
        d="M27 22v8M24 27l3 3 3-3"
        stroke={arrow}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SitesIcon({ active }: { active: boolean }) {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect
        width="38"
        height="38"
        rx="9"
        fill={active ? "#0C2D50" : "#1A2330"}
      />
      <path
        d="M19 8l9 5v10l-9 5-9-5V13l9-5z"
        stroke={active ? "#93C5FD" : "#4B5563"}
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M19 8v18M10 13l9 5 9-5"
        stroke={active ? "#93C5FD" : "#4B5563"}
        strokeWidth="1.2"
        opacity="0.6"
      />
    </svg>
  );
}

function IrisSyncIcon({ active }: { active: boolean }) {
  const c = active ? "#93C5FD" : "#4B5563";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect
        width="38"
        height="38"
        rx="9"
        fill={active ? "#0C2D50" : "#1A2330"}
      />
      {/* Arc 1: upper-right → bottom (clockwise 135°) */}
      <path
        d="M25 13 A8 8 0 0 1 19 27"
        stroke={c}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arrowhead at bottom, pointing left */}
      <path
        d="M19 27 L22 24.5 M19 27 L22 29.5"
        stroke={c}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Arc 2: lower-left → top (clockwise 135°) */}
      <path
        d="M13 25 A8 8 0 0 1 19 11"
        stroke={c}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Arrowhead at top, pointing right */}
      <path
        d="M19 11 L16 8.5 M19 11 L16 13.5"
        stroke={c}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function PlaceholderIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect width="38" height="38" rx="9" fill="#141C28" />
      <rect x="10" y="10" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="21" y="10" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="10" y="21" width="7" height="7" rx="1.5" fill="#253A50" />
      <rect x="21" y="21" width="7" height="7" rx="1.5" fill="#1E2D3D" />
    </svg>
  );
}

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
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="relative flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-all"
      style={{
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled)
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active
          ? "rgba(255,255,255,0.08)"
          : "transparent";
      }}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full bg-blue-400" />
      )}
      {children}
      <span
        className="text-[9px] font-semibold tracking-wide"
        style={{ color: active ? "#93C5FD" : "#4B6280" }}
      >
        {label}
      </span>
    </button>
  );
}

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isImport = pathname.startsWith("/import");
  const isSites = pathname.startsWith("/sites");
  const isIrisSync = pathname.startsWith("/iris-sync");
  const isHome = !isImport && !isSites && !isIrisSync;

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 640;
  });

  const sidebarStyle = {
    background: "var(--bg-sidebar)",
    borderRight: "1px solid rgba(255,255,255,0.04)",
  };

  return (
    <>
      <nav
        className="relative flex shrink-0 flex-col transition-all duration-300"
        style={{ ...sidebarStyle, width: open ? 60 : 0, overflow: "hidden" }}
      >
        {/* Icon rail */}
        <div className="w-[60px] flex flex-col gap-1 px-1 pt-4 pb-3">
          <AppItem
            label="Reports"
            active={isHome}
            onClick={() => router.push("/")}
          >
            <RRIcon size={38} />
          </AppItem>
          <AppItem
            label="Import"
            active={isImport}
            onClick={() => router.push("/import")}
          >
            <ImportIcon active={isImport} />
          </AppItem>
          <AppItem
            label="Sites"
            active={isSites}
            onClick={() => router.push("/sites")}
          >
            <SitesIcon active={isSites} />
          </AppItem>
          <AppItem
            label="Iris Sync"
            active={isIrisSync}
            onClick={() => router.push("/iris-sync")}
          >
            <IrisSyncIcon active={isIrisSync} />
          </AppItem>
          <AppItem label="Orders" disabled>
            <PlaceholderIcon />
          </AppItem>
          <AppItem label="Assets" disabled>
            <PlaceholderIcon />
          </AppItem>
        </div>

        <div className="flex-1" />

        {/* Collapse */}
        <div className="w-[60px] pb-3 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Hide sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{ color: "#4B6280" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.05)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M9 2L4 7l5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/* Re-open tab */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Show sidebar"
          className="flex h-14 w-5 shrink-0 items-center justify-center transition-colors"
          style={{ ...sidebarStyle, color: "#4B6280" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#9CA3AF")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#4B6280")}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
            <path
              d="M2 2l6 5-6 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  );
}
