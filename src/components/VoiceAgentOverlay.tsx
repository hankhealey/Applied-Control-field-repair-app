"use client";

import { VoiceAgentReturn } from "@/hooks/useVoiceAgent";

const STEP_LABEL: Record<number, string> = { 0: "Job Info", 1: "As Found", 2: "As Left" };

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

export default function VoiceAgentOverlay({ voice, step }: { voice: VoiceAgentReturn; step: number }) {
  const { state, currentField, pendingValue, fieldIndex, totalFields, start, stop, stopRecording, pressConfirm, pressRetry } = voice;
  const isActive = state !== "idle";

  return (
    <>
      {/* Active panel */}
      {isActive && (
        <div className="fixed bottom-20 left-2 right-2 z-50 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:bottom-24 sm:left-auto sm:right-4 sm:w-72">

          {/* Header */}
          <div className="flex items-center justify-between bg-[#0C1E30] px-4 py-3">
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 22 22" fill="none">
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

          {/* Progress */}
          <div className="px-4 pt-3">
            <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
              <span>Field {fieldIndex + 1} of {totalFields}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(fieldIndex / totalFields) * 100}%` }}
              />
            </div>
          </div>

          {/* Field name */}
          {currentField && (
            <div className="px-4 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Current Field</p>
              <p className="mt-0.5 text-sm font-semibold capitalize text-zinc-800">{currentField.label}</p>
              {currentField.type === "select" && currentField.options && (
                <p className="mt-0.5 text-[10px] text-zinc-400">Say: {currentField.options.join(" or ")}</p>
              )}
              {currentField.type === "date" && (
                <p className="mt-0.5 text-[10px] text-zinc-400">E.g. &ldquo;June 15, 2025&rdquo;</p>
              )}
            </div>
          )}

          {/* State-specific body */}
          {state === "asking" && (
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-blue-600 animate-pulse">Speaking…</p>
            </div>
          )}

          {state === "recording" && (
            <div className="px-4 py-4 flex flex-col items-center gap-3">
              {/* Pulsing ring */}
              <div className="relative flex items-center justify-center">
                <div className="absolute h-14 w-14 animate-ping rounded-full bg-red-400 opacity-30" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-red-500">
                  <div className="h-3 w-3 rounded-sm bg-white" />
                </div>
              </div>
              <p className="text-xs font-medium text-red-600">Recording — speak now</p>
              <button
                onClick={stopRecording}
                className="w-full rounded-lg border border-zinc-200 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Done Speaking
              </button>
            </div>
          )}

          {state === "transcribing" && (
            <div className="px-4 py-6 flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <div
                    key={d}
                    className="h-2 w-2 animate-bounce rounded-full bg-blue-400"
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
              <p className="text-xs text-zinc-400">Transcribing with Groq AI…</p>
            </div>
          )}

          {state === "confirming" && pendingValue && (
            <div className="px-4 pt-3 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">I heard</p>
              <p className="mt-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800">
                &ldquo;{pendingValue}&rdquo;
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={pressRetry}
                  className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 active:bg-zinc-100"
                >
                  Try Again
                </button>
                <button
                  onClick={pressConfirm}
                  className="flex-1 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-white hover:bg-emerald-600 active:bg-emerald-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-2 text-center">
            <p className="text-[10px] text-zinc-400">
              Say <strong>skip</strong> to skip &nbsp;·&nbsp; <strong>stop</strong> to exit
            </p>
          </div>
        </div>
      )}

      {/* Floating mic button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={isActive ? stop : start}
          title={isActive ? "Stop voice mode" : "Start hands-free voice mode"}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
            state === "recording"
              ? "animate-pulse bg-red-500 ring-4 ring-red-200 hover:bg-red-600"
              : state === "transcribing"
              ? "bg-blue-400"
              : state === "confirming"
              ? "bg-amber-500 hover:bg-amber-600"
              : isActive
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-[#154A8A] hover:bg-[#0F3A6E]"
          }`}
        >
          {isActive ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="4" width="12" height="12" rx="2" fill="white" />
            </svg>
          ) : (
            <MicIcon />
          )}
        </button>
      </div>
    </>
  );
}
