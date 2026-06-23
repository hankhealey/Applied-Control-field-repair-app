"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepairReport } from "@/lib/types";

export type VoiceState =
  | "idle"
  | "asking"
  | "recording"
  | "transcribing"
  | "confirming"
  | "done";

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
    { key: "tagOrUnit", label: "tag or unit number", type: "text" },
    { key: "customer", label: "customer name", type: "text" },
    { key: "technician", label: "technician name", type: "text" },
    { key: "repairDate", label: "repair date", type: "date" },
    { key: "process", label: "process", type: "text" },
    { key: "emrReference", label: "E M R reference", type: "text" },
    { key: "crmodReference", label: "C R M O D reference", type: "text" },
    { key: "scopeOfWork", label: "scope of work", type: "text" },
  ],
  1: [
    { key: "valveMake", label: "valve make", type: "text" },
    { key: "valveSerialNumber", label: "valve serial number", type: "text" },
    { key: "valveModelSize", label: "valve model and size", type: "text" },
    {
      key: "valveClassConnection",
      label: "valve class and connection",
      type: "text",
    },
    {
      key: "valvePackingConfiguration",
      label: "packing configuration",
      type: "text",
    },
    {
      key: "valveTrimCharPort",
      label: "trim character and port",
      type: "text",
    },
    { key: "valveFlowDirection", label: "flow direction", type: "text" },
    { key: "bodyBonnetBolting", label: "body bonnet bolting", type: "text" },
    { key: "actuatorMake", label: "actuator make", type: "text" },
    {
      key: "actuatorSerialNumber",
      label: "actuator serial number",
      type: "text",
    },
    {
      key: "actuatorModelSize",
      label: "actuator model and size",
      type: "text",
    },
    {
      key: "actuatorActionHandwheel",
      label: "action and handwheel",
      type: "text",
    },
    { key: "actuatorMounting", label: "actuator mounting", type: "text" },
    { key: "positionerMake", label: "positioner make", type: "text" },
    {
      key: "positionerSerialNumber",
      label: "positioner serial number",
      type: "text",
    },
    {
      key: "positionerModelAction",
      label: "positioner model and action",
      type: "text",
    },
    { key: "ratedTravel", label: "rated travel", type: "text" },
    { key: "benchSetAsFound", label: "bench set as found", type: "text" },
    { key: "openSignalAsFound", label: "open signal as found", type: "text" },
    {
      key: "closedSignalAsFound",
      label: "closed signal as found",
      type: "text",
    },
    {
      key: "supplyPressureAsFound",
      label: "supply pressure as found",
      type: "text",
    },
    {
      key: "failActionAsFound",
      label: "fail action",
      type: "select",
      options: ["Open", "Close"],
    },
  ],
  2: [
    { key: "benchSetAsLeft", label: "bench set as left", type: "text" },
    { key: "openSignalAsLeft", label: "open signal as left", type: "text" },
    { key: "closedSignalAsLeft", label: "closed signal as left", type: "text" },
    {
      key: "supplyPressureAsLeft",
      label: "supply pressure as left",
      type: "text",
    },
    {
      key: "failActionAsLeft",
      label: "fail action as left",
      type: "select",
      options: ["Open", "Close"],
    },
    { key: "testWitness", label: "test witness", type: "text" },
    { key: "testTechnician", label: "test technician", type: "text" },
    { key: "gasTestPressure", label: "gas test pressure", type: "text" },
    { key: "gasTestResult", label: "gas test result", type: "text" },
    { key: "seatLeakClass", label: "seat leak class", type: "text" },
    { key: "allowableLeakage", label: "allowable leakage", type: "text" },
    { key: "actualLeakage", label: "actual leakage", type: "text" },
    { key: "notes", label: "notes", type: "text" },
    { key: "recommendations", label: "recommendations", type: "text" },
  ],
};

// ── TTS ───────────────────────────────────────────────────────────────────────

function speakAsync(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();

    function doSpeak() {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      const fallback = setTimeout(
        () => {
          synth.cancel();
          resolve();
        },
        text.length * 80 + 2500,
      );
      utt.onend = () => {
        clearTimeout(fallback);
        resolve();
      };
      utt.onerror = () => {
        clearTimeout(fallback);
        resolve();
      };
      synth.speak(utt);
      setTimeout(() => {
        if (synth.paused) synth.resume();
      }, 150);
    }

    if (synth.getVoices().length > 0) {
      doSpeak();
    } else {
      let done = false;
      const go = () => {
        if (!done) {
          done = true;
          doSpeak();
        }
      };
      synth.addEventListener("voiceschanged", go, { once: true });
      setTimeout(go, 600);
    }
  });
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Audio recording with silence detection ────────────────────────────────────

async function recordAudio(
  abort: AbortSignal,
  stopRef: React.MutableRefObject<(() => void) | null>,
): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (abort.aborted) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("aborted");
  }

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/mp4")
      ? "audio/mp4"
      : "";

  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Silence detection via Web Audio
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  return new Promise<Blob>((resolve, reject) => {
    let hasSpoken = false;
    let silenceStart: number | null = null;
    let stopped = false;

    function stop() {
      if (stopped) return;
      stopped = true;
      stopRef.current = null;
      clearInterval(silenceTimer);
      clearTimeout(maxTimer);
      recorder.stop();
    }

    stopRef.current = stop;

    const silenceTimer = setInterval(() => {
      analyser.getByteFrequencyData(freqData);
      const rms = Math.sqrt(
        freqData.reduce((s, v) => s + v * v, 0) / freqData.length,
      );
      if (rms > 10) {
        hasSpoken = true;
        silenceStart = null;
      } else if (hasSpoken) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - silenceStart > 1500) stop();
      }
    }, 100);

    // Hard cap at 12 seconds
    const maxTimer = setTimeout(stop, 12000);

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      audioCtx.close();
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    recorder.start(100);

    abort.addEventListener("abort", () => {
      stop();
      reject(new Error("aborted"));
    });
  });
}

// ── Groq transcription ────────────────────────────────────────────────────────

async function transcribeBlob(blob: Blob): Promise<string> {
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const form = new FormData();
  form.append("audio", blob, `recording.${ext}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) throw new Error("Transcription failed");
  const data = await res.json();
  return (data.text ?? "").trim();
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function detectCommand(t: string): "skip" | "stop" | null {
  const s = t.toLowerCase();
  if (/\b(skip|pass|next)\b/.test(s)) return "skip";
  if (/\b(stop|exit|quit|cancel)\b/.test(s)) return "stop";
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
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const s = t.toLowerCase();
  const m = s.match(/(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
  if (m && months[m[1]])
    return `${m[3]}-${months[m[1]]}-${m[2].padStart(2, "0")}`;
  const m2 = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m2) return `${m2[3]}-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return t;
}

// ── Main async loop ───────────────────────────────────────────────────────────

interface UIState {
  state: VoiceState;
  fieldIndex: number;
  pendingValue: string;
}

function waitForConfirm(
  ref: React.MutableRefObject<((v: boolean) => void) | null>,
  abort: AbortSignal,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    ref.current = resolve;
    abort.addEventListener("abort", () => {
      ref.current = null;
      reject(new Error("aborted"));
    });
  });
}

async function voiceLoop(
  step: number,
  fields: VoiceField[],
  onUpdate: (patch: Partial<RepairReport>) => void,
  setUI: (u: UIState) => void,
  abort: AbortSignal,
  stopRecordingRef: React.MutableRefObject<(() => void) | null>,
  confirmRef: React.MutableRefObject<((v: boolean) => void) | null>,
) {
  if (!fields.length) return;

  setUI({ state: "asking", fieldIndex: 0, pendingValue: "" });
  await speakAsync(
    `Voice mode started. I'll guide you through ${STEP_NAMES[step] ?? "this step"}.`,
  );
  if (abort.aborted) return;

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    let retrying = false;

    while (!abort.aborted) {
      // Speak the field question
      setUI({ state: "asking", fieldIndex: i, pendingValue: "" });
      const question = retrying
        ? `Let's try again. What is the ${field.label}?`
        : `What is the ${field.label}?`;
      if (field.type === "select" && field.options) {
        await speakAsync(`${question} Say ${field.options.join(" or ")}.`);
      } else {
        await speakAsync(question);
      }
      if (abort.aborted) return;
      await pause(300);
      if (abort.aborted) return;

      // Record
      setUI({ state: "recording", fieldIndex: i, pendingValue: "" });
      let blob: Blob;
      try {
        blob = await recordAudio(abort, stopRecordingRef);
      } catch {
        setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
        return;
      }

      // Transcribe via Groq
      setUI({ state: "transcribing", fieldIndex: i, pendingValue: "" });
      let text: string;
      try {
        text = await transcribeBlob(blob);
      } catch {
        // transcription failed — retry the field
        retrying = true;
        await speakAsync("Sorry, I couldn't process that. Let's try again.");
        continue;
      }

      if (!text) {
        retrying = true;
        await speakAsync("I didn't catch that. Let's try again.");
        continue;
      }

      // Check for commands in the transcription
      const cmd = detectCommand(text);
      if (cmd === "stop") {
        setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
        return;
      }
      if (cmd === "skip") break;

      // Parse the value
      let value = text;
      if (field.type === "select" && field.options)
        value = parseSelectValue(text, field.options);
      if (field.type === "date") value = normalizeDate(text);

      // Show confirmation
      setUI({ state: "confirming", fieldIndex: i, pendingValue: value });
      await speakAsync(`I heard: ${value}.`);

      // Wait for tap (YES or NO buttons in overlay)
      let confirmed: boolean;
      try {
        confirmed = await waitForConfirm(confirmRef, abort);
      } catch {
        setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
        return;
      }

      if (confirmed) {
        onUpdate({ [field.key]: value } as Partial<RepairReport>);
        break;
      } else {
        retrying = true;
      }
    }
  }

  if (!abort.aborted) {
    setUI({ state: "done", fieldIndex: fields.length - 1, pendingValue: "" });
    await speakAsync(`All ${STEP_NAMES[step] ?? ""} fields complete.`);
    setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface VoiceAgentReturn {
  state: VoiceState;
  fieldIndex: number;
  pendingValue: string;
  currentField: VoiceField | null;
  totalFields: number;
  start: () => void;
  stop: () => void;
  stopRecording: () => void;
  pressConfirm: () => void;
  pressRetry: () => void;
}

export function useVoiceAgent(
  step: number,
  onUpdate: (patch: Partial<RepairReport>) => void,
): VoiceAgentReturn {
  const [ui, setUI] = useState<UIState>({
    state: "idle",
    fieldIndex: 0,
    pendingValue: "",
  });

  const abortRef = useRef<AbortController | null>(null);
  const stopRecordingRef = useRef<(() => void) | null>(null);
  const confirmRef = useRef<((v: boolean) => void) | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const fields = STEP_FIELDS[step] ?? [];

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopRecordingRef.current = null;
    confirmRef.current = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
  }, []);

  const start = useCallback(() => {
    stop();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setUI({ state: "asking", fieldIndex: 0, pendingValue: "" });

    // Request mic permission within user gesture before async work begins
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        voiceLoop(
          step,
          STEP_FIELDS[step] ?? [],
          (patch) => onUpdateRef.current(patch),
          setUI,
          ctrl.signal,
          stopRecordingRef,
          confirmRef,
        ).catch(() => {});
      })
      .catch(() => {
        alert(
          "Microphone access was denied. Please allow microphone access in your browser settings, then try again.",
        );
        setUI({ state: "idle", fieldIndex: 0, pendingValue: "" });
      });
  }, [step, stop]);

  const stopRecording = useCallback(() => {
    stopRecordingRef.current?.();
  }, []);
  const pressConfirm = useCallback(() => {
    confirmRef.current?.(true);
  }, []);
  const pressRetry = useCallback(() => {
    confirmRef.current?.(false);
  }, []);

  useEffect(() => {
    stop();
  }, [step, stop]);
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
    start,
    stop,
    stopRecording,
    pressConfirm,
    pressRetry,
  };
}
