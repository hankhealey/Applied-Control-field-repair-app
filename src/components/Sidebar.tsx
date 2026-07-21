"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function RRIcon({ size = 38, active = false }: { size?: number; active?: boolean }) {
  const c1 = active ? "#F59E0B" : "#44403C";
  const c2 = active ? "#FBBF24" : "#2D2926";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 38 38"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="38" height="38" rx="9" fill="#111111" />
      <text
        x="4"
        y="28"
        fontFamily="system-ui,-apple-system,Arial,sans-serif"
        fontWeight="900"
        fontSize="22"
        fill={c1}
      >
        R
      </text>
      <text
        x="19"
        y="28"
        fontFamily="system-ui,-apple-system,Arial,sans-serif"
        fontWeight="900"
        fontSize="22"
        fill={c2}
      >
        R
      </text>
    </svg>
  );
}

function ImportIcon({ active }: { active: boolean }) {
  const doc = active ? "#F59E0B" : "#44403C";
  const arrow = active ? "#FCD34D" : "#44403C";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect width="38" height="38" rx="9" fill="#111111" />
      <rect
        x="9"
        y="5"
        width="16"
        height="20"
        rx="2"
        fill={doc}
        opacity={active ? "0.85" : "0.7"}
      />
      <path d="M20 5l5 5h-5V5z" fill={active ? "#78350F" : "#1C1917"} opacity="0.9" />
      <rect
        x="11"
        y="13"
        width="8"
        height="1.5"
        rx="0.75"
        fill={active ? "#78350F" : "#1C1917"}
        opacity="0.7"
      />
      <rect
        x="11"
        y="16.5"
        width="10"
        height="1.5"
        rx="0.75"
        fill={active ? "#78350F" : "#1C1917"}
        opacity="0.7"
      />
      <rect
        x="11"
        y="20"
        width="6"
        height="1.5"
        rx="0.75"
        fill={active ? "#78350F" : "#1C1917"}
        opacity="0.7"
      />
      <circle cx="27" cy="27" r="7" fill={active ? "#92400E" : "#1C1917"} />
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
  const c = active ? "#F59E0B" : "#44403C";
  const c2 = active ? "#FBBF24" : "#44403C";
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect width="38" height="38" rx="9" fill="#111111" />
      <path
        d="M25 13 A8 8 0 0 1 19 27"
        stroke={c}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M19 27 L22 24.5 M19 27 L22 29.5"
        stroke={c}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M13 25 A8 8 0 0 1 19 11"
        stroke={c2}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M19 11 L16 8.5 M19 11 L16 13.5"
        stroke={c2}
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
      aria-current={active ? "page" : undefined}
      className="relative flex w-full flex-col items-center gap-1 rounded-xl py-2 transition-all"
      style={{
        background: active ? "rgba(245,158,11,0.10)" : "transparent",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled)
          e.currentTarget.style.background = "rgba(245,158,11,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active
          ? "rgba(245,158,11,0.10)"
          : "transparent";
      }}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-[3px] rounded-r-full" style={{ background: "#F59E0B" }} />
      )}
      {children}
      <span
        className="text-[9px] font-semibold tracking-wide"
        style={{ color: active ? "#F59E0B" : "#57534E" }}
      >
        {label}
      </span>
    </button>
  );
}

function BottomTabItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className="relative flex flex-1 flex-col items-center gap-0.5 py-2 transition-opacity"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full" style={{ background: "#F59E0B" }} />
      )}
      {children}
      <span
        className="text-[9px] font-semibold tracking-wide"
        style={{ color: active ? "#F59E0B" : "#57534E" }}
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
  const isIrisImport = pathname.startsWith("/iris-import");
  const isHome = !isImport && !isSites && !isIrisImport;

  // Start open on BOTH server and client so the first render matches — reading
  // window.innerWidth during render made the server (always open) disagree with
  // the client (open only ≥640px) and threw a hydration error. Narrow down after
  // mount instead. No visible flash: below 640px the desktop rail is CSS-hidden
  // (`hidden sm:block`), so collapsing it changes nothing the user can see.
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(window.innerWidth >= 640);
  }, []);

  const glassRail: React.CSSProperties = {
    background: "var(--sidebar-glass-bg)",
    backdropFilter: "blur(22px) saturate(1.8)",
    WebkitBackdropFilter: "blur(22px) saturate(1.8)",
    border: "0.5px solid var(--sidebar-glass-border)",
    boxShadow: "var(--sidebar-glass-shadow)",
    borderRadius: "12px",
  };

  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <nav
        className="relative hidden sm:block shrink-0 transition-all duration-300"
        style={{ width: open ? 68 : 0, overflow: "hidden" }}
        aria-label="Main navigation"
      >
        {/* Floating glass rail */}
        <div
          className="absolute flex flex-col"
          style={{
            left: "4px",
            top: "8px",
            bottom: "8px",
            width: "60px",
            ...glassRail,
          }}
        >
          <div className="flex flex-col gap-1 px-1 pt-3 pb-2">
            <AppItem
              label="Reports"
              active={isHome}
              onClick={() => router.push("/")}
            >
              <RRIcon size={38} active={isHome} />
            </AppItem>
            <AppItem
              label="Import"
              active={isImport}
              onClick={() => router.push("/import")}
            >
              <ImportIcon active={isImport} />
            </AppItem>
            <AppItem
              label="Iris"
              active={isIrisImport}
              onClick={() => router.push("/iris-import")}
            >
              <IrisSyncIcon active={isIrisImport} />
            </AppItem>
          </div>

          <div className="flex-1" />

          {/* Collapse */}
          <div className="pb-3 flex justify-center">
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Hide sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
              style={{ color: "#6B7280" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(128,128,128,0.12)")
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
        </div>
      </nav>

      {/* Re-open tab (desktop only) */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Show sidebar"
          className="hidden sm:flex h-14 w-5 shrink-0 items-center justify-center transition-colors"
          style={{ color: "#6B7280" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#9CA3AF")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B7280")}
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

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex"
        style={{
          background: "rgba(17,21,32,0.92)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Main navigation"
      >
        <BottomTabItem label="Reports" active={isHome} onClick={() => router.push("/")}>
          <RRIcon size={26} active={isHome} />
        </BottomTabItem>
        <BottomTabItem label="Import" active={isImport} onClick={() => router.push("/import")}>
          <ImportIcon active={isImport} />
        </BottomTabItem>
        <BottomTabItem label="Iris" active={isIrisImport} onClick={() => router.push("/iris-import")}>
          <IrisSyncIcon active={isIrisImport} />
        </BottomTabItem>
      </nav>
    </>
  );
}
