"use client";

import { useState } from "react";
import db from "@/lib/db";
import {
  FINDING_COMPONENTS,
  FindingCategory,
  RepairFinding,
} from "@/lib/types";

const CATEGORIES = Object.keys(FINDING_COMPONENTS) as FindingCategory[];

export default function FindingsEditor({
  reportId,
  findings,
  phase,
}: {
  reportId: string;
  findings: RepairFinding[];
  phase: "asFound" | "asLeft";
}) {
  const [category, setCategory] = useState<FindingCategory>("Body/Bonnet");
  const [component, setComponent] = useState(FINDING_COMPONENTS[category][0]);

  async function addFinding() {
    await db.findings.add({
      id: crypto.randomUUID(),
      repairReportId: reportId,
      componentCategory: category,
      componentName: component,
      conditionFound: "",
      recommendedAction: "",
      asLeftAction: "",
      comments: "",
    });
  }

  async function updateFinding(id: string, patch: Partial<RepairFinding>) {
    await db.findings.update(id, patch);
  }

  async function removeFinding(id: string) {
    await db.findings.delete(id);
  }

  async function applyNoChange(f: RepairFinding) {
    await db.findings.update(f.id, {
      asLeftAction: `No change — ${f.recommendedAction}`,
    });
  }

  return (
    <div className="mb-5">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <select
          className="input"
          value={category}
          onChange={(e) => {
            const cat = e.target.value as FindingCategory;
            setCategory(cat);
            setComponent(FINDING_COMPONENTS[cat][0]);
          }}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={component}
          onChange={(e) => setComponent(e.target.value)}
        >
          {FINDING_COMPONENTS[category].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={addFinding}
          className="rounded-lg bg-[#154A8A] px-4 py-2 text-sm font-semibold text-white"
        >
          + Add Finding
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {findings.map((f) => (
          <div
            key={f.id}
            className="rounded-lg border border-zinc-200 bg-white p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-800">
                {f.componentCategory} — {f.componentName}
              </span>
              <button
                onClick={() => removeFinding(f.id)}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            </div>
            {phase === "asFound" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="input"
                  placeholder="Condition Found"
                  defaultValue={f.conditionFound}
                  onBlur={(e) =>
                    updateFinding(f.id, { conditionFound: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="Recommended Action"
                  defaultValue={f.recommendedAction}
                  onBlur={(e) =>
                    updateFinding(f.id, { recommendedAction: e.target.value })
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    placeholder="As Left Action"
                    defaultValue={f.asLeftAction}
                    onBlur={(e) =>
                      updateFinding(f.id, { asLeftAction: e.target.value })
                    }
                  />
                  <button
                    onClick={() => applyNoChange(f)}
                    className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700"
                  >
                    No change
                  </button>
                </div>
                <textarea
                  className="input"
                  placeholder="Comments"
                  rows={2}
                  defaultValue={f.comments}
                  onBlur={(e) =>
                    updateFinding(f.id, { comments: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        ))}
        {findings.length === 0 && (
          <p className="text-sm text-zinc-400">No findings added yet.</p>
        )}
      </div>
    </div>
  );
}
