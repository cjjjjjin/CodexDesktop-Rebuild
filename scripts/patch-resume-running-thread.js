#!/usr/bin/env node
/**
 * patch-resume-running-thread.js - Keep "cannot resume running thread" visible
 * in the local conversation view.
 *
 * Recent desktop bundles can throw this from maybe-resume-conversation when a
 * selected thread is already running. We previously short-circuited that
 * specific error, but Windows SSH resume failures need the original toast/log
 * path so broken or stale running-thread state can be diagnosed.
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
  const hiddenNeedle =
    "catch(r){if(/cannot resume running thread/i.test(N(r))){u.current===e&&(f.current=!1);return}if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;";
  const exposedReplacement =
    "catch(r){if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;";

  if (source.includes(hiddenNeedle)) {
    return source.replace(hiddenNeedle, exposedReplacement);
  }

  const hiddenGenericCatch =
    /catch\((\w+)\)\{if\(\/cannot resume running thread\/i\.test\(N\(\1\)\)\)\{(\w+)\.current===(\w+)&&\(f\.current=!1\);return\}if\(Qt\.error\(`Failed to resume conversation`,\{safe:\{\},sensitive:\{conversationId:\3,error:\1\}\}\),\2\.current!==\3\)return;/u;
  const match = source.match(hiddenGenericCatch);
  if (match == null) {
    return source;
  }

  const [full, errorVar, activeResumeRef, conversationVar] = match;
  return source.replace(
    full,
    `catch(${errorVar}){if(Qt.error(\`Failed to resume conversation\`,{safe:{},sensitive:{conversationId:${conversationVar},error:${errorVar}}}),${activeResumeRef}.current!==${conversationVar})return;`,
  );
}

function applyAppMainPatch(source) {
  let patched = source;
  let changed = false;

  const heartbeatHidden =
    "function Pk(e){let t=Ce(e).toLowerCase();return t.includes(`no rollout found for thread id`)||t.includes(`cannot resume running thread`)}";
  const heartbeatExposed =
    "function Pk(e){return Ce(e).toLowerCase().includes(`no rollout found for thread id`)}";
  if (patched.includes(heartbeatHidden)) {
    patched = patched.replace(heartbeatHidden, heartbeatExposed);
    changed = true;
  } else {
    const heartbeatRegex =
      /function (\w+)\((\w+)\)\{let (\w+)=(\w+)\(\2\)\.toLowerCase\(\);return \3\.includes\(`no rollout found for thread id`\)\|\|\3\.includes\(`cannot resume running thread`\)\}/u;
    const match = patched.match(heartbeatRegex);
    if (match != null) {
      patched = patched.replace(
        match[0],
        `function ${match[1]}(${match[2]}){return ${match[4]}(${match[2]}).toLowerCase().includes(\`no rollout found for thread id\`)}`,
      );
      changed = true;
    }
  }

  const handlerHidden =
    '"maybe-resume-conversation":MR(async(e,t)=>{try{await Rt(e,t)}catch(n){if(Ce(n).toLowerCase().includes(`cannot resume running thread`))return;throw n}})';
  const handlerExposed =
    '"maybe-resume-conversation":MR(async(e,t)=>{await Rt(e,t)})';
  if (patched.includes(handlerHidden)) {
    patched = patched.replace(handlerHidden, handlerExposed);
    changed = true;
  } else {
    const handlerRegex =
      /(["`])maybe-resume-conversation\1:(\w+)\(async\((\w+),(\w+)\)=>\{try\{await (\w+)\(\3,\4\)\}catch\((\w+)\)\{if\((\w+)\(\6\)\.toLowerCase\(\)\.includes\(`cannot resume running thread`\)\)return;throw \6\}\}\)/u;
    const match = patched.match(handlerRegex);
    if (match != null) {
      const [full, quote, wrapper, managerVar, paramsVar, resumeFn] = match;
      patched = patched.replace(
        full,
        `${quote}maybe-resume-conversation${quote}:${wrapper}(async(${managerVar},${paramsVar})=>{await ${resumeFn}(${managerVar},${paramsVar})})`,
      );
      changed = true;
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
