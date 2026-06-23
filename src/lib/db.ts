import Dexie, { type EntityTable } from "dexie";
import type { RepairFinding, RepairPhoto, RepairReport, Site } from "./types";

const db = new Dexie("appliedControlDB") as Dexie & {
  sites: EntityTable<Site, "id">;
  reports: EntityTable<RepairReport, "id">;
  findings: EntityTable<RepairFinding, "id">;
  photos: EntityTable<RepairPhoto, "id">;
};

db.version(2).stores({
  sites: "id, title, customer",
  reports: "id, reportNumber, status, siteId, tagOrUnit",
  findings: "id, repairReportId, componentCategory",
  photos: "id, repairReportId, photoCategory, sequenceNumber",
});

db.version(3).stores({
  sites: "id, title, customer",
  reports: "id, reportNumber, status, siteId, tagOrUnit, irisSyncedAt",
  findings: "id, repairReportId, componentCategory",
  photos: "id, repairReportId, photoCategory, sequenceNumber",
}).upgrade((tx) => {
  return tx.table("reports").toCollection().modify((r) => {
    if (r.irisSyncedAt === undefined) r.irisSyncedAt = null;
  });
});

export async function deleteReportCascade(reportId: string) {
  await db.transaction("rw", db.reports, db.findings, db.photos, async () => {
    await db.findings.where("repairReportId").equals(reportId).delete();
    await db.photos.where("repairReportId").equals(reportId).delete();
    await db.reports.delete(reportId);
  });
}

export default db;
