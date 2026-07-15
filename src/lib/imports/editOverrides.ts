// Edit-overlay helpers for the import page's extracted-data table.
//
// Six table columns are "split cells": two inputs backed by one stored field
// (valveModelSize → model + size, actuatorModelSize → model + size,
// benchSetAsLeft → lower + upper). Re-joining the combined field on every
// keystroke is unstable — splitModelSize's no-size fallback returns the whole
// string for BOTH halves, so split→edit→join→split doubled the value on each
// backspace until the page crashed. Instead, edited halves are stored as
// _-prefixed overrides and the combined field is rebuilt only here.

import { splitBenchSet, splitModelSize } from "@/lib/exports/iris";
import type { ParsedPdfReport } from "./pdfParser";

export interface SplitOverrides {
  _valveModel?: string;
  _valveSize?: string;
  _actuatorModel?: string;
  _actuatorSize?: string;
  _benchLow?: string;
  _benchHigh?: string;
}

export type EditPatch = Partial<ParsedPdfReport> & SplitOverrides;

const SPLIT_KEYS: (keyof SplitOverrides)[] = [
  "_valveModel", "_valveSize", "_actuatorModel", "_actuatorSize", "_benchLow", "_benchHigh",
];

function stripSplitOverrides(patch: EditPatch): Partial<ParsedPdfReport> {
  const out: EditPatch = { ...patch };
  for (const k of SPLIT_KEYS) delete out[k];
  return out;
}

function joinModelSize(model: string, size: string): string {
  const m = model.trim();
  const s = size.trim();
  // Identical halves come from the no-size fallback (e.g. "DVC6200") — store once
  if (m && s && m !== s) return `${m} ${s}`;
  return m || s;
}

/**
 * Merge a file's edit patch onto its parsed result. Named fields overlay
 * directly; split-cell overrides are reassembled into their combined field
 * from the ORIGINAL result value, so editing one half can never feed back
 * into the other.
 */
export function applyEditPatch(result: ParsedPdfReport, patch: EditPatch): ParsedPdfReport {
  const merged: ParsedPdfReport = { ...result, ...stripSplitOverrides(patch) };

  if (patch._valveModel !== undefined || patch._valveSize !== undefined) {
    const base = splitModelSize(result.valveModelSize);
    merged.valveModelSize = joinModelSize(patch._valveModel ?? base.model, patch._valveSize ?? base.size);
  }
  if (patch._actuatorModel !== undefined || patch._actuatorSize !== undefined) {
    const base = splitModelSize(result.actuatorModelSize);
    merged.actuatorModelSize = joinModelSize(patch._actuatorModel ?? base.model, patch._actuatorSize ?? base.size);
  }
  if (patch._benchLow !== undefined || patch._benchHigh !== undefined) {
    const base = splitBenchSet(result.benchSetAsLeft);
    merged.benchSetAsLeft = [patch._benchLow ?? base[0], patch._benchHigh ?? base[1]]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("-");
  }

  return merged;
}
