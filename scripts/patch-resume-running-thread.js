#!/usr/bin/env node
/**
 * patch-resume-running-thread.js - Treat "cannot resume running thread" as
 * a benign session-selection race in the local conversation view.
 *
 * Recent desktop bundles can throw this from maybe-resume-conversation when a
 * selected thread is already running. The stock renderer shows a resume error
 * toast and retries every 750ms, which makes a healthy running session look
 * broken. This patch short-circuits that specific error before toast/retry.
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

const PATCH_ID = "resume-running-thread";
const ERROR_RE = "cannot resume running thread";

function applyLocalConversationThreadPatch(source) {
  if (source.includes(ERROR_RE)) return source;

  const needle =
    "catch(r){if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;";
  const replacement =
    "catch(r){if(/cannot resume running thread/i.test(N(r))){u.current===e&&(f.current=!1);return}if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;";

  if (source.includes(needle)) {
    return source.replace(needle, replacement);
  }

  const genericCatch =
    /catch\((\w+)\)\{if\(Qt\.error\(`Failed to resume conversation`,\{safe:\{\},sensitive:\{conversationId:(\w+),error:\1\}\}\),(\w+)\.current!==\2\)return;/u;
  const match = source.match(genericCatch);
  if (match == null) {
    console.warn("WARN: Could not find local conversation resume catch block");
    return source;
  }

  const [full, errorVar, conversationVar, activeResumeRef] = match;
  const guard =
    `catch(${errorVar}){if(/cannot resume running thread/i.test(N(${errorVar}))){${activeResumeRef}.current===${conversationVar}&&(f.current=!1);return}`;
  return source.replace(full, guard + full.slice(`catch(${errorVar}){`.length));
}

function applyAppMainPatch(source) {
  let patched = source;
  let changed = false;

  const heartbeatNeedle =
    "function Pk(e){return Ce(e).toLowerCase().includes(`no rollout found for thread id`)}";
  const heartbeatReplacement =
    "function Pk(e){let t=Ce(e).toLowerCase();return t.includes(`no rollout found for thread id`)||t.includes(`cannot resume running thread`)}";
  if (patched.includes(heartbeatReplacement)) {
    // Already upgraded.
  } else if (patched.includes(heartbeatNeedle)) {
    patched = patched.replace(heartbeatNeedle, heartbeatReplacement);
    changed = true;
  } else {
    const heartbeatRegex =
      /function (\w+)\((\w+)\)\{return (\w+)\(\2\)\.toLowerCase\(\)\.includes\(`no rollout found for thread id`\)\}/u;
    const match = patched.match(heartbeatRegex);
    if (match != null) {
      patched = patched.replace(
        match[0],
        `function ${match[1]}(${match[2]}){let t=${match[3]}(${match[2]}).toLowerCase();return t.includes(\`no rollout found for thread id\`)||t.includes(\`cannot resume running thread\`)}`,
      );
      changed = true;
    } else {
      console.warn("WARN: Could not find heartbeat resume terminal-error predicate");
    }
  }

  const handlerNeedle =
    '"maybe-resume-conversation":MR(async(e,t)=>{await Rt(e,t)})';
  const handlerReplacement =
    '"maybe-resume-conversation":MR(async(e,t)=>{try{await Rt(e,t)}catch(n){if(Ce(n).toLowerCase().includes(`cannot resume running thread`))return;throw n}})';
  if (patched.includes(handlerReplacement)) {
    // Already upgraded.
  } else if (patched.includes(handlerNeedle)) {
    patched = patched.replace(handlerNeedle, handlerReplacement);
    changed = true;
  } else {
    const handlerRegex =
      /(["`])maybe-resume-conversation\1:(\w+)\(async\((\w+),(\w+)\)=>\{await (\w+)\(\3,\4\)\}\)/u;
    const match = patched.match(handlerRegex);
    if (match != null) {
      const [full, quote, wrapper, managerVar, paramsVar, resumeFn] = match;
      patched = patched.replace(
        full,
        `${quote}maybe-resume-conversation${quote}:${wrapper}(async(${managerVar},${paramsVar})=>{try{await ${resumeFn}(${managerVar},${paramsVar})}catch(n){if(Ce(n).toLowerCase().includes(\`cannot resume running thread\`))return;throw n}})`,
      );
      changed = true;
    } else {
      console.warn("WARN: Could not find maybe-resume-conversation command handler");
    }
  }

  return changed ? patched : source;
}

function applyResumeRunningThreadPatch(source) {
  const patchedLocal = applyLocalConversationThreadPatch(source);
  return applyAppMainPatch(patchedLocal);
}

function parseArgs(argv) {
  const platform = argv.find((arg) => ["mac-arm64", "mac-x64", "win", "unix"].includes(arg));
  const check = argv.includes("--check");
  const reportIndex = argv.indexOf("--report-json");
  const reportJson = reportIndex >= 0 ? argv[reportIndex + 1] : null;
  if (reportIndex >= 0 && !reportJson) {
    throw new Error("Usage: patch-resume-running-thread.js [platform] [--check] [--report-json path]");
  }
  return { check, platform, reportJson };
}

function patchBundles({ check = false, platform = null, report = null } = {}) {
  if (platform === "unix") {
    console.log("  [skip] resume running thread patch is only applied to packaged desktop bundles");
    return 0;
  }

  const localBundles = locateBundles({
    dir: "assets",
    pattern: /^local-conversation-thread-.*\.js$/,
    platform: platform ?? undefined,
  });
  const appMainBundles = locateBundles({
    dir: "assets",
    pattern: /^app-main-.*\.js$/,
    platform: platform ?? undefined,
  });
  const bundles = [
    ...localBundles.map((bundle) => ({
      ...bundle,
      apply: applyLocalConversationThreadPatch,
      label: "local conversation resume hook",
    })),
    ...appMainBundles.map((bundle) => ({
      ...bundle,
      apply: applyAppMainPatch,
      label: "app-main resume command handler",
    })),
  ];

  if (bundles.length === 0) {
    recordPatch(report, PATCH_ID, "failed-required", "No webview resume bundles found");
    console.error("[x] No webview resume bundles found");
    return 1;
  }

  let failures = 0;
  for (const bundle of bundles) {
    const source = fs.readFileSync(bundle.path, "utf8");
    const { value: patched, warnings } = captureWarnings(() =>
      bundle.apply(source),
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
      console.log(`  [ok] ${relPath(bundle.path)}: patched ${bundle.label}`);
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
  ERROR_RE,
  PATCH_ID,
  applyAppMainPatch,
  applyLocalConversationThreadPatch,
  applyResumeRunningThreadPatch,
  patchBundles,
};
