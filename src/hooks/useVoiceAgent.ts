"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RepairReport } from "@/lib/types";

export type VoiceState = "idle" | "asking" | "listening" | "confirming" | "done";

export interface VoiceField {
  key: keyof RepairReport;
  label: string;
  type: "text" | "select" | "date";
  options?: string[];
}

const STEP_NAMES: Record<number, string> = {
  0: "Job Information",
  1: "As Found",
  2: "As Left",
};

export const STEP_FIELDS: Record<number, VoiceField[]> = {
  0: [
    { key: "tagOrUnit",       label: "tag or unit number",   type: "text" },
    { key: "customer",        label: "customer name",         type: "text" },
    { key: "technician",      label: "technician name",       type: "text" },
    { key: "repairDate",      label: "repair date",           type: "date" },
    { key: "process",         label: "process",               type: "text" },
    { key: "emrReference",    label: "E M R reference",       type: "text" },
    { key: "crmodReference",  label: "C R M O D reference",   type: "text" },
    { key: "scopeOfWork",     label: "scope of work",         type: "text" },
  ],
  1: [
    { key: "valveMake",                label: "valve make",                  type: "text" },
    { key: "valveSerialNumber",         label: "valve serial number",         type: "text" },
    { key: "valveModelSize",           label: "valve model and size",        type: "text" },
    { key: "valveClassConnection",     label: "valve class and connection",  type: "text" },
    { key: "valvePackingConfiguration",label: "packing configuration",       type: "text" },
    { key: "valveTrimCharPort",        label: "trim character and port",     type: "text" },
    { key: "valveFlowDirection",       label: "flow direction",              type: "text" },
    { key: "bodyBonnetBolting",        label: "body bonnet bolting",         type: "text" },
    { key: "actuatorMake",             label: "actuator make",               type: "text" },
    { key: "actuatorSerialNumber",     label: "actuator serial number",      type: "text" },
    { key: "actuatorModelSize",        label: "actuator model and size",     type: "text" },
    { key: "actuatorActionHandwheel",  label: "action and handwheel",        type: "text" },
    { key: "actuatorMounting",         label: "actuator mounting",           type: "text" },
    { key: "positionerMake",           label: "positioner make",             type: "text" },
    { key: "positionerSerialNumber",   label: "positioner serial number",    type: "text" },
    { key: "positionerModelAction",    label: "positioner model and action", type: "text" },
    { key: "ratedTravel",              label: "rated travel",                type: "text" },
    { key: "benchSetAsFound",          label: "bench set as found",          type: "text" },
    { key: "openSignalAsFound",        label: "open signal as found",        type: "text" },
    { key: "closedSignalAsFound",      label: "closed signal as found",      type: "text" },
    { key: "supplyPressureAsFound",    label: "supply pressure as found",    type: "text" },
    { key: "failActionAsFound",        label: "fail action",                 type: "select", options: ["Open", "Close"] },
  ],
  2: [
    { key: "benchSetAsLeft",        label: "bench set as left",      type: "text" },
    { key: "openSignalAsLeft",      label: "open signal as left",    type: "text" },
    { key: "closedSignalAsLeft",    label: "closed signal as left",  type: "text" },
    { key: "supplyPressureAsLeft",  label: "supply pressure as left",type: "text" },
    { key: "failActionAsLeft",      label: "fail action as left",    type: "select", options: ["Open", "Close"] },
    { key: "testWitness",           label: "test witness",           type: "text" },
    { key: "testTechnician",        label: "test technician",        type: "text" },
    { key: "gasTestPressure",       label: "gas test pressure",      type: "text" },
    { key: "gasTestResult",         label: "gas test result",        type: "text" },
    { key: "seatLeakClass",         label: "seat leak class",        type: "text" },
    { key: "allowableLeakage",      label: "allowable leakage",      type: "text" },
    { key: "actualLeakage",         label: "actual leakage",         type: "text" },
    { key: "notes",                 label: "notes",                  type: "text" },
    { key: "recommendations",       label: "recommendations",        type: "text" },
  ],
};

// ── TTS ───────────────────────────────────────────────────────────────────────

function speakAsync(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) { resolve(); return; }
    const synth = window.speechSynthesis;
    synth.cancel();

    function doSpeak() {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;

      // Fallback: resolve after estimated duration so the loop never hangs
      const fallback = setTimeout(() => { synth.cancel(); resolve(); }, text.length * 80 + 2500);
      utt.onend = () => { clearTimeout(fallback); resolve(); };
      utt.onerror = () => { clearTimeout(fallback); resolve(); };
      synth.speak(utt);
      // Chrome bug: synthesis can pause when tab loses focus briefly
      setTimeout(() => { if (synth.paused) synth.resume(); }, 150);
    }

    // Voices may not be loaded yet on first page load
    if (synth.getVoices().length > 0) {
      doSpeak();
    } else {
      let done = false;
      const go = () => { if (!done) { done = true; doSpeak(); } };
      synth.addEventListener("voiceschanged", go, { once: true });
      setTimeout(go, 600); // fallback if voiceschanged never fires
    }
  });
}

// ── STT ───────────────────────────────────────────────────────────────────────

function listenAsync(
  abortSignal: AbortSignal,
  pendingRef: React.MutableRefObject<((v: string) => void) | null>
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (abortSignal.aborted) { reject(new Error("aborted")); return; }

    let settled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentRec: any = null;

    function settle(value: string) {
      if (settled) return;
      settled = true;
      pendingRef.current = null;
      try { currentRec?.abort(); } catch {}
      resolve(value);
    }

    pendingRef.current = settle;

    function startRec() {
      if (settled || abortSignal.aborted) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = new SR();
      currentRec = rec;
      rec.lang = "en-US";
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => settle(e.results[0][0].transcript);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        if (settled || abortSignal.aborted) return;
        if (e.error === "not-allowed") {
          // Mic permission denied — surface to the caller
          settled = true;
          pendingRef.current = null;
          reject(new Error("not-allowed"));
          return;
        }
        if (["no-speech", "audio-capture", "network"].includes(e.error)) {
          setTimeout(startRec, 300);
        }
      };
      rec.onend = () => {
        if (!settled && !abortSignal.aborted) setTimeout(startRec, 100);
      };

      try { rec.start(); } catch {}
    }

    startRec();

    abortSignal.addEventListener("abort", () => {
      settled = true;
      pendingRef.current = null;
      try { currentRec?.abort(); } catch {}
      reject(new Error("aborted"));
    });
  });
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function detectYesNo(t: string): "yes" | "no" | null {
  const s = t.toLowerCase();
  if (/\b(yes|yeah|yep|yup|correct|right|confirm|affirmative)\b/.test(s)) return "yes";
  if (/\b(no|nope|wrong|incorrect|redo|again|retry)\b/.test(s)) return "no";
  return null;
}

function detectCommand(t: string): "skip" | "stop" | "repeat" | null {
  const s = t.toLowerCase();
  if (/\b(skip|pass|next field)\b/.test(s)) return "skip";
  if (/\b(stop|exit|quit|cancel)\b/.test(s)) return "stop";
  if (/\b(repeat|say again)\b/.test(s)) return "repeat";
  return null;
}

function parseSelectValue(t: string, options: string[]): string {
  const s = t.toLowerCase();
  for (const opt of options) {
    if (s.includes(opt.toLowerCase())) return opt;
  }
  if (options.includes("Open") && /\bopen(s)?\b/.test(s)) return "Open";
  if (options.includes("Close") && /\bclos(e|ed|es)?\b/.test(s)) return "Close";
  if (options.includes("Yes") && /\b(yes|yeah|yep|yup)\b/.test(s)) return "Yes";
  if (options.includes("No") && /\b(no|nope)\b/.test(s)) return "No";
  return t;
}

function normalizeDate(t: string): string {
  const months: Record<string, string> = {
    january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
    july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
    jan:"01",feb:"02",mar:"03",apr:"04",jun:"06",jul:"07",aug:"08",
    sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const s = t.toLowerCase();
  const m = s.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
  if (m && months[m[1]]) return `${m[3]}-${months[m[1]]}-${m[2].padStart(2, "0")}`;
  const m2 = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return t;
}

// ── Main async loop ───────────────────────────────────────────────────────────

interface UIUpdate {
  state: VoiceState;
  fieldIndex: number;
  transcript: string;
  waitingForYesNo: boolean;
}

async function voiceLoop(
  step: number,
  fields: VoiceField[],
  onUpdate: (patch: Partial<RepairReport>) => void,
  setUI: (u: UIUpdate) => void,
  abort: AbortSignal,
  pendingRef: React.MutableRefObject<((v: string) => void) | null>
) {
  if (!fields.length) return;

  await speakAsync(
    `Voice mode started. I'll guide you through ${STEP_NAMES[step] ?? "this step"}. Say skip to skip a field, or stop to exit.`
  );
  if (abort.aborted) return;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    let retrying = false;

    fieldLoop: while (!abort.aborted) {
      // Ask
      setUI({ state: "asking", fieldIndex: i, transcript: "", waitingForYesNo: false });
      let question = retrying
        ? `Let's try again. What is the ${field.label}?`
        : `What is the ${field.label}?`;
      if (field.type === "select" && field.options) question += ` Say ${field.options.join(" or ")}.`;
      await speakAsync(question);
      if (abort.aborted) return;

      // Listen for answer
      setUI({ state: "listening", fieldIndex: i, transcript: "", waitingForYesNo: false });
      let heard: string;
      try { heard = await listenAsync(abort, pendingRef); }
      catch (err: unknown) {
        if ((err as Error).message === "not-allowed") {
          alert("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
        }
        setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false });
        return;
      }

      const cmd = detectCommand(heard);
      if (cmd === "stop") { setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false }); return; }
      if (cmd === "skip") break fieldLoop;
      if (cmd === "repeat") { retrying = false; continue; }

      let value = heard.trim();
      if (field.type === "select" && field.options) value = parseSelectValue(heard, field.options);
      if (field.type === "date") value = normalizeDate(heard);

      // Confirm
      setUI({ state: "confirming", fieldIndex: i, transcript: value, waitingForYesNo: false });
      await speakAsync(`I heard: ${value}. Say yes to confirm, or no to try again.`);
      if (abort.aborted) return;

      setUI({ state: "listening", fieldIndex: i, transcript: value, waitingForYesNo: true });
      let conf: string;
      try { conf = await listenAsync(abort, pendingRef); }
      catch (err: unknown) {
        if ((err as Error).message === "not-allowed") {
          alert("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
        }
        setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false });
        return;
      }

      if (detectCommand(conf) === "stop") { setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false }); return; }

      if (detectYesNo(conf) === "yes") {
        onUpdate({ [field.key]: value } as Partial<RepairReport>);
        break fieldLoop;
      } else {
        retrying = true;
      }
    }
  }

  if (!abort.aborted) {
    setUI({ state: "done", fieldIndex: fields.length - 1, transcript: "", waitingForYesNo: false });
    await speakAsync(`All ${STEP_NAMES[step] ?? ""} fields complete. Voice mode finished.`);
    setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false });
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface VoiceAgentReturn {
  state: VoiceState;
  fieldIndex: number;
  transcript: string;
  waitingForYesNo: boolean;
  currentField: VoiceField | null;
  totalFields: number;
  supported: boolean;
  start: () => void;
  stop: () => void;
  pressConfirm: () => void;
  pressRetry: () => void;
}

export function useVoiceAgent(
  step: number,
  onUpdate: (patch: Partial<RepairReport>) => void
): VoiceAgentReturn {
  const [ui, setUI] = useState<UIUpdate>({
    state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<((v: string) => void) | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const supported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const fields = STEP_FIELDS[step] ?? [];

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setUI({ state: "idle", fieldIndex: 0, transcript: "", waitingForYesNo: false });
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setUI({ state: "asking", fieldIndex: 0, transcript: "", waitingForYesNo: false });
    voiceLoop(
      step,
      STEP_FIELDS[step] ?? [],
      (patch) => onUpdateRef.current(patch),
      setUI,
      ctrl.signal,
      pendingRef
    ).catch(() => {});
  }, [supported, step]);

  const pressConfirm = useCallback(() => { pendingRef.current?.("yes"); }, []);
  const pressRetry   = useCallback(() => { pendingRef.current?.("no"); }, []);

  // Stop voice when user changes wizard step
  useEffect(() => { stop(); }, [step, stop]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    ...ui,
    currentField: ui.state !== "idle" ? (fields[ui.fieldIndex] ?? null) : null,
    totalFields: fields.length,
    supported,
    start,
    stop,
    pressConfirm,
    pressRetry,
  };
}
