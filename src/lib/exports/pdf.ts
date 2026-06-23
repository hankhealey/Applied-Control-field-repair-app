import db from "../db";
import {
  type FindingCategory,
  PHOTO_CATEGORIES,
  type RepairFinding,
  type RepairPhoto,
  type RepairReport,
} from "../types";

const CATEGORY_ORDER: FindingCategory[] = [
  "Body/Bonnet",
  "Trim",
  "Actuator",
  "Positioner",
  "Other",
];

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function headerBand(r: RepairReport) {
  const completedAt =
    r.status === "Complete" ? esc(r.updatedAt.slice(0, 10)) : "-";
  const completedBy = r.status === "Complete" ? esc(r.technician) : "-";
  return `
    <div class="title-row">
      <div class="header-logo">
        <img src="/applied-control-logo.png" alt="Applied Control" class="logo-img" />
        <div class="tagline">Emerson Impact Partner</div>
      </div>
      <h1 class="title">Repair Report</h1>
      <div class="emerson-tag">Emerson Lifecycle Services</div>
    </div>
    <table class="info-grid">
      <tr>
        <td class="label">Site</td><td class="value">${esc(r.siteTitle)}</td>
        <td class="label">Tech</td><td class="value">${esc(r.technician)}</td>
        <td class="label">Tag / Unit</td><td class="value">${esc(r.tagOrUnit)}</td>
      </tr>
      <tr>
        <td class="label">EMR Reference</td><td class="value">${esc(r.emrReference)}</td>
        <td class="label">CRMoD Reference</td><td class="value">${esc(r.crmodReference)}</td>
        <td class="label">Process</td><td class="value">${esc(r.process)}</td>
      </tr>
      <tr>
        <td class="label">Status</td><td class="value">${esc(r.status)}</td>
        <td class="label">Completed At</td><td class="value">${completedAt}</td>
        <td class="label">Completed By</td><td class="value">${completedBy}</td>
      </tr>
    </table>
  `;
}

function footerBand(page: number, totalPages: number) {
  return `
    <div class="footer-band">
      <span>Customer Repair Report Rev.</span>
      <span>Page ${page} of ${totalPages}</span>
    </div>
  `;
}

type ConstructionField = { label: string; value: string };
type ConstructionGroup = { group: string; fields: ConstructionField[] };

function constructionGroups(
  r: RepairReport,
  phase: "asFound" | "asLeft",
): ConstructionGroup[] {
  // Construction fields are only recorded once; if nothing changed during the
  // repair the As Left block mirrors As Found, otherwise there's no separate
  // As Left construction data captured.
  const blank = phase === "asLeft" && r.constructionChanged;
  const v = (value: string) => (blank ? "" : value);
  return [
    {
      group: "Body",
      fields: [
        { label: "Make", value: v(r.valveMake) },
        { label: "S/N", value: v(r.valveSerialNumber) },
        { label: "Model / Size", value: v(r.valveModelSize) },
        { label: "Class / Conn.", value: v(r.valveClassConnection) },
        { label: "Pkg. Configuration", value: v(r.valvePackingConfiguration) },
        { label: "Trim Char / Port", value: v(r.valveTrimCharPort) },
      ],
    },
    {
      group: "Actuator",
      fields: [
        { label: "Make", value: v(r.actuatorMake) },
        { label: "S/N", value: v(r.actuatorSerialNumber) },
        { label: "Model / Size", value: v(r.actuatorModelSize) },
        { label: "Action / Handwheel", value: v(r.actuatorActionHandwheel) },
      ],
    },
    {
      group: "Positioner",
      fields: [
        { label: "Make", value: v(r.positionerMake) },
        { label: "S/N", value: v(r.positionerSerialNumber) },
        { label: "Model / Action", value: v(r.positionerModelAction) },
      ],
    },
  ];
}

function constructionBlock(
  title: string,
  groups: ConstructionGroup[],
  tone: "amber" | "emerald",
) {
  return `
    <div class="construction construction-${tone}">
      <div class="construction-title">${esc(title)}</div>
      ${groups
        .map(
          (g, gi) => `
        <div class="constr-group ${gi % 2 === 0 ? "stripe-a" : "stripe-b"}">
          <div class="constr-group-label">${esc(g.group)}</div>
          <div class="constr-group-rows">
            ${g.fields
              .map(
                (f) => `
              <div class="constr-row">
                <div class="constr-label">${esc(f.label)}</div>
                <div class="constr-value">${esc(f.value)}</div>
              </div>`,
              )
              .join("")}
          </div>
        </div>`,
        )
        .join("")}
    </div>
  `;
}

function constructionTable(r: RepairReport) {
  return `
    <div class="construction-columns">
      <div class="construction-column construction-column-left">
        ${constructionBlock("CONSTRUCTION — AS FOUND (AF)", constructionGroups(r, "asFound"), "amber")}
      </div>
      <div class="construction-column construction-column-right">
        ${constructionBlock("CONSTRUCTION — AS LEFT (AL)", constructionGroups(r, "asLeft"), "emerald")}
      </div>
    </div>
    <div class="panel">
      <div class="panel-row">
        <div class="panel-label">Construction Changed?</div>
        <div class="panel-value">${r.constructionChanged ? "Yes" : "No"}</div>
      </div>
    </div>
  `;
}

function page1(r: RepairReport) {
  return `
    <section class="sheet">
      ${headerBand(r)}
      <div class="construction-columns">
        <div class="construction-column construction-column-left">
          <div class="panel">
            <div class="panel-title">SERVICE INFORMATION</div>
            <div class="panel-row"><div class="panel-label">Customer</div><div class="panel-value">${esc(r.customer)}</div></div>
            <div class="panel-row"><div class="panel-label">Repair Date</div><div class="panel-value">${esc(r.repairDate)}</div></div>
          </div>
        </div>
        <div class="construction-column construction-column-right">
          <div class="panel">
            <div class="panel-title">SCOPE OF WORK / PROBLEM</div>
            <div class="panel-body">${esc(r.scopeOfWork)}</div>
          </div>
        </div>
      </div>

      ${constructionTable(r)}

      <div class="panel">
        <div class="panel-title panel-title-split">
          <span>CALIBRATION</span>
          <span>As Left Calibration Technician <span class="yellow inline-pill">${esc(r.calibrationTechnician)}</span></span>
        </div>
        <div class="panel-row cal-header">
          <div class="cal-col-label"></div>
          <div class="cal-col">TRAVEL</div>
          <div class="cal-col">BENCH SET</div>
          <div class="cal-col">SIGNAL OPEN</div>
          <div class="cal-col">SIGNAL CLOSED</div>
          <div class="cal-col">SUPPLY</div>
          <div class="cal-col">FAIL ACTION</div>
        </div>
        <div class="panel-row">
          <div class="cal-col-label">As Found</div>
          <div class="cal-col">${esc(r.ratedTravel)}</div>
          <div class="cal-col">${esc(r.benchSetAsFound)}</div>
          <div class="cal-col">${esc(r.openSignalAsFound)}</div>
          <div class="cal-col">${esc(r.closedSignalAsFound)}</div>
          <div class="cal-col">${esc(r.supplyPressureAsFound)}</div>
          <div class="cal-col">${esc(r.failActionAsFound)}</div>
        </div>
        <div class="panel-row">
          <div class="cal-col-label">As Left</div>
          <div class="cal-col">${esc(r.ratedTravel)}</div>
          <div class="cal-col yellow">${esc(r.benchSetAsLeft)}</div>
          <div class="cal-col">${esc(r.openSignalAsLeft)}</div>
          <div class="cal-col">${esc(r.closedSignalAsLeft)}</div>
          <div class="cal-col yellow">${esc(r.supplyPressureAsLeft)}</div>
          <div class="cal-col">${esc(r.failActionAsLeft)}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title panel-title-split">
          <span>POST VALVE REPAIR TEST DATA</span>
          <span>Test Witness ${esc(r.testWitness)}</span>
        </div>
        <div class="panel-row-quad">
          <div class="quad-label">Test Date / Technician</div><div class="quad-value">${esc(r.testDate)} ${esc(r.testTechnician)}</div>
          <div class="quad-label">Gas Test Pressure / Pass-Fail</div><div class="quad-value">${esc(r.gasTestPressure)} / ${esc(r.gasTestResult)}</div>
        </div>
        <div class="panel-row-quad">
          <div class="quad-label">Diagnostics Completed AF / AL</div><div class="quad-value">AF ${r.diagnosticsCompletedAsFound ? "Yes" : "No"} AL ${r.diagnosticsCompletedAsLeft ? "Yes" : "No"}</div>
          <div class="quad-label">Seat Leak Class / Test Pressure</div><div class="quad-value">${esc(r.seatLeakClass)} ${esc(r.seatLeakTestPressure)}</div>
        </div>
        <div class="panel-row-quad">
          <div class="quad-label">Stroked From Control Room</div><div class="quad-value">${r.strokedFromControlRoom ? "Yes" : "-"}</div>
          <div class="quad-label">Allowable / Actual Leakage</div><div class="quad-value">${esc(r.allowableLeakage)} ${esc(r.actualLeakage)}</div>
        </div>
        <div class="panel-row-quad">
          <div class="quad-label">Body/Bonnet / Packing Torque</div><div class="quad-value">${esc(r.bodyBonnetTorque)} / ${esc(r.packingTorque)}</div>
          <div class="quad-label">Hydro Test Pressure / Duration</div><div class="quad-value">${esc(r.hydroTestPressure)} ${esc(r.hydroTestDuration)}</div>
        </div>
      </div>

      <div class="construction-columns">
        <div class="construction-column construction-column-left">
          <div class="panel">
            <div class="panel-title">NOTES</div>
            <div class="panel-body">${esc(r.notes)}</div>
          </div>
        </div>
        <div class="construction-column construction-column-right">
          <div class="panel">
            <div class="panel-title">RECOMMENDATIONS</div>
            <div class="panel-body">${esc(r.recommendations)}</div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-row"><div class="panel-label">Repair Scope Completed</div><div class="panel-value">${r.repairScopeCompleted ? esc(r.scopeOfWork) : "-"}</div></div>
        <div class="panel-row"><div class="panel-label">Future Recommendations</div><div class="panel-value">${esc(r.futureRecommendations)}</div></div>
      </div>
      ${footerBand(1, 0)}
    </section>
  `;
}

function findingsPage(r: RepairReport, findings: RepairFinding[]) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    rows: findings.filter((f) => f.componentCategory === cat),
  })).filter((g) => g.rows.length > 0);

  const rows = grouped
    .map(
      (g) => `
      <div class="find-category">${esc(g.cat)}</div>
      ${g.rows
        .map(
          (f) => `
        <div class="panel-row find-row">
          <div class="find-col find-col-component">${esc(f.componentName)}</div>
          <div class="find-col">${esc(f.conditionFound)}</div>
          <div class="find-col">${esc(f.recommendedAction)}</div>
          <div class="find-col find-col-comments">${esc(f.comments || f.asLeftAction)}</div>
        </div>`,
        )
        .join("")}
    `,
    )
    .join("");

  return `
    <section class="sheet">
      ${headerBand(r)}
      <h2 class="block-title">FINDINGS AND CORRECTIVE ACTIONS</h2>
      <div class="panel">
        <div class="panel-row find-header">
          <div class="find-col find-col-component">Component</div>
          <div class="find-col">Found</div>
          <div class="find-col">Recommended Action</div>
          <div class="find-col find-col-comments">Comments</div>
        </div>
        ${rows}
      </div>
      <p class="final-note">Recommended actions have been completed unless otherwise noted in the comments</p>
      ${footerBand(2, 0)}
    </section>
  `;
}

function photoPages(r: RepairReport, photos: RepairPhoto[]) {
  const pages: string[] = [];
  for (const category of PHOTO_CATEGORIES) {
    const items = photos
      .filter((p) => p.photoCategory === category)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (items.length === 0) continue;
    for (let i = 0; i < items.length; i += 4) {
      const chunk = items.slice(i, i + 4);
      pages.push(`
        <section class="sheet">
          ${headerBand(r)}
          <h2 class="block-title">${esc(category).toUpperCase()} PHOTOS</h2>
          <div class="photo-grid">
            ${chunk
              .map(
                (p) => `
              <div class="photo-cell">
                <img src="${p.photo}" onerror="this.outerHTML='<div class=\\'broken\\'>Image unavailable</div>'" />
                <div class="caption">${esc(p.caption)}</div>
              </div>`,
              )
              .join("")}
          </div>
          ${footerBand(0, 0)}
        </section>
      `);
    }
  }
  return pages;
}

const STYLES = `
  @page { size: letter; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .sheet { page-break-after: always; padding-bottom: 10px; }
  .sheet:last-child { page-break-after: auto; }
  .header-logo { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 150px; }
  .logo-img { height: 34px; width: auto; }
  .tagline { color: #555; font-size: 8px; }
  .info-grid { border-collapse: collapse; width: 100%; font-size: 9px; margin-bottom: 8px; }
  .info-grid td { border: 1px solid #999; padding: 3px 6px; text-align: left; vertical-align: middle; }
  .info-grid .label { background: #E6EEF7; font-weight: bold; width: 14%; }
  .info-grid .value { width: 19.6%; }
  .title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .title { flex: 1; text-align: center; color: #111; margin: 0; font-size: 22px; font-weight: bold; }
  .emerson-tag { font-size: 9px; color: #555; white-space: nowrap; }
  .label { background: #E6EEF7; font-weight: bold; text-align: left; }
  .value { background: #fff; }
  .yellow { background: #FFF7C2 !important; }
  .inline-pill { display: inline-block; padding: 1px 8px; border-radius: 3px; font-weight: bold; color: #111; }

  /* Construction: two separate side-by-side blocks (As Found / As Left), */
  /* built from flex divs (not tables) — html2canvas mis-sizes table */
  /* colgroup/rowspan-based column widths, so this avoids table layout. */
  .construction-columns { display: flex; width: 100%; margin-bottom: 8px; box-sizing: border-box; }
  .construction-column { width: 50%; box-sizing: border-box; }
  .construction-column-left { padding-right: 5px; }
  .construction-column-right { padding-left: 5px; }

  .construction { width: 100%; box-sizing: border-box; border: 1px solid #999; font-size: 9px; }
  .construction-title {
    background: #154A8A; color: white; font-weight: bold; text-align: center;
    padding: 5px 6px; box-sizing: border-box;
  }
  .construction-amber .construction-title { background: #B45309; }
  .construction-emerald .construction-title { background: #047857; }

  .constr-group { display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid #999; }
  .constr-group:first-child { border-top: none; }
  .constr-group-label {
    width: 16%; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
    text-align: center; font-weight: bold; padding: 4px; border-right: 1px solid #999;
    background: #DCE3EA;
  }
  .construction-amber .constr-group-label { background: #FDE9CC; }
  .construction-emerald .constr-group-label { background: #D3F0E4; }

  .constr-group-rows { width: 84%; box-sizing: border-box; display: flex; flex-direction: column; }
  .constr-row { display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid #999; }
  .constr-row:first-child { border-top: none; }
  .constr-label {
    width: 34%; box-sizing: border-box; font-weight: bold; background: #EEF2F6;
    padding: 6px 8px; border-right: 1px solid #999; display: flex; align-items: center;
  }
  .constr-value {
    width: 66%; box-sizing: border-box; padding: 6px 8px; background: #fff;
    display: flex; align-items: center; text-align: left;
  }
  .stripe-b .constr-label { background: #E3E9EF; }
  .stripe-b .constr-value { background: #F2F4F6; }
  .construction-amber .stripe-a .constr-value { background: #FFFBF3; }
  .construction-amber .stripe-b .constr-value { background: #FEF3E0; }
  .construction-emerald .stripe-a .constr-value { background: #F3FBF7; }
  .construction-emerald .stripe-b .constr-value { background: #E6F6EE; }

  /* Generic bordered panel used for service info, calibration, test data, */
  /* notes/recommendations and findings — div/flex based for the same */
  /* html2canvas reason as construction above (no tables, no colspan). */
  .panel { width: 100%; box-sizing: border-box; border: 1px solid #999; font-size: 9px; margin-bottom: 8px; }
  .panel-title {
    background: #154A8A; color: white; font-weight: bold; text-align: center;
    padding: 5px 8px; box-sizing: border-box;
  }
  .panel-title-split { display: flex; justify-content: space-between; align-items: center; text-align: left; }
  .panel-body { padding: 8px; background: #fff; min-height: 50px; }
  .panel-row { display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid #999; }
  .panel-row:first-child { border-top: none; }
  .panel-label {
    width: 30%; box-sizing: border-box; font-weight: bold; background: #E6EEF7;
    padding: 6px 8px; border-right: 1px solid #999; display: flex; align-items: center;
  }
  .panel-value {
    width: 70%; box-sizing: border-box; padding: 6px 8px; background: #fff;
    display: flex; align-items: center; text-align: left;
  }

  /* Calibration: label column + 6 equal-width data columns */
  .cal-col-label, .cal-col {
    box-sizing: border-box; padding: 5px 4px; text-align: center; border-right: 1px solid #999;
  }
  .cal-col-label { width: 12%; font-weight: bold; background: #fff; }
  .cal-col { flex: 1; background: #fff; }
  .cal-col:last-child { border-right: none; }
  .cal-header .cal-col, .cal-header .cal-col-label { font-weight: bold; border-bottom: 2px solid #154A8A; }

  /* Test data: two label/value pairs per row */
  .panel-row-quad { display: flex; width: 100%; box-sizing: border-box; border-top: 1px solid #999; }
  .panel-row-quad:first-child { border-top: none; }
  .quad-label {
    width: 28%; box-sizing: border-box; font-weight: bold; background: #E6EEF7;
    padding: 6px 8px; border-right: 1px solid #999; display: flex; align-items: center;
  }
  .quad-value {
    width: 22%; box-sizing: border-box; padding: 6px 8px; background: #fff;
    border-right: 1px solid #999; display: flex; align-items: center; text-align: left;
  }
  .quad-value:last-child { border-right: none; }

  /* Findings: component / found / recommended action / comments */
  .find-col { box-sizing: border-box; padding: 5px 6px; border-right: 1px solid #999; font-size: 9px; text-align: center; }
  .find-col:last-child { border-right: none; }
  .find-col-component { width: 20%; font-weight: bold; background: #E6EEF7; text-align: left; }
  .find-col-comments { width: 45%; background: #D6E4F2; text-align: left; }
  .find-col:not(.find-col-component):not(.find-col-comments) { width: 17.5%; }
  .find-header .find-col { font-weight: bold; background: #fff; border-bottom: 2px solid #154A8A; }
  .find-category { background: #154A8A; color: white; font-weight: bold; padding: 4px 8px; box-sizing: border-box; }

  .block-title { text-align: center; color: #154A8A; font-size: 13px; margin: 10px 0; }
  .final-note { text-align: center; font-style: italic; margin-top: 10px; }
  .footer-band { display: flex; justify-content: space-between; font-size: 8px; color: #555; border-top: 1px solid #ccc; margin-top: 10px; padding-top: 4px; }
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .photo-cell img { width: 100%; height: 220px; object-fit: contain; border: 1px solid #999; }
  .photo-cell .caption { text-align: center; font-size: 9px; margin-top: 4px; }
  .photo-cell .broken { width: 100%; height: 220px; border: 1px solid #999; display:flex; align-items:center; justify-content:center; color:#999; }
`;

const PAGE_WIDTH_IN = 8.5;

async function waitForImages(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

async function renderSectionsToPdfBlob(sections: string[]): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.width = "816px"; // 8.5in at 96dpi
  container.style.padding = "38px"; // ~0.4in margin
  container.style.background = "#fff";
  document.body.appendChild(container);

  const pdf = new jsPDF({ unit: "in", format: "letter" });

  try {
    for (let i = 0; i < sections.length; i++) {
      container.innerHTML = sections[i];
      await waitForImages(container);
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const heightIn = (canvas.height / canvas.width) * PAGE_WIDTH_IN;
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, PAGE_WIDTH_IN, heightIn);
    }
  } finally {
    document.body.removeChild(container);
    document.head.removeChild(styleEl);
  }

  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function buildReportSections(reportId: string, blankAsLeft: boolean) {
  const report = await db.reports.get(reportId);
  if (!report) throw new Error("Report not found");
  const findings = await db.findings
    .where("repairReportId")
    .equals(reportId)
    .toArray();
  let photos = await db.photos
    .where("repairReportId")
    .equals(reportId)
    .toArray();

  let r = report;
  let f = findings;
  if (blankAsLeft) {
    r = {
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
    f = findings.map((finding) => ({ ...finding, asLeftAction: "" }));
    photos = photos.filter(
      (p) =>
        p.photoCategory === "As Found Assembly" ||
        p.photoCategory === "As Found Trim" ||
        p.photoCategory === "Nameplate / Tag" ||
        p.photoCategory === "Damage Detail",
    );
  }

  const sections = [page1(r), findingsPage(r, f), ...photoPages(r, photos)];
  return { sections, reportNumber: r.reportNumber };
}

export async function exportRepairPdf(reportId: string) {
  const { sections, reportNumber } = await buildReportSections(reportId, false);
  const blob = await renderSectionsToPdfBlob(sections);
  downloadBlob(blob, `${reportNumber}.pdf`);
}

export async function exportAsFoundPdf(reportId: string) {
  const { sections, reportNumber } = await buildReportSections(reportId, true);
  const blob = await renderSectionsToPdfBlob(sections);
  downloadBlob(blob, `${reportNumber}-as-found.pdf`);
}

export async function exportRepairPdfMulti(reportIds: string[]) {
  const all: string[] = [];
  for (const id of reportIds) {
    const { sections } = await buildReportSections(id, false);
    all.push(...sections);
  }
  const blob = await renderSectionsToPdfBlob(all);
  downloadBlob(blob, `repair-reports-${Date.now()}.pdf`);
}
