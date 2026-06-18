"use client";

import { VoiceAgentReturn } from "@/hooks/useVoiceAgent";

const STEP_LABEL: Record<number, string> = {
  0: "Job Info",
  1: "As Found",
  2: "As Left",
};

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="8" y="2" width="6" height="11" rx="3" fill="white" />
      <path d="M4 11a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="11" y1="18" x2="11" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <line x1="7"  y1="21" x2="15" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2" fill="white" />
    </svg>
  );
}

export default function VoiceAgentOverlay({
  voice,
  step,
}: {
  voice: VoiceAgentReturn;
  step: number;
}) {
  const {
    state, currentField, transcript, waitingForYesNo,
    supported, fieldIndex, totalFields,
    start, stop, pressConfirm, pressRetry,
  } = voice;

  const isActive = state !== "idle";

  // Not supported — show disabled button with tooltip
  if (!supported) {
    return (
      <div className="fixed bottom-6 right-6 z-50 group">
        <button
          disabled
          className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-300 shadow-lg cursor-not-allowed"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="8" y="2" width="6" height="11" rx="3" fill="#9CA3AF" />
            <path d="M4 11a7 7 0 0014 0" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
            <line x1="11" y1="18" x2="11" y2="21" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
            <line x1="7"  y1="21" x2="15" y2="21" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
            <line x1="3"  y1="3"  x2="19" y2="19" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <span className="pointer-events-none absolute right-16 top-3 hidden whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-white group-hover:block">
          Voice mode requires Chrome or Safari
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Active panel */}
      {isActive && (
        <div className="fixed bottom-24 right-4 z-50 w-72 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-[#0C1E30] px-4 py-3">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 22 22" fill="none">
                <rect x="8" y="2" width="6" height="11" rx="3" fill="white" />
                <path d="M4 11a7 7 0 0014 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-sm font-semibold text-white">Voice Mode</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-blue-200">
                {STEP_LABEL[step]}
              </span>
            </div>
            <button onClick={stop} className="text-white/50 hover:text-white transition-colors">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-4 pt-3">
            <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
              <span>Field {fieldIndex + 1} of {totalFields}</span>
              <span className={
                state === "listening" ? "text-red-500" :
                state === "asking"    ? "text-blue-500" :
                state === "confirming"? "text-amber-500" : ""
              }>
                {state === "asking"    ? "Speaking…" :
                 state === "listening" ? (waitingForYesNo ? "Awaiting yes / no…" : "Listening…") :
                 state === "confirming"? "Confirm?" : ""}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(fieldIndex / totalFields) * 100}%` }}
              />
            </div>
          </div>

          {/* Current field */}
          {currentField && (
            <div className="px-4 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Current Field
              </p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-zinc-800">
                {currentField.label}
              </p>
              {currentField.type === "select" && currentField.options && (
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  Say: {currentField.options.join(" or ")}
                </p>
              )}
              {currentField.type === "date" && (
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  E.g. &ldquo;June 15 2025&rdquo; or &ldquo;6/15/2025&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Heard transcript */}
          {transcript && (
            <div className="mx-4 mt-3 rounded-xl bg-zinc-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                {waitingForYesNo ? "Confirm this?" : "I heard"}
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-800">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}

          {/* Animated listening dots */}
          {state === "listening" && (
            <div className="flex items-center justify-center gap-1.5 py-4">
              <span className="h-2 w-2 animate-bounce rounded-full bg-red-400" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-red-400" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-red-400" style={{ animationDelay: "300ms" }} />
              <span className="ml-1 text-xs text-zinc-400">listening</span>
            </div>
          )}

          {/* Manual confirm / retry buttons (fallback for when voice isn't picked up) */}
          {transcript && (
            <div className="flex gap-2 px-4 pb-3 pt-1">
              <button
                onClick={pressRetry}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 active:bg-zinc-100"
              >
                Try Again
              </button>
              <button
                onClick={pressConfirm}
                className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-white hover:bg-emerald-600 active:bg-emerald-700"
              >
                Confirm
              </button>
            </div>
          )}

          {/* Hint bar */}
          <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 text-center">
            <p className="text-[10px] text-zinc-400">
              Say <strong>skip</strong> to skip &nbsp;·&nbsp; <strong>stop</strong> to exit
            </p>
          </div>
        </div>
      )}

      {/* Floating mic / stop button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={isActive ? stop : start}
          title={isActive ? "Stop voice mode" : "Start voice mode (hands-free form filling)"}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            state === "listening"
              ? "animate-pulse bg-red-500 ring-4 ring-red-200 hover:bg-red-600"
              : state === "confirming"
              ? "bg-amber-500 hover:bg-amber-600"
              : isActive
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-[#154A8A] hover:bg-[#0F3A6E]"
          }`}
        >
          {isActive ? <StopIcon /> : <MicIcon />}
        </button>

        {/* Label shown when idle */}
        {!isActive && (
          <span className="pointer-events-none absolute -left-16 bottom-4 hidden whitespace-nowrap rounded-lg bg-zinc-800 px-2 py-1 text-[10px] font-medium text-white group-hover:block">
            Voice
          </span>
        )}
      </div>
    </>
  );
}
