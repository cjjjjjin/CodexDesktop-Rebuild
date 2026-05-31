#!/usr/bin/env node
/**
 * patch-win-ssh-remote.js - Make native Windows SSH targets fail early with a
 * clear diagnostic.
 *
 * Codex Desktop's SSH transport bootstraps a POSIX shell and starts the remote
 * app server with a Unix socket. Native Windows OpenSSH hosts can fail either
 * in the PowerShell bootstrap path or later when the Unix socket transport is
 * unavailable. This patch adds a raw `cmd.exe /c ver` probe before the POSIX
 * bootstrap and reports the unsupported target explicitly.
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

const PATCH_ID = "win-native-windows-ssh-target-guard";
const MARKER = "native-windows-ssh-not-supported";

function windowsSshGuardSource() {
  return [
    "let codexWindowsSshProbeResult;",
    "try{",
    "let codexWindowsSshProbeProcess=t.Tn({args:[`ssh`,...wg(),...Eg(this.options.sshConnection),`cmd.exe /c ver`],forceSpawnOutsideWsl:!0});",
    "codexWindowsSshProbeResult=await Pg({process:codexWindowsSshProbeProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows probe timed out`});",
    "let codexWindowsSshProbeOutput=`${codexWindowsSshProbeProcess.getStdout().toString(`utf8`)}\\n${codexWindowsSshProbeResult.stderr??``}`;",
    "if(codexWindowsSshProbeResult.code===0&&/Microsoft Windows/i.test(codexWindowsSshProbeOutput))throw new t.wn({failureReason:`native-windows-ssh-not-supported`,message:`Codex Desktop SSH remote connections do not support native Windows SSH hosts yet. Use WSL or a Linux/macOS SSH host.`,stage:`remote_platform_probe`})",
    "}catch(e){if(e instanceof t.wn)throw e;this.logger.info(`ssh_websocket_v0.remote_windows_probe_skipped`,{safe:{},sensitive:{error:e,sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port}})}",
  ].join("");
}

function applyWindowsSshRemoteGuardPatch(source) {
  if (source.includes(MARKER)) return source;

  const startNeedle = "async startRemoteAppServer(n){let r=eg(),i;";
  if (source.includes(startNeedle)) {
    return source.replace(startNeedle, `${startNeedle}${windowsSshGuardSource()}`);
  }

  const genericStartRegex =
    /async startRemoteAppServer\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=eg\(\),([A-Za-z_$][\w$]*);/u;
  const match = source.match(genericStartRegex);
  if (match == null) {
    console.warn("WARN: Could not find SSH startRemoteAppServer shape - skipping Windows SSH remote guard");
    return source;
  }

  return source.replace(match[0], `${match[0]}${windowsSshGuardSource()}`);
}

function parseArgs(argv) {
  const platform = argv.find((arg) => ["mac-arm64", "mac-x64", "win", "unix"].includes(arg));
  const check = argv.includes("--check");
  const reportIndex = argv.indexOf("--report-json");
  const reportJson = reportIndex >= 0 ? argv[reportIndex + 1] : null;
  if (reportIndex >= 0 && !reportJson) {
    throw new Error("Usage: patch-win-ssh-remote.js [platform] [--check] [--report-json path]");
  }
  return { check, platform, reportJson };
}

function patchBundles({ check = false, platform = null, report = null } = {}) {
  if (platform === "unix" || platform === "mac-arm64" || platform === "mac-x64") {
    console.log("  [skip] Windows SSH remote guard is only applied to the Windows bundle");
    return 0;
  }

  const bundles = locateBundles({
    dir: "build",
    pattern: /^main(-[^.]+)?\.js$/,
    platform: platform ?? "win",
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
      applyWindowsSshRemoteGuardPatch(source),
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
      console.log(`  [ok] ${relPath(bundle.path)}: injected Windows SSH target guard`);
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
  MARKER,
  PATCH_ID,
  applyWindowsSshRemoteGuardPatch,
  patchBundles,
};
