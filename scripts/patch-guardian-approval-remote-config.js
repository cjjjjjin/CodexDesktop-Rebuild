#!/usr/bin/env node
/**
 * patch-guardian-approval-remote-config.js - Propagate guardian approval support
 * to app-server hosts configured by Codex Desktop.
 *
 * Remote app-servers receive a small generated config from the desktop process.
 * Upstream syncs Browser/Computer Use settings there, but not the guardian
 * approval feature gate. When a remote thread is started with
 * approvalsReviewer=guardian_subagent, a remote app-server without this feature
 * enabled can fall back to user approval prompts.
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");
const {
  captureWarnings,
  createPatchReport,
  patchStatusFromChange,
  recordPatch,
  writePatchReport,
} = require("./patch-report");

const PATCH_ID = "guardian-approval-remote-config";
const FEATURE_KEY = "features.guardian_approval";

function applyGuardianApprovalRemoteConfigPatch(source) {
  if (source.includes(`"${FEATURE_KEY}":!0`) && source.includes(`\`${FEATURE_KEY}\``)) {
    return source;
  }

  let patched = source;
  let changed = false;

  const configReplacement = '"features.js_repl":!0,"features.guardian_approval":!0';
  if (patched.includes(configReplacement)) {
    // Already upgraded.
  } else if (patched.includes('"features.js_repl":!0')) {
    patched = patched.replace('"features.js_repl":!0', configReplacement);
    changed = true;
  } else {
    console.warn("WARN: Could not find generated remote config defaults - skipping guardian approval feature default");
  }

  const syncNeedle = "var si=[`features.js_repl`,`mcp_servers.${e.jn}`]";
  const syncReplacement = "var si=[`features.js_repl`,`features.guardian_approval`,`mcp_servers.${e.jn}`]";
  if (patched.includes(syncReplacement)) {
    // Already upgraded.
  } else if (patched.includes(syncNeedle)) {
    patched = patched.replace(syncNeedle, syncReplacement);
    changed = true;
  } else {
    const syncKeyListRegex =
      /var ([A-Za-z_$][\w$]*)=\[`features\.js_repl`,`mcp_servers\.\$\{([A-Za-z_$][\w$]*)\.jn\}`\]/u;
    const match = patched.match(syncKeyListRegex);
    if (match != null) {
      patched = patched.replace(
        match[0],
        `var ${match[1]}=[\`features.js_repl\`,\`features.guardian_approval\`,\`mcp_servers.\${${match[2]}.jn}\`]`,
      );
      changed = true;
    } else {
      console.warn("WARN: Could not find remote config sync key list - skipping guardian approval sync key");
    }
  }

  return changed ? patched : source;
}

function parseArgs(argv) {
  const platform = argv.find((arg) => ["mac-arm64", "mac-x64", "win", "unix"].includes(arg));
  const check = argv.includes("--check");
  const reportIndex = argv.indexOf("--report-json");
  const reportJson = reportIndex >= 0 ? argv[reportIndex + 1] : null;
  if (reportIndex >= 0 && !reportJson) {
    throw new Error("Usage: patch-guardian-approval-remote-config.js [platform] [--check] [--report-json path]");
  }
  return { check, platform, reportJson };
}

function patchBundles({ check = false, platform = null, report = null } = {}) {
  if (platform === "unix") {
    console.log("  [skip] guardian approval remote config patch is only applied to packaged desktop bundles");
    return 0;
  }

  const bundles = locateBundles({
    dir: "build",
    pattern: /^main(-[^.]+)?\.js$/,
    platform: platform ?? undefined,
  });

  if (bundles.length === 0) {
    recordPatch(report, PATCH_ID, "failed-required", "No main bundle found");
    console.error("[x] No main bundle found");
    return 1;
  }

  let failures = 0;
  for (const bundle of bundles) {
    const source = fs.readFileSync(bundle.path, "utf8");
    const { value: patched, warnings } = captureWarnings(() =>
      applyGuardianApprovalRemoteConfigPatch(source),
    );
    const changed = patched !== source;
    const status = patchStatusFromChange(changed, warnings);
    recordPatch(report, PATCH_ID, status, warnings[0] ?? null, {
      file: relPath(bundle.path),
      platform: bundle.platform,
    });

    if (status === "failed-required") failures += 1;

    if (check) {
      console.log(`  [${bundle.platform}] ${relPath(bundle.path)}: ${status}`);
      continue;
    }

    if (changed) {
      fs.writeFileSync(bundle.path, patched, "utf8");
      console.log(`  [ok] ${relPath(bundle.path)}: enabled guardian approval remote config sync`);
    } else {
      console.log(`  [${status === "already-applied" ? "ok" : "!"}] ${relPath(bundle.path)}: ${status}`);
    }
  }

  return failures === 0 ? 0 : 1;
}

function main() {
  try {
    const { check, platform, reportJson } = parseArgs(process.argv.slice(2));
    const report = reportJson == null ? null : createPatchReport();
    const exitCode = patchBundles({ check, platform, report });
    writePatchReport(reportJson, report);
    process.exit(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  FEATURE_KEY,
  PATCH_ID,
  applyGuardianApprovalRemoteConfigPatch,
  patchBundles,
};
