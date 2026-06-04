const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyGuardianApprovalRemoteConfigPatch,
} = require("./patch-guardian-approval-remote-config");

const fixture = [
  'var Tn={"features.js_repl":!0},En={nodeModuleDirs:[]};',
  "function Vn(e){return{}}",
  "var si=[`features.js_repl`,`mcp_servers.${e.jn}`];",
  "function li(e){return si.map(t=>({keyPath:t,mergeStrategy:`replace`,value:e?.[t]??null}))}",
].join("");

const fixtureV2 = [
  'var Kn={"features.js_repl":!0},qn={nodeModuleDirs:[]};',
  "function $n(e){return cr([Kn,e])}",
  "var Oi=[`features.js_repl`,`mcp_servers.${t.jn}`];",
  "function Ai(e){return Oi.map(t=>({keyPath:t,mergeStrategy:`replace`,value:e?.[t]??null}))}",
].join("");

test("adds guardian approval to generated remote config and sync keys", () => {
  const patched = applyGuardianApprovalRemoteConfigPatch(fixture);

  assert.match(patched, /"features\.guardian_approval":!0/);
  assert.match(patched, /`features\.guardian_approval`/);
  assert.match(patched, /`features\.js_repl`,`features\.guardian_approval`,`mcp_servers\.\$\{e\.jn\}`/);
});

test("guardian approval remote config patch is idempotent", () => {
  const patched = applyGuardianApprovalRemoteConfigPatch(fixture);

  assert.equal(applyGuardianApprovalRemoteConfigPatch(patched), patched);
});

test("adds guardian approval to updated remote config sync key shape", () => {
  const patched = applyGuardianApprovalRemoteConfigPatch(fixtureV2);

  assert.match(patched, /"features\.guardian_approval":!0/);
  assert.match(patched, /var Oi=\[`features\.js_repl`,`features\.guardian_approval`,`mcp_servers\.\$\{t\.jn\}`\]/);
  assert.equal(applyGuardianApprovalRemoteConfigPatch(patched), patched);
});

test("leaves source unchanged when expected shapes are absent", () => {
  const source = "function unrelated(){return 1}";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.equal(applyGuardianApprovalRemoteConfigPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 2);
  assert.match(warnings.join("\n"), /generated remote config defaults/);
  assert.match(warnings.join("\n"), /remote config sync key list/);
});
