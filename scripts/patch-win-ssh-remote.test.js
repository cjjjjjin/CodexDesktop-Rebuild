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

const terminalBackendFixture =
  "createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,n=Xh(),r=null;return r=new VJ(t?.startProcess({processHandle:e.sessionId,command:n,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{r?.handleOutputDelta(e)},onStderrDelta:e=>{r?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:r,shell:xA(n),shellKind:`posix`,pendingState:{buffer:``,exit:null}}}";

test("injects a native Windows SSH transport before the POSIX bootstrap", () => {
  const patched = applyWindowsSshRemoteGuardPatch(fixture);

  assert.match(patched, /codexWindowsSshRemotePort/);
  assert.match(patched, /openCodexWindowsSshWebSocket/);
  assert.match(patched, /connectCodexWindowsSshRemote/);
  assert.match(patched, /remote_windows_app_server_connect/);
  assert.match(patched, /s\.on\?\.\(`error`,\(\)=>\{\}\)/);
  assert.match(patched, /setTimeout\(\(\)=>\{d\(\),l\(Error\(`Timed out waiting for Windows SSH app-server WebSocket`\)\)\}/);
  assert.doesNotMatch(patched, /setTimeout\(\(\)=>\{d\(\);?try\{?s\.terminate/);
  assert.match(patched, /app-server.*--listen.*ws:\/\/127\.0\.0\.1:/);
  assert.match(patched, /Get-Command/);
  assert.match(patched, /\$codexExt/);
  assert.match(patched, /\$codexCmd/);
  assert.match(patched, /\$codexJs/);
  assert.match(patched, /node_modules\/@openai\/codex\/bin\/codex\.js/);
  assert.match(patched, /Get-Command node/);
  assert.match(patched, /Invoke-CimMethod/);
  assert.match(patched, /Win32_Process/);
  assert.match(patched, /ChangeExtension\(\$codex,'\.cmd'\)/);
  assert.match(patched, /-File.*\$codex.*app-server/s);
  assert.match(patched, /Start-Process -WindowStyle Hidden/);
  assert.match(patched, /-EncodedCommand/);
  assert.doesNotMatch(patched, /-Command "\$ErrorActionPreference/);
  assert.match(patched, /-L/);
  assert.match(patched, /\[Environment\]::OSVersion\.VersionString/);
  assert.match(patched, /codexWindowsSshProbeCommand/);
  assert.doesNotMatch(patched, /OpenSSH_for_Windows/);
  assert.doesNotMatch(patched, /cmd\.exe \/c ver/);
  assert.doesNotMatch(patched, /,let codexSshConnectContext/);
  assert.match(patched, /\}\);let codexSshConnectContext=/);
  assert.ok(
    patched.indexOf("codexWindowsSshProbeCommand") < patched.indexOf("codex_path_probe"),
    "Windows probe should run before codex_path_probe",
  );
});

test("upgrades the Windows SSH probe without using the local OpenSSH banner", () => {
  const patchedWithBannerFallback = applyWindowsSshRemoteGuardPatch(fixture).replace(
    "if((codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput))){",
    "if((codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput))||/OpenSSH_for_Windows/i.test(codexWindowsSshProbeOutput)){",
  );

  const upgraded = applyWindowsSshRemoteGuardPatch(patchedWithBannerFallback);

  assert.doesNotMatch(upgraded, /OpenSSH_for_Windows/);
  assert.match(upgraded, /\[Environment\]::OSVersion\.VersionString/);
  assert.match(upgraded, /\$codexCmd/);
});

test("uses PowerShell for native Windows SSH remote terminals", () => {
  const patched = applyWindowsSshRemoteGuardPatch(terminalBackendFixture);

  assert.match(patched, /codexWindowsSshTerminalPlatform/);
  assert.match(patched, /platformOs\?\.\(\)/);
  assert.match(patched, /powershell\.exe/);
  assert.match(patched, /-NoLogo/);
  assert.match(patched, /-NoExit/);
  assert.match(patched, /-ExecutionPolicy/);
  assert.match(patched, /Bypass/);
  assert.match(patched, /Xh\(\)/);
  assert.match(patched, /shellKind:codexWindowsSshTerminalPlatform===`windows`\?`powershell`:`posix`/);
});

test("Windows SSH guard patch is idempotent", () => {
  const patched = applyWindowsSshRemoteGuardPatch(fixture);

  assert.equal(applyWindowsSshRemoteGuardPatch(patched), patched);
});

test("Windows SSH guard and terminal patch is idempotent", () => {
  const patched = applyWindowsSshRemoteGuardPatch(`${fixture}${terminalBackendFixture}`);

  assert.match(patched, /codexWindowsSshTerminalPlatform/);
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
