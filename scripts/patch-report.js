const fs = require("fs");
const path = require("path");

function createPatchReport() {
  return {
    generatedAt: new Date().toISOString(),
    patches: [],
  };
}

function recordPatch(report, name, status, reason = null, metadata = null) {
  if (report == null) return;

  const entry = { name, status };
  if (reason != null && String(reason).length > 0) entry.reason = String(reason);
  if (metadata != null && typeof metadata === "object") Object.assign(entry, metadata);
  report.patches.push(entry);
}

function captureWarnings(fn) {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.map(String).join(" "));
    originalWarn(...args);
  };
  try {
    return { value: fn(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

function writePatchReport(reportPath, report) {
  if (reportPath == null || report == null) return;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function patchStatusFromChange(changed, warnings) {
  if (changed) return "applied";
  if (warnings.length > 0) return "failed-required";
  return "already-applied";
}

module.exports = {
  captureWarnings,
  createPatchReport,
  patchStatusFromChange,
  recordPatch,
  writePatchReport,
};
