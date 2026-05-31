const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyWindowsSshRemoteGuardPatch,
} = require("./patch-win-ssh-remote");

const fixture = [
  "async connect(){let e=this.startShellEnvLoadForSsh();",
  "e.promise.then(t=>{}).catch(t=>{}),await this.ensureRemoteAppServer({phase:`connect`,shellEnv:e.getState()});",
  "let n=null,r=new t.pn(vg,{perMessageDeflate:!1,createConnection:()=>(n=this.createSshProxyStream({phase:`connect`,shellEnv:e.getState()}),n)});",
  "return r.once(`close`,()=>{n?.destroy()}),t.fn(r,{onPongTimeout:()=>{r.terminate()}}),new t.mn(r)}",
  "async startRemoteAppServer(n){let r=eg(),i;",
  "try{i=await this.runRemoteLoginShellCommand({command:[`if command -v `,t.On(r),` >/dev/null 2>&1; then exit 0; fi; exit `,String(Sg)].join(``),context:n,operation:`codex_path_probe`,timeoutMessage:`SSH: codex path probe timed out`})}",
  "catch(e){throw this.createSshSetupError(`remote_codex_lookup`,e)}",
  "if(i.code===Sg)throw new t.wn({failureReason:`remote-codex-not-found`,message:\"No `codex` found in PATH. Please install Codex on the remote machine.\",stage:`remote_codex_lookup`});",
  "createSshProxyStream(e){return null}",
  "}",
].join("");

test("injects a native Windows SSH transport before the POSIX bootstrap", () => {
  const patched = applyWindowsSshRemoteGuardPatch(fixture);

  assert.match(patched, /codexWindowsSshRemotePort/);
  assert.match(patched, /connectCodexWindowsSshRemote/);
  assert.match(patched, /app-server --listen ws:\/\/127\.0\.0\.1:/);
  assert.match(patched, /-L/);
  assert.match(patched, /cmd\.exe \/c ver/);
  assert.doesNotMatch(patched, /,let codexSshConnectContext/);
  assert.match(patched, /\}\);let codexSshConnectContext=/);
  assert.ok(
    patched.indexOf("cmd.exe /c ver") < patched.indexOf("codex_path_probe"),
    "Windows probe should run before codex_path_probe",
  );
});

test("Windows SSH guard patch is idempotent", () => {
  const patched = applyWindowsSshRemoteGuardPatch(fixture);

  assert.equal(applyWindowsSshRemoteGuardPatch(patched), patched);
});

test("leaves source unchanged when the SSH bootstrap shape is absent", () => {
  const source = "function unrelated(){return 1}";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.equal(applyWindowsSshRemoteGuardPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 3);
  assert.match(warnings.join("\n"), /Windows SSH remote connect patch/);
  assert.match(warnings.join("\n"), /Windows SSH remote bootstrap patch/);
  assert.match(warnings.join("\n"), /Windows SSH remote transport patch/);
});
