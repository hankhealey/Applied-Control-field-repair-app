"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import Header from "@/components/Header";
import StepIndicator from "@/components/wizard/StepIndicator";
import { Field, SectionHeader } from "@/components/wizard/Field";
import FindingsEditor from "@/components/wizard/FindingsEditor";
import PhotoUploader from "@/components/wizard/PhotoUploader";
import db from "@/lib/db";
import {
  RepairReport,
  YesNoBlank,
  deriveActuatorAirAction,
  hasAsFoundData,
  hasAsLeftData,
} from "@/lib/types";
import { CALIBRATION_PAIRS } from "@/lib/copy";
import { normalizeReport } from "@/lib/reportNumber";
import { exportRepairPdf, exportAsFoundPdf } from "@/lib/exports/pdf";
import { exportRepairJson, exportAsFoundJson } from "@/lib/exports/json";
import { exportIrisCsv } from "@/lib/exports/iris";
import { useVoiceAgent } from "@/hooks/useVoiceAgent";
import VoiceAgentOverlay from "@/components/VoiceAgentOverlay";

export default function ReportWizard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [manualStep, setManualStep] = useState<number | null>(null);
  const [noChange, setNoChange] = useState<Record<string, boolean>>({});

  const rawReport = useLiveQuery(() => db.reports.get(id), [id]);
  const report = useMemo(
    () => (rawReport ? normalizeReport(rawReport) : undefined),
    [rawReport]
  );
  const sites = useLiveQuery(() => db.sites.toArray(), [], []);
  const findings = useLiveQuery(
    () => db.findings.where("repairReportId").equals(id).toArray(),
    [id],
    []
  );
  const photos = useLiveQuery(
    () => db.photos.where("repairReportId").equals(id).toArray(),
    [id],
    []
  );

  const autoStep =
    report && hasAsFoundData(report) && !hasAsLeftData(report) ? 2 : 0;
  const step = manualStep ?? autoStep;
  const setStep = setManualStep;

  const voice = useVoiceAgent(step, update);

  const completed = useMemo(() => {
    if (!report) return [false, false, false, false];
    const jobDone = Boolean(report.tagOrUnit && report.customer && report.siteId);
    return [
      jobDone,
      hasAsFoundData(report),
      hasAsLeftData(report),
      report.status === "Complete",
    ];
  }, [report]);

  async function update(patch: Partial<RepairReport>) {
    if (!report) return;
    const next: RepairReport = { ...report, ...patch, updatedAt: new Date().toISOString() };
    if (next.status === "Draft" && (hasAsFoundData(next) || next.tagOrUnit || next.customer)) {
      next.status = "In Progress";
    }
    if (patch.failActionAsLeft !== undefined) {
      next.actuatorAirAction = deriveActuatorAirAction(patch.failActionAsLeft);
    }
    await db.reports.put(next);
  }

  async function copyAllAsFoundToAsLeft() {
    if (!report) return;
    await update({
      benchSetAsLeft: report.benchSetAsFound,
      openSignalAsLeft: report.openSignalAsFound,
      closedSignalAsLeft: report.closedSignalAsFound,
      supplyPressureAsLeft: report.supplyPressureAsFound,
      failActionAsLeft: report.failActionAsFound,
    });
    const next: Record<string, boolean> = {};
    CALIBRATION_PAIRS.forEach((p) => (next[p.label] = true));
    setNoChange(next);
  }

  function toggleNoChange(label: string, asFoundKey: keyof RepairReport, asLeftKey: keyof RepairReport) {
    if (!report) return;
    const willBeChecked = !noChange[label];
    setNoChange((prev) => ({ ...prev, [label]: willBeChecked }));
    if (willBeChecked) {
      update({ [asLeftKey]: report[asFoundKey] } as Partial<RepairReport>);
    }
  }

  async function handleSubmit() {
    if (!report) return;
    await update({ status: "Complete" });
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <p className="p-6 text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={() => router.push("/")} className="text-sm font-medium text-[#154A8A]">
            ← Back to Reports
          </button>
          <span className="text-sm text-zinc-500">Step {step + 1}/4</span>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-lg font-bold text-zinc-900">{report.reportNumber}</h1>
            <span className="text-sm text-zinc-500">{report.status}</span>
          </div>
          <p className="mb-3 text-sm text-zinc-500">
            {report.siteTitle || "No site"} • {report.tagOrUnit || "No tag"}
          </p>
          <StepIndicator current={step} completed={completed} onSelect={setStep} />
        </div>

        {step === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <SectionHeader title="Job Information" subtitle="Top-level details for this repair" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field label="Site" className="sm:col-span-2">
                <select
                  className="input"
                  value={report.siteId}
                  onChange={(e) => {
                    const site = sites?.find((s) => s.id === e.target.value);
                    update({
                      siteId: e.target.value,
                      siteTitle: site?.title ?? "",
                      customer: report.customer || site?.customer || "",
                    });
                  }}
                >
                  <option value="">No site selected</option>
                  {sites?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Report Number">
                <input
                  className="input"
                  value={report.reportNumber}
                  onChange={(e) => update({ reportNumber: e.target.value })}
                />
              </Field>
              <Field label="Tag / Unit">
                <input
                  className="input"
                  value={report.tagOrUnit}
                  onChange={(e) => update({ tagOrUnit: e.target.value })}
                />
              </Field>
              <Field label="Customer">
                <input
                  className="input"
                  value={report.customer}
                  onChange={(e) => update({ customer: e.target.value })}
                />
              </Field>
              <Field label="Technician">
                <input
                  className="input"
                  value={report.technician}
                  onChange={(e) => update({ technician: e.target.value })}
                />
              </Field>
              <Field label="Repair Date">
                <input
                  type="date"
                  className="input"
                  value={report.repairDate}
                  onChange={(e) => update({ repairDate: e.target.value })}
                />
              </Field>
              <Field label="Process">
                <input
                  className="input"
                  value={report.process}
                  onChange={(e) => update({ process: e.target.value })}
                />
              </Field>
              <Field label="EMR Reference">
                <input
                  className="input"
                  value={report.emrReference}
                  onChange={(e) => update({ emrReference: e.target.value })}
                />
              </Field>
              <Field label="CRMoD Reference">
                <input
                  className="input"
                  value={report.crmodReference}
                  onChange={(e) => update({ crmodReference: e.target.value })}
                />
              </Field>
              <Field label="Scope of Work" className="sm:col-span-2">
                <textarea
                  className="input"
                  rows={3}
                  value={report.scopeOfWork}
                  onChange={(e) => update({ scopeOfWork: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-3 border-t border-zinc-100 p-4">
              <button onClick={() => setStep(1)} className="rounded-lg bg-[#154A8A] px-5 py-2 text-sm font-semibold text-white">
                Next: As Found
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-xl border border-amber-300 bg-white shadow-sm">
            <SectionHeader
              title="Checkpoint 1 — As Found — Initial Inspection"
              subtitle="Capture the equipment as you arrived on site: nameplate data, construction, baseline calibration readings, and findings."
              tone="amber"
            />
            <div className="p-5">
              <h3 className="mb-3 font-semibold text-zinc-800">Construction — As Found</h3>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <p className="col-span-full text-sm font-semibold text-zinc-500">VALVE / BODY</p>
                <Field label="Valve Make">
                  <input className="input" value={report.valveMake} onChange={(e) => update({ valveMake: e.target.value })} />
                </Field>
                <Field label="Valve Serial Number">
                  <input className="input" value={report.valveSerialNumber} onChange={(e) => update({ valveSerialNumber: e.target.value })} />
                </Field>
                <Field label="Valve Model / Size">
                  <input className="input" value={report.valveModelSize} onChange={(e) => update({ valveModelSize: e.target.value })} />
                </Field>
                <Field label="Valve Class / Connection">
                  <input className="input" value={report.valveClassConnection} onChange={(e) => update({ valveClassConnection: e.target.value })} />
                </Field>
                <Field label="Packing Configuration">
                  <input className="input" value={report.valvePackingConfiguration} onChange={(e) => update({ valvePackingConfiguration: e.target.value })} />
                </Field>
                <Field label="Trim Char / Port">
                  <input className="input" value={report.valveTrimCharPort} onChange={(e) => update({ valveTrimCharPort: e.target.value })} />
                </Field>
                <Field label="Flow Direction">
                  <input className="input" value={report.valveFlowDirection} onChange={(e) => update({ valveFlowDirection: e.target.value })} />
                </Field>
                <Field label="Body/Bonnet Bolting">
                  <input className="input" value={report.bodyBonnetBolting} onChange={(e) => update({ bodyBonnetBolting: e.target.value })} />
                </Field>

                <p className="col-span-full mt-2 text-sm font-semibold text-zinc-500">ACTUATOR</p>
                <Field label="Actuator Make">
                  <input className="input" value={report.actuatorMake} onChange={(e) => update({ actuatorMake: e.target.value })} />
                </Field>
                <Field label="Actuator Serial Number">
                  <input className="input" value={report.actuatorSerialNumber} onChange={(e) => update({ actuatorSerialNumber: e.target.value })} />
                </Field>
                <Field label="Actuator Model / Size">
                  <input className="input" value={report.actuatorModelSize} onChange={(e) => update({ actuatorModelSize: e.target.value })} />
                </Field>
                <Field label="Action / Handwheel">
                  <input className="input" value={report.actuatorActionHandwheel} onChange={(e) => update({ actuatorActionHandwheel: e.target.value })} />
                </Field>
                <Field label="Mounting">
                  <input className="input" value={report.actuatorMounting} onChange={(e) => update({ actuatorMounting: e.target.value })} />
                </Field>
                <Field label="Position">
                  <input className="input" value={report.actuatorPosition} onChange={(e) => update({ actuatorPosition: e.target.value })} />
                </Field>

                <p className="col-span-full mt-2 text-sm font-semibold text-zinc-500">POSITIONER</p>
                <Field label="Positioner Make">
                  <input className="input" value={report.positionerMake} onChange={(e) => update({ positionerMake: e.target.value })} />
                </Field>
                <Field label="Positioner Serial Number">
                  <input className="input" value={report.positionerSerialNumber} onChange={(e) => update({ positionerSerialNumber: e.target.value })} />
                </Field>
                <Field label="Model / Action">
                  <input className="input" value={report.positionerModelAction} onChange={(e) => update({ positionerModelAction: e.target.value })} />
                </Field>
              </div>

              <h3 className="mb-3 font-semibold text-zinc-800">Calibration — As Found</h3>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Rated Travel">
                  <input className="input" value={report.ratedTravel} onChange={(e) => update({ ratedTravel: e.target.value })} />
                </Field>
                <Field label="Bench Set">
                  <input className="input" value={report.benchSetAsFound} onChange={(e) => update({ benchSetAsFound: e.target.value })} />
                </Field>
                <Field label="Signal Open">
                  <input className="input" value={report.openSignalAsFound} onChange={(e) => update({ openSignalAsFound: e.target.value })} />
                </Field>
                <Field label="Signal Closed">
                  <input className="input" value={report.closedSignalAsFound} onChange={(e) => update({ closedSignalAsFound: e.target.value })} />
                </Field>
                <Field label="Supply Pressure">
                  <input className="input" value={report.supplyPressureAsFound} onChange={(e) => update({ supplyPressureAsFound: e.target.value })} />
                </Field>
                <Field label="Fail Action">
                  <select
                    className="input"
                    value={report.failActionAsFound}
                    onChange={(e) => update({ failActionAsFound: e.target.value as YesNoBlank })}
                  >
                    <option value="">—</option>
                    <option value="Open">Open</option>
                    <option value="Close">Close</option>
                  </select>
                </Field>
                <Field label="Calibration Technician">
                  <input className="input" value={report.calibrationTechnician} onChange={(e) => update({ calibrationTechnician: e.target.value })} />
                </Field>
                <Field label="Diagnostics Completed (As Found)">
                  <select
                    className="input"
                    value={report.diagnosticsCompletedAsFound ? "yes" : "no"}
                    onChange={(e) => update({ diagnosticsCompletedAsFound: e.target.value === "yes" })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
              </div>

              <h3 className="mb-3 font-semibold text-zinc-800">Findings — As Found</h3>
              <FindingsEditor reportId={report.id} findings={findings ?? []} phase="asFound" />

              <h3 className="mb-3 font-semibold text-zinc-800">Photos — As Found</h3>
              <PhotoUploader reportId={report.id} category="As Found Assembly" photos={photos ?? []} />
              <PhotoUploader reportId={report.id} category="As Found Trim" photos={photos ?? []} />
              <PhotoUploader reportId={report.id} category="Nameplate / Tag" photos={photos ?? []} />
              <PhotoUploader reportId={report.id} category="Damage Detail" photos={photos ?? []} />

              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="mb-1 font-semibold text-amber-900">Leaving site? Export the As Found report.</p>
                <p className="mb-3 text-sm text-amber-800">
                  Send this interim PDF to the office or attach it to the parts request. You can come back later and add As Left readings.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => exportAsFoundPdf(report.id)}
                    className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
                  >
                    📄 Export As Found PDF
                  </button>
                  <button
                    onClick={() => exportAsFoundJson(report.id)}
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
                  >
                    ⬇ Export As Found JSON
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-between border-t border-zinc-100 p-4">
              <button onClick={() => setStep(0)} className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700">
                ← Back
              </button>
              <button onClick={() => setStep(2)} className="rounded-lg bg-[#154A8A] px-5 py-2 text-sm font-semibold text-white">
                Next: As Left
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border border-emerald-300 bg-white shadow-sm">
            <SectionHeader
              title="Checkpoint 2 — As Left — Final Verification"
              subtitle="Record the repair outcome: calibration after repair, post-repair tests, and final findings."
              tone="emerald"
            />
            <div className="p-5">
              <Field label="Construction Changed?" className="mb-5 max-w-xs">
                <select
                  className="input"
                  value={report.constructionChanged ? "yes" : "no"}
                  onChange={(e) => update({ constructionChanged: e.target.value === "yes" })}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>

              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-zinc-800">Calibration — As Left</h3>
                <button
                  onClick={copyAllAsFoundToAsLeft}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  Copy all As Found → As Left
                </button>
              </div>
              <div className="mb-5 flex flex-col gap-3">
                {CALIBRATION_PAIRS.map((pair) => (
                  <div key={pair.label} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label={`${pair.label} (As Found)`}>
                      <input className="input bg-zinc-50" value={String(report[pair.asFoundKey] ?? "")} disabled />
                    </Field>
                    <Field label={`${pair.label} (As Left)`}>
                      {pair.label === "Fail Action" ? (
                        <select
                          className="input"
                          value={String(report[pair.asLeftKey] ?? "")}
                          disabled={!!noChange[pair.label]}
                          onChange={(e) => update({ [pair.asLeftKey]: e.target.value } as Partial<RepairReport>)}
                        >
                          <option value="">—</option>
                          <option value="Open">Open</option>
                          <option value="Close">Close</option>
                        </select>
                      ) : (
                        <input
                          className="input"
                          value={String(report[pair.asLeftKey] ?? "")}
                          disabled={!!noChange[pair.label]}
                          onChange={(e) => update({ [pair.asLeftKey]: e.target.value } as Partial<RepairReport>)}
                        />
                      )}
                    </Field>
                    <label className="flex items-center gap-2 pb-2 text-xs font-medium text-zinc-600">
                      <input
                        type="checkbox"
                        checked={!!noChange[pair.label]}
                        onChange={() => toggleNoChange(pair.label, pair.asFoundKey, pair.asLeftKey)}
                      />
                      No change
                    </label>
                  </div>
                ))}
                <Field label="Actuator Air Action (derived)" className="max-w-xs">
                  <input className="input bg-zinc-50" value={report.actuatorAirAction} disabled />
                </Field>
              </div>

              <h3 className="mb-3 font-semibold text-zinc-800">Post Valve Repair Test Data</h3>
              <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Test Witness">
                  <input className="input" value={report.testWitness} onChange={(e) => update({ testWitness: e.target.value })} />
                </Field>
                <Field label="Test Technician">
                  <input className="input" value={report.testTechnician} onChange={(e) => update({ testTechnician: e.target.value })} />
                </Field>
                <Field label="Test Date">
                  <input type="date" className="input" value={report.testDate} onChange={(e) => update({ testDate: e.target.value })} />
                </Field>
                <Field label="Gas Test Pressure">
                  <input className="input" value={report.gasTestPressure} onChange={(e) => update({ gasTestPressure: e.target.value })} />
                </Field>
                <Field label="Gas Test Result">
                  <input className="input" value={report.gasTestResult} onChange={(e) => update({ gasTestResult: e.target.value })} />
                </Field>
                <Field label="Diagnostics Completed (As Left)">
                  <select
                    className="input"
                    value={report.diagnosticsCompletedAsLeft ? "yes" : "no"}
                    onChange={(e) => update({ diagnosticsCompletedAsLeft: e.target.value === "yes" })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Seat Leak Class">
                  <input className="input" value={report.seatLeakClass} onChange={(e) => update({ seatLeakClass: e.target.value })} />
                </Field>
                <Field label="Seat Leak Test Pressure">
                  <input className="input" value={report.seatLeakTestPressure} onChange={(e) => update({ seatLeakTestPressure: e.target.value })} />
                </Field>
                <Field label="Stroked From Control Room">
                  <select
                    className="input"
                    value={report.strokedFromControlRoom ? "yes" : "no"}
                    onChange={(e) => update({ strokedFromControlRoom: e.target.value === "yes" })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Allowable Leakage">
                  <input className="input" value={report.allowableLeakage} onChange={(e) => update({ allowableLeakage: e.target.value })} />
                </Field>
                <Field label="Actual Leakage">
                  <input className="input" value={report.actualLeakage} onChange={(e) => update({ actualLeakage: e.target.value })} />
                </Field>
                <Field label="Body/Bonnet Torque">
                  <input className="input" value={report.bodyBonnetTorque} onChange={(e) => update({ bodyBonnetTorque: e.target.value })} />
                </Field>
                <Field label="Packing Torque">
                  <input className="input" value={report.packingTorque} onChange={(e) => update({ packingTorque: e.target.value })} />
                </Field>
                <Field label="Hydro Test Pressure">
                  <input className="input" value={report.hydroTestPressure} onChange={(e) => update({ hydroTestPressure: e.target.value })} />
                </Field>
                <Field label="Hydro Test Duration">
                  <input className="input" value={report.hydroTestDuration} onChange={(e) => update({ hydroTestDuration: e.target.value })} />
                </Field>
              </div>

              <h3 className="mb-3 font-semibold text-zinc-800">Findings — As Left</h3>
              <FindingsEditor reportId={report.id} findings={findings ?? []} phase="asLeft" />

              <h3 className="mb-3 font-semibold text-zinc-800">Photos — As Left</h3>
              <PhotoUploader reportId={report.id} category="As Left Trim" photos={photos ?? []} />
              <PhotoUploader reportId={report.id} category="As Left Assembly" photos={photos ?? []} />

              <h3 className="mb-3 font-semibold text-zinc-800">Notes &amp; Recommendations</h3>
              <div className="mb-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Notes">
                  <textarea className="input" rows={3} value={report.notes} onChange={(e) => update({ notes: e.target.value })} />
                </Field>
                <Field label="Recommendations">
                  <textarea className="input" rows={3} value={report.recommendations} onChange={(e) => update({ recommendations: e.target.value })} />
                </Field>
                <Field label="Repair Scope Completed">
                  <select
                    className="input"
                    value={report.repairScopeCompleted ? "yes" : "no"}
                    onChange={(e) => update({ repairScopeCompleted: e.target.value === "yes" })}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
                <Field label="Future Recommendations">
                  <textarea
                    className="input"
                    rows={2}
                    value={report.futureRecommendations}
                    onChange={(e) => update({ futureRecommendations: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="flex justify-between border-t border-zinc-100 p-4">
              <button onClick={() => setStep(1)} className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700">
                ← Back
              </button>
              <button onClick={() => setStep(3)} className="rounded-lg bg-[#154A8A] px-5 py-2 text-sm font-semibold text-white">
                Next: Review
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <SectionHeader title="Review & Submit" subtitle="Final check before marking this report complete." />
            <div className="p-5 text-sm text-zinc-700">
              <p className="mb-2">
                <strong>{report.reportNumber}</strong> — {report.tagOrUnit} @ {report.siteTitle}
              </p>
              <p className="mb-2">Customer: {report.customer} • Technician: {report.technician}</p>
              <p className="mb-2">Findings recorded: {findings?.length ?? 0}</p>
              <p className="mb-4">Photos attached: {photos?.length ?? 0}</p>

              {report.status === "Complete" ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
                  <p className="mb-3 font-semibold text-emerald-800">✓ Report marked Complete.</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <button onClick={() => exportRepairPdf(report.id)} className="flex-1 rounded-lg bg-[#154A8A] px-4 py-2 text-sm font-semibold text-white">
                        Export PDF
                      </button>
                      <button onClick={() => exportRepairJson(report.id)} className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700">
                        Export JSON
                      </button>
                    </div>
                    <button
                      onClick={() => exportIrisCsv(report.id)}
                      className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800"
                    >
                      Export to IRIS CSV
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={handleSubmit} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white">
                  Submit Report
                </button>
              )}
            </div>
            <div className="flex justify-between border-t border-zinc-100 p-4">
              <button onClick={() => setStep(2)} className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700">
                ← Back
              </button>
              <button onClick={() => router.push("/")} className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-semibold text-zinc-700">
                Done
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Voice agent — only on steps 0-2, not review */}
      {step < 3 && <VoiceAgentOverlay voice={voice} step={step} />}
    </div>
  );
}
