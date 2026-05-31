# Onboarding

This repository repackages the OpenAI Codex Desktop Electron app for macOS,
Windows, and Linux. The checked-in code is mostly orchestration: it downloads
upstream app bundles, extracts `app.asar`, applies local patches, swaps in
platform Codex CLI binaries, and emits distributable artifacts.

## Quick Start

```bash
npm install
npm run check-update
npm run sync
npm run patch
npm run build:win-x64
```

Use the platform-specific build script for the machine or artifact you are
working on. The default `npm run build` targets `mac-arm64`, which is not useful
on Windows.

## Required Tools

- Node.js 24 is used by CI.
- npm, using the committed `package-lock.json`.
- 7-Zip with a `7zz` or `7z` command for archive extraction.
- macOS builds require macOS tools such as `ditto`, `codesign`, `hdiutil`, and
  `plutil`.
- Linux packaging requires `rpm`, `fakeroot`, `dpkg`, and `7zip`.
- Network access is required for upstream appcast/MS Store downloads and, in
  some paths, `npm view` or `npm pack` for `@cometix/codex`.

## Repository Layout

- `package.json` defines the development, sync, patch, and build commands.
- `forge.config.js` configures Electron Forge packaging and copies prepared
  upstream resources into the packaged app.
- `scripts/sync-upstream.js` downloads current upstream macOS and Windows app
  bundles, extracts resources, and writes generated platform trees under `src/`.
- `scripts/patch-all.js` runs the local patch scripts in sequence.
- `scripts/prepare-src.js` repacks ASAR content and prepares the `src/` layout
  expected by Electron Forge, especially for Linux builds.
- `scripts/build-from-upstream.js` builds macOS and Windows artifacts directly
  from upstream extracted bundles.
- `scripts/check-update.js` checks upstream versions from Sparkle appcasts and
  the Microsoft Store.
- `resources/` contains checked-in app icons and notification sound assets.
- `.github/workflows/` contains manual build and scheduled upstream sync/release
  workflows.

`src/`, `out/`, `node_modules/`, and `scripts/.versions.json` are generated or
local-only and intentionally ignored by git.

## Generated Source Model

There is no durable application source tree in a clean checkout. Running
`npm run sync` creates `src/{platform}/` directories from upstream resources:

- `src/mac-arm64/_asar/`
- `src/mac-x64/_asar/`
- `src/win/_asar/`
- `src/{platform}/app.asar.unpacked/`
- upstream resource binaries, plugins, native files, and related assets

Patch scripts modify files inside these extracted `_asar/` trees. If `src/` is
missing, run `npm run sync` or a targeted sync command before patching or
starting development.

## Common Workflows

### Check For Upstream Updates

```bash
npm run check-update
node scripts/check-update.js --json --force
node scripts/check-update.js --save
```

`check-update.js` compares upstream macOS appcasts and the Microsoft Store
package against `scripts/.versions.json` when present.

### Sync Upstream Bundles

```bash
npm run sync
node scripts/sync-upstream.js --force
node scripts/sync-upstream.js --skip-mac
node scripts/sync-upstream.js --skip-win
```

Sync downloads archives into a temp cache, extracts `app.asar`, copies
`app.asar.unpacked`, and assembles generated platform directories under `src/`.

### Apply Local Patches

```bash
npm run patch
npm run patch:mac
npm run patch:win
node scripts/patch-all.js --check
```

Patch order is defined in `scripts/patch-all.js`. Individual patch scripts use
`scripts/patch-util.js` to locate bundles in `src/{platform}/_asar/`. When adding
a patch, make it idempotent and fail loudly if the expected upstream pattern is
not found.

Current patch sequence:

- `patch-i18n.js`
- `patch-copyright.js`
- `patch-devtools.js`
- `patch-fast-mode.js`
- `patch-plugin-auth.js`
- `patch-updater.js`
- `patch-archive-delete.js`

Other patch scripts exist but are not currently included in `patch-all.js`; add
them there only when they should run as part of the standard patch pipeline.

### Run The App For Development

```bash
npm run dev
```

`scripts/start-dev.js` detects the current platform and architecture, resolves a
Codex CLI binary from generated `src/`, `node_modules/@cometix`, or
`resources/bin`, and launches Electron with environment variables pointing at
the generated resource tree.

Development startup expects synced upstream resources. On a clean checkout, run
`npm run sync` and `npm run patch` first.

### Build Artifacts

```bash
npm run build:mac-arm64
npm run build:mac-x64
npm run build:win-x64
npm run build:linux-x64
npm run build:linux-arm64
npm run build:all
```

macOS and Windows builds use `scripts/build-from-upstream.js` and require
previously synced and patched platform `_asar/` directories. Linux builds use
the macOS extracted ASAR as the base, rebuild native modules, sync native
modules, and then run Electron Forge.

Artifacts are written under `out/`.

## Build Pipeline

The standard pipeline is:

1. Install dependencies with `npm ci` or `npm install`.
2. Sync upstream bundles with `scripts/sync-upstream.js`.
3. Apply patches with `scripts/patch-all.js`.
4. Prepare or repack source resources.
5. Package with direct upstream build scripts or Electron Forge.
6. Upload artifacts from `out/`.

Manual GitHub Actions builds are defined in `.github/workflows/build.yml`.
Scheduled upstream update builds and draft release creation are defined in
`.github/workflows/sync.yml`.

## CI Notes

- CI uses Node.js 24.
- Build jobs regenerate `src/` on each runner because `src/` is gitignored.
- The scheduled sync workflow checks upstream versions daily at 08:00 UTC.
- Release creation tags `v{version}` and opens a draft GitHub release after
  successful artifact builds.

## Versioning

Root `package.json` mirrors the upstream app version and build metadata used by
the current repack. `scripts/prepare-src.js` can update root package metadata
from extracted upstream `package.json`. `scripts/check-update.js --save` updates
the local version cache only; that cache is not committed.

## Practical Tips

- Start by checking whether `src/` exists. If not, generate it before debugging
  patches or development startup.
- Keep generated outputs out of commits: `src/`, `out/`, and `node_modules/`
  should remain untracked.
- Prefer changing patch scripts over editing generated `src/` files directly.
  Direct edits disappear after the next sync.
- Validate patch changes with a targeted `node scripts/patch-all.js <platform>`
  run after syncing.
- When upstream bundles change, expect hashed JavaScript asset names and minified
  code patterns to change. Patch scripts should search structurally enough to
  survive reasonable upstream churn.
