import db from "../db";
import { RepairReport } from "../types";

async function buildPayload(reportId: string, blankAsLeft: boolean) {
  const report = await db.reports.get(reportId);
  if (!report) throw new Error("Report not found");
  const site = report.siteId ? await db.sites.get(report.siteId) : null;
  const findings = await db.findings.where("repairReportId").equals(reportId).toArray();
  let photos = await db.photos.where("repairReportId").equals(reportId).toArray();

  let reportOut: RepairReport = report;
  if (blankAsLeft) {
    reportOut = {
      ...report,
      benchSetAsLeft: "",
      openSignalAsLeft: "",
      closedSignalAsLeft: "",
      supplyPressureAsLeft: "",
      failActionAsLeft: "",
      actuatorAirAction: "",
      testWitness: "",
      testTechnician: "",
      testDate: "",
      gasTestPressure: "",
      gasTestResult: "",
    };
    photos = photos.filter(
      (p) => p.photoCategory === "As Found Assembly" || p.photoCategory === "As Found Trim" ||
        p.photoCategory === "Nameplate / Tag" || p.photoCategory === "Damage Detail"
    );
  }

  return {
    report: reportOut,
    site: site ?? null,
    findings,
    photos: photos.map((p) => ({
      category: p.photoCategory,
      caption: p.caption,
      sequenceNumber: p.sequenceNumber,
      photoBase64: p.photo,
    })),
  };
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportRepairJson(reportId: string) {
  const payload = await buildPayload(reportId, false);
  download(`${payload.report.reportNumber}.json`, payload);
}

export async function exportAsFoundJson(reportId: string) {
  const payload = await buildPayload(reportId, true);
  download(`${payload.report.reportNumber}-as-found.json`, payload);
}

export async function exportRepairJsonMulti(reportIds: string[]) {
  const payloads = await Promise.all(reportIds.map((id) => buildPayload(id, false)));
  download(`repair-reports-${Date.now()}.json`, payloads);
}
