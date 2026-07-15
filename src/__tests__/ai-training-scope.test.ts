import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AIRule, rulesForType } from "@/lib/imports/aiRules";
import {
  pickExamplesForType,
  retagUntypedExamples,
  type TrainingExample,
  updateTrainingExampleType,
} from "@/lib/imports/trainingExamples";

function rule(text: string, assetType: AIRule["assetType"]): AIRule {
  return { id: text, text, createdAt: "2026-07-13T00:00:00Z", assetType };
}

function example(filename: string, assetType?: string): TrainingExample {
  return { id: filename, filename, rawText: "raw", fields: {}, savedAt: "2026-07-13T00:00:00Z", assetType };
}

describe("rulesForType", () => {
  const rules = [
    rule("cv rule", "Control Valve"),
    rule("rv rule", "Relief Valve"),
    rule("global rule", "All"),
  ];

  it("returns same-type rules plus All-scoped rules", () => {
    expect(rulesForType(rules, "Control Valve").map((r) => r.text)).toEqual(["cv rule", "global rule"]);
  });

  it("excludes other types' rules", () => {
    expect(rulesForType(rules, "Steam Trap").map((r) => r.text)).toEqual(["global rule"]);
  });
});

describe("pickExamplesForType", () => {
  it("prefers most recent same-type examples", () => {
    const all = [
      example("cv1", "Control Valve"),
      example("cv2", "Control Valve"),
      example("rv1", "Relief Valve"),
      example("cv3", "Control Valve"),
      example("cv4", "Control Valve"),
    ];
    expect(pickExamplesForType(all, "Control Valve").map((e) => e.filename)).toEqual(["cv2", "cv3", "cv4"]);
  });

  it("never includes other types' examples", () => {
    const all = [example("cv1", "Control Valve"), example("rv1", "Relief Valve")];
    expect(pickExamplesForType(all, "Steam Trap")).toEqual([]);
  });

  it("tops up with All-scoped and legacy-untyped examples", () => {
    const all = [
      example("legacy1"), // untyped → treated as "All"
      example("global1", "All"),
      example("cv1", "Control Valve"),
    ];
    expect(pickExamplesForType(all, "Control Valve").map((e) => e.filename)).toEqual(["legacy1", "global1", "cv1"]);
  });

  it("caps at 3 with typed examples winning over globals", () => {
    const all = [
      example("global1", "All"),
      example("global2", "All"),
      example("cv1", "Control Valve"),
      example("cv2", "Control Valve"),
      example("cv3", "Control Valve"),
    ];
    expect(pickExamplesForType(all, "Control Valve").map((e) => e.filename)).toEqual(["cv1", "cv2", "cv3"]);
  });
});

describe("retagging stored examples", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    });
    store["pdf-training-examples"] = JSON.stringify([
      example("legacy1"),
      example("legacy2"),
      example("rv1", "Relief Valve"),
    ]);
  });

  it("retagUntypedExamples tags only untyped examples", () => {
    const updated = retagUntypedExamples("Control Valve");
    expect(updated.map((e) => e.assetType)).toEqual(["Control Valve", "Control Valve", "Relief Valve"]);
    const persisted = JSON.parse(store["pdf-training-examples"]) as TrainingExample[];
    expect(persisted.map((e) => e.assetType)).toEqual(["Control Valve", "Control Valve", "Relief Valve"]);
  });

  it("updateTrainingExampleType changes exactly one example", () => {
    const updated = updateTrainingExampleType("legacy2", "Steam Trap");
    expect(updated.find((e) => e.id === "legacy2")?.assetType).toBe("Steam Trap");
    expect(updated.find((e) => e.id === "legacy1")?.assetType).toBeUndefined();
    expect(updated.find((e) => e.id === "rv1")?.assetType).toBe("Relief Valve");
  });
});
