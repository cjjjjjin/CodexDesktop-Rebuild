#!/usr/bin/env node
/**
 * Post-build patch: Use smooth scaling for Codex avatar sprites.
 *
 * The avatar sprite sheet is intentionally rendered as CSS background-image.
 * Upstream forces pixel-preserving scaling via image-rendering:pixelated;
 * this patch restores the browser/Electron default smoothing behavior.
 *
 * Usage:
 *   node scripts/patch-avatar-smoothing.js [platform]   # Apply patch
 *   node scripts/patch-avatar-smoothing.js --check      # Dry-run
 */
const fs = require("fs");
const { locateBundles, relPath } = require("./patch-util");

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const platform = args.find((a) => ["mac-arm64", "mac-x64", "win"].includes(a));

  const bundles = locateBundles({
    dir: "assets",
    pattern: /^codex-avatar-.*\.css$/,
    platform,
  });

  if (bundles.length === 0) {
    console.error("[x] No codex-avatar CSS bundle found");
    process.exit(1);
  }

  let changed = 0;

  for (const bundle of bundles) {
    const source = fs.readFileSync(bundle.path, "utf-8");
    const patched = source.replace(/image-rendering:pixelated/g, "image-rendering:auto");

    console.log(`  [${bundle.platform}] ${relPath(bundle.path)}`);

    if (patched === source) {
      if (source.includes("image-rendering:auto")) {
        console.log("    [ok] Avatar smoothing already enabled");
      } else {
        console.log("    [skip] No pixelated avatar rendering rule found");
      }
      continue;
    }

    changed++;
    if (isCheck) {
      console.log("    [?] image-rendering:pixelated -> image-rendering:auto");
      continue;
    }

    fs.writeFileSync(bundle.path, patched, "utf-8");
    console.log("    [ok] Avatar smoothing enabled");
  }

  if (isCheck && changed > 0) {
    console.log(`  [?] ${changed} file(s) would be patched`);
  }
}

main();
