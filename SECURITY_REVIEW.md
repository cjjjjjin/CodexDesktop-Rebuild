# Security Review

Review date: 2026-05-31

## Scope

This review covers the current Electron rebuild/package repository, with emphasis on:

- Electron Forge packaging configuration
- upstream app and binary download flow
- patch scripts that change application trust boundaries
- dependency audit results

The repository appears to rebuild and patch upstream Codex Electron artifacts rather than maintain the full original app source. Because of that, the highest-risk areas are supply-chain validation, signing, runtime hardening, and security gate bypasses.

## Executive Summary

Several current defaults are appropriate for local development or experimental rebuilds, but risky for distributable builds. The most important issues are:

1. Electron security fuses are configured permissively.
2. Plugin authentication, feature availability, and native peer authorization checks are explicitly bypassed.
3. Upstream downloaded artifacts are extracted and repackaged without strong file signature or hash verification.
4. macOS original signatures are removed and replaced with ad-hoc signing.
5. `@cometix/codex` binaries may be fetched dynamically from npm without pinned integrity.

Recommended first step: create a clear split between `dev/experimental` builds and `release` builds. Release builds should fail closed unless signing, artifact verification, and hardened Electron fuses are enabled.

## Findings

### 1. High - Permissive Electron Fuse Settings

Location: `forge.config.js`

The current Forge fuse configuration enables or disables several Electron runtime protections in a permissive way:

- `RunAsNode: true`
- `EnableNodeOptionsEnvironmentVariable: true`
- `EnableNodeCliInspectArguments: true`
- `EnableEmbeddedAsarIntegrityValidation: false`
- `OnlyLoadAppFromAsar: false`

Impact:

These options can allow environment variables, runtime flags, or modified local resources to influence app startup. For a code-assistant desktop app that runs local commands and handles workspace data, this meaningfully increases attack surface.

Recommendation:

For release builds, use hardened settings:

```js
[FuseV1Options.RunAsNode]: false,
[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
[FuseV1Options.EnableNodeCliInspectArguments]: false,
[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
[FuseV1Options.OnlyLoadAppFromAsar]: true,
```

If development builds need the current behavior, gate it behind an explicit build mode such as `CODEX_BUILD_PROFILE=dev`.

### 2. High - Security Gate and Authorization Bypasses

Location: `scripts/patch-plugin-auth.js`

The patch script intentionally changes security-sensitive checks:

- removes plugin auth gating
- forces browser/computer-use availability
- bypasses Statsig feature gates
- enables `features.js_repl`
- bypasses bundled plugin availability filters
- bypasses browser-use native pipe peer authorization

Impact:

These patches weaken trust boundaries around plugins, browser/computer control, JavaScript REPL capabilities, and native peer authorization. If included in a distributed build, users may receive a version with more privileged features enabled than intended by upstream policy or signing identity checks.

Recommendation:

- Remove this script from the default `patch-all.js` flow for release builds.
- Require an explicit unsafe flag for local experimentation, for example `ALLOW_UNSAFE_FEATURE_BYPASS=1`.
- Make release builds fail if this patch has been applied.
- Document exactly which upstream protections are disabled and why.

### 3. High - Downloaded Upstream Artifacts Are Not Strongly Verified

Locations:

- `scripts/sync-upstream.js`
- `scripts/fetch-msstore.js`

The sync flow downloads upstream macOS and Windows artifacts, extracts them, and repackages them. The code uses HTTPS and appcast/MS Store metadata, but does not appear to enforce strong post-download verification such as:

- pinned SHA-256 hashes
- Sparkle signature verification
- Authenticode/MSIX signature verification
- strict digest validation of the downloaded Windows package

Impact:

If an upstream feed, CDN response, local cache, redirect target, or intermediate tool output is compromised, the project may package a modified upstream artifact.

Recommendation:

- Verify every downloaded artifact before extraction.
- Store expected SHA-256 hashes in a reviewed manifest.
- For macOS, validate Sparkle signatures where available.
- For Windows, validate MSIX/AuthentiCode signatures and compare the downloaded file digest to Microsoft metadata.
- Fail closed on missing or mismatched verification.

### 4. Medium - macOS Signature Removal and Ad-Hoc Re-Signing

Location: `scripts/build-from-upstream.js`

The macOS build flow removes the original signature, clears quarantine metadata, then applies ad-hoc signing.

Impact:

Ad-hoc signing is useful for local execution, but it does not provide a strong publisher identity for distributed apps. Removing quarantine metadata also weakens a user-facing platform protection signal.

Recommendation:

- Use Developer ID signing and notarization for distributable builds.
- Keep ad-hoc signing limited to local development artifacts.
- Do not clear quarantine metadata in release packaging scripts.
- Make release builds fail if signing credentials or notarization are missing.

### 5. Medium - Dynamic npm Binary Fallback Without Pinned Integrity

Locations:

- `scripts/prepare-src.js`
- `scripts/build-from-upstream.js`

The build scripts can call `npm view @cometix/codex version` and then `npm pack` a platform-specific package. This fetches the latest package dynamically and uses its binary output.

Impact:

This bypasses lockfile reproducibility and allows the final shipped binary to vary based on npm state at build time.

Recommendation:

- Pin exact `@cometix/codex` package versions.
- Verify npm tarball integrity against a committed manifest.
- Prefer installed lockfile dependencies over dynamic fallback.
- Make dynamic fetching opt-in for local development only.

### 6. Medium - Shell Command Construction Should Be Hardened

Locations:

- `scripts/sync-upstream.js`
- `scripts/build-from-upstream.js`
- `scripts/prepare-src.js`

Several commands are built with string interpolation and passed to `execSync`, including calls to `curl`, `tar`, `7z`, `npx`, `ditto`, `codesign`, and `hdiutil`.

Impact:

Most interpolated values currently come from controlled paths or known metadata, but URL and filename values from upstream metadata can still create quoting and argument-boundary risk over time.

Recommendation:

- Prefer `execFileSync(command, args)` over `execSync(string)`.
- Validate URLs, filenames, and package specs before invoking external tools.
- Reject unexpected protocols, shell metacharacters, and path traversal.

### 7. Low - Known Dependency Vulnerability

Command run:

```bash
npm audit --omit=dev --json
```

Result:

- `brace-expansion`
- Severity: moderate
- Advisory: `GHSA-jxxr-4gwj-5jf2`
- Impact class: denial of service via large numeric ranges
- Fix available: yes

Recommendation:

Run `npm audit fix` or update the parent dependency that brings in the vulnerable `brace-expansion` version. Confirm the lockfile change is minimal.

## Recommended Remediation Plan

### Priority 1 - Release Build Guardrails

- Add a build profile variable, for example `CODEX_BUILD_PROFILE=release`.
- Harden Electron fuses for release builds.
- Block unsafe patch scripts in release mode.
- Fail release builds if signing or notarization is skipped.

### Priority 2 - Artifact Verification

- Add a manifest for upstream artifact URLs, versions, and SHA-256 hashes.
- Verify downloads before extraction.
- Validate Windows MSIX signatures.
- Validate macOS Sparkle signatures or signed app bundles before patching.

### Priority 3 - Supply-Chain Reproducibility

- Remove dynamic `npm view`/`npm pack` fallback from release builds.
- Pin `@cometix/codex` binary package versions and integrity.
- Add CI checks that fail when release artifacts are built from unpinned dependencies.

### Priority 4 - Command Execution Hardening

- Replace shell-string `execSync` calls with `execFileSync`.
- Add validation helpers for URLs, package names, filenames, and destination paths.
- Keep extraction directories under a known temp root and reject traversal entries.

### Priority 5 - Dependency Cleanup

- Apply the available `brace-expansion` fix.
- Re-run `npm audit --omit=dev`.
- Track audit output in CI.

## Release Readiness Checklist

- [ ] Release build uses hardened Electron fuses.
- [ ] Unsafe feature/auth bypass patches are disabled in release mode.
- [ ] Downloaded upstream artifacts are verified before extraction.
- [ ] macOS builds use Developer ID signing and notarization.
- [ ] Windows packages are signature-verified.
- [ ] Dynamically fetched npm binaries are disabled or integrity-pinned.
- [ ] `npm audit --omit=dev` has no high or critical vulnerabilities.
- [ ] Build logs clearly show verification and signing results.

## Notes

The current behavior may be acceptable for a personal or experimental rebuild workflow if users understand the trust tradeoffs. It should not be treated as a hardened distributable configuration until release-mode guardrails and artifact verification are in place.
