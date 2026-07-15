// Deterministic rule enforcement for the import page.
//
// Prompt rules alone cannot blank a field: the regex parser fills fields
// before AI enhancement, and enhanceWithAi only overwrites with non-empty
// AI values (empty answers are ignored by design). So rules like
// "Leave Service description blank" are interpreted here and enforced by
// clearing the fields after extraction — guaranteed, not LLM-dependent.

import type { ParsedPdfReport } from "./pdfParser";

// Editable-table headers → underlying fields. Split columns (model/size,
// bench set) map to their combined field, so blanking either header blanks
// the whole stored value.
const HEADER_TO_FIELD: Array<[header: string, field: keyof ParsedPdfReport]> = [
  ["Tag", "tagOrUnit"],
  ["Service description", "scopeOfWork"],
  ["P & ID no.", "emrReference"],
  ["P&ID", "emrReference"],
  ["PID no", "emrReference"],
  ["Datasheet no.", "crmodReference"],
  ["Data sheet no.", "crmodReference"],
  ["Valve manufacturer", "valveMake"],
  ["Valve model", "valveModelSize"],
  ["Valve size", "valveModelSize"],
  ["Valve serial number", "valveSerialNumber"],
  ["Valve pressure class", "valveClassConnection"],
  ["Valve rated travel", "ratedTravel"],
  ["Valve leak class", "seatLeakClass"],
  ["Valve trim style/number", "valveTrimCharPort"],
  ["Valve packing type/material", "valvePackingConfiguration"],
  ["Valve flow direction", "valveFlowDirection"],
  ["Actuator manufacturer", "actuatorMake"],
  ["Actuator model", "actuatorModelSize"],
  ["Actuator size", "actuatorModelSize"],
  ["Actuator serial number", "actuatorSerialNumber"],
  ["Actuator lower bench set", "benchSetAsLeft"],
  ["Actuator upper bench set", "benchSetAsLeft"],
  ["Bench set", "benchSetAsLeft"],
  ["Actuator nominal supply pressure", "supplyPressureAsLeft"],
  ["Actuator fail action", "failActionAsLeft"],
  ["Actuator air", "actuatorAirAction"],
  ["Device 1 Manufacturer", "positionerMake"],
  ["Device 1 Model number", "positionerModelAction"],
  ["Device 1 Serial number", "positionerSerialNumber"],
];

/** Lowercase, strip punctuation (& . / , ' ") to spaces, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[&./,'"()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADER_PATTERNS: Array<[RegExp, keyof ParsedPdfReport]> = HEADER_TO_FIELD.map(
  ([header, field]) => [new RegExp(`\\b${normalize(header).replace(/ /g, "\\s+")}\\b`), field],
);

// "leave/keep/set … blank/empty" or "do not/don't/never fill/extract/populate",
// but NOT negated forms like "never leave … blank".
const BLANK_DIRECTIVE = /\b(?:leave|keep|set)\b[\s\S]{0,120}?\b(?:blank|empty)\b/;
const NO_FILL_DIRECTIVE = /\b(?:do not|don t|dont|never)\s+(?:fill|extract|populate)\b/;
const NEGATED = /\b(?:never|not|don t|dont)\s+(?:leave|keep|set)\b/;

/** Fields a single rule demands be left blank, or [] if it isn't a blank rule. */
export function blankFieldsForRule(ruleText: string): (keyof ParsedPdfReport)[] {
  const text = normalize(ruleText);
  const isDirective = (BLANK_DIRECTIVE.test(text) && !NEGATED.test(text)) || NO_FILL_DIRECTIVE.test(text);
  if (!isDirective) return [];
  const fields = new Set<keyof ParsedPdfReport>();
  for (const [pattern, field] of HEADER_PATTERNS) {
    if (pattern.test(text)) fields.add(field);
  }
  return [...fields];
}

/** Union of blank-fields across all applicable rules. */
export function blankFieldsForRules(ruleTexts: string[]): (keyof ParsedPdfReport)[] {
  const fields = new Set<keyof ParsedPdfReport>();
  for (const text of ruleTexts) {
    for (const f of blankFieldsForRule(text)) fields.add(f);
  }
  return [...fields];
}

/** Clear the given fields on a parsed report (returns a new object). */
export function enforceBlankFields(
  result: ParsedPdfReport,
  fields: (keyof ParsedPdfReport)[],
): ParsedPdfReport {
  if (fields.length === 0) return result;
  const out = { ...result };
  for (const f of fields) {
    if (typeof out[f] === "string") (out as Record<string, unknown>)[f] = "";
  }
  return out;
}
