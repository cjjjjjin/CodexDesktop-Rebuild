const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyWindowsSshSandboxRunnerDiagnosticPatch,
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

const fixtureV2 = [
  "async connect(){let e=this.startShellEnvLoadForSsh();",
  "e.promise.then(e=>{}).catch(t=>{}),await this.ensureRemoteAppServer({phase:`connect`,shellEnv:e.getState()});",
  "let t=null,r=new n._n(Hg,{perMessageDeflate:!1,createConnection:()=>(t=this.createSshProxyStream({phase:`connect`,shellEnv:e.getState()}),t)});",
  "return r.once(`close`,()=>{t?.destroy()}),n.gn(r,{onPongTimeout:()=>{r.terminate()}}),new n.vn(r)}",
  "async startRemoteAppServer(e){let r=wg(),i;",
  "try{i=await this.runRemoteLoginShellCommand({command:[`if command -v `,n.Mn(r),` >/dev/null 2>&1; then exit 0; fi; exit `,String(Jg)].join(``),context:e,operation:`codex_path_probe`,timeoutMessage:`SSH: codex path probe timed out`})}",
  "catch(e){throw this.createSshSetupError(`remote_codex_lookup`,e)}",
  "if(i.code===Jg)throw new n.On({failureReason:`remote-codex-not-found`,message:\"No `codex` found in PATH. Please install Codex on the remote machine.\",stage:`remote_codex_lookup`});",
  "createSshProxyStream(e){return null}",
  "async runRemoteLoginShellCommand(){let c=n.kn({args:[`ssh`,...Xg(),...Qg(this.options.sshConnection),`true`],forceSpawnOutsideWsl:!0});return o_({process:c,timeoutMs:Vg.remoteBootstrapCommand,timeoutMessage:`x`})}",
  "}",
].join("");

const terminalBackendFixtureV2 =
  "createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,n=bg(),r=null;return r=new VY(t?.startProcess({processHandle:e.sessionId,command:n,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{r?.handleOutputDelta(e)},onStderrDelta:e=>{r?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:r,shell:EA(n),shellKind:`posix`,pendingState:{buffer:``,exit:null}}}";

const alreadyPowerShellTerminalFixtureV2 =
  "async createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,r=await t?.platformOs?.().catch(()=>null),codexWindowsSshTerminalPlatform=typeof r==`string`&&/windows/i.test(r)?`windows`:`posix`,i=codexWindowsSshTerminalPlatform===`windows`?[`powershell.exe`,`-NoLogo`,`-NoExit`,`-ExecutionPolicy`,`Bypass`]:bg(),a=null;return a=new VY(t?.startProcess({processHandle:e.sessionId,command:i,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{a?.handleOutputDelta(e)},onStderrDelta:e=>{a?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:a,shell:EA(i),shellKind:codexWindowsSshTerminalPlatform===`windows`?`powershell`:`posix`,pendingState:{buffer:``,exit:null}}}";

const workerGitFixture =
  "async function $(e,t,n,r={}){let{env:i,signal:a,timeoutMs:o,onStdoutRaw:s,onStderrRaw:c,maxOutputBytes:l,collectOutput:u=!0,trim:d=!0,allowedNonZeroExitCodes:f,configOverrides:p=[]}=r,m=n.hostConfig,h=t[0],g=crypto.randomUUID().slice(0,8),_=Date.now(),v=J(m);if(t[0]?.startsWith(`-`)===!0)return{command:kQ(v?[`git`,`-C`,e,...t]:[`git`,...t]),success:!1};let y={LC_MESSAGES:`C`,LANGUAGE:`C`,GIT_TERMINAL_PROMPT:`0`,GIT_OPTIONAL_LOCKS:`0`,...i},b=hK(v?y:{...process.env,...y}),x=await r4(e,n,b,u4(i)),S=[...p,`-c`,`core.hooksPath=${!v&&process.platform===`win32`&&!bK()?`NUL`:`/dev/null`}`,`-c`,`core.fsmonitor=${x}`,...t],C,w;try{C=c4(e,S,m,b,u4(i)),w=kQ(C)}catch(t){return{command:kQ(v?[`git`,`-C`,e,...S]:[`git`,...S]),success:!1}}try{ie=v?await J2({appServerClient:n,args:C,cwd:e,collectOutput:u,env:b,outputBytesCap:l,timeoutMs:o,onStdoutDelta:e=>se(`stdout`,e.chunk,e.capReached),onStderrDelta:e=>se(`stderr`,e.chunk,e.capReached),signal:a}):VQ({args:C,cwd:e,env:b,signal:a});return await ie.wait()}catch(t){return{command:w,success:!1,stderr:t instanceof Error?t.message:String(t)}}}";

test("injects a native Windows SSH transport before the POSIX bootstrap", () => {
  const patched = applyWindowsSshRemoteGuardPatch(fixture);

  assert.match(patched, /codexWindowsSshRemotePort/);
  assert.match(patched, /endpoint\.json/);
  assert.match(patched, /Test-WindowsSshCodexPort/);
  assert.match(patched, /ConvertFrom-Json/);
  assert.match(patched, /already listening on/);
  assert.match(patched, /ProcessId/);
  assert.match(patched, /ConvertTo-Json/);
  assert.match(patched, /TcpListener/);
  assert.match(patched, /LocalEndpoint\.Port/);
  assert.match(patched, /parseInt\(codexWindowsSshPortOutput\.trim\(\),10\)/);
  assert.doesNotMatch(patched, /codexWindowsSshRemotePort=42817/);
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
  assert.match(patched, /codexWindowsSshProbeMatched/);
  assert.match(patched, /TcpClient/);
  assert.match(patched, /Windows SSH app-server did not listen/);
  assert.match(patched, /Get-Content \$err/);
  assert.match(patched, /Win32_Process/);
  assert.match(patched, /codexWindowsSshProbeMatched/);
  assert.match(patched, /ChangeExtension\(\$codex,'\.cmd'\)/);
  assert.match(patched, /-File.*\$codex.*app-server/s);
  assert.match(patched, /Start-Process -WindowStyle Hidden/);
  assert.match(patched, /-EncodedCommand/);
  assert.doesNotMatch(patched, /-Command "\$ErrorActionPreference/);
  assert.match(patched, /-L/);
  assert.match(patched, /\[Environment\]::OSVersion\.VersionString/);
  assert.match(patched, /codexWindowsSshProbeCommand/);
  assert.match(patched, /Native Windows SSH target reached POSIX bootstrap/);
  assert.match(patched, /MissingStatementBlock/);
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
  assert.match(upgraded, /codexWindowsSshProbeMatched/);
  assert.match(upgraded, /remote_windows_app_server_start/);
});

test("upgrades endpoint-aware port probes with the matching reusable start bootstrap", () => {
  const staleStartBootstrap = applyWindowsSshRemoteGuardPatch(fixture)
    .replace(/Windows SSH app-server already listening on/g, "stale start marker")
    .replace(/ConvertTo-Json/g, "StaleConvertToJson")
    .replace(/ProcessId/g, "StaleProcessId");

  const upgraded = applyWindowsSshRemoteGuardPatch(staleStartBootstrap);

  assert.match(upgraded, /Windows SSH app-server already listening on/);
  assert.match(upgraded, /ConvertTo-Json/);
  assert.match(upgraded, /ProcessId/);
  assert.equal(applyWindowsSshRemoteGuardPatch(upgraded), upgraded);
});

test("uses PowerShell for native Windows SSH remote terminals", () => {
  const patched = applyWindowsSshRemoteGuardPatch(terminalBackendFixture);

  assert.match(patched, /codexWindowsSshTerminalPlatform/);
  assert.match(patched, /platformOs\?\.\(\)/);
  assert.match(patched, /powershell\.exe/);
  assert.match(patched, /PowerShell runner failed to start/);
  assert.match(patched, /EPERM/);
  assert.match(patched, /-NoLogo/);
  assert.match(patched, /-NoExit/);
  assert.match(patched, /-ExecutionPolicy/);
  assert.match(patched, /Bypass/);
  assert.match(patched, /Xh\(\)/);
  assert.match(patched, /shellKind:codexWindowsSshTerminalPlatform===`windows`\?`powershell`:`posix`/);
});

test("injects native Windows SSH transport into updated desktop bundle shape", () => {
  const patched = applyWindowsSshRemoteGuardPatch(`${fixtureV2}${terminalBackendFixtureV2}`);

  assert.match(patched, /codexWindowsSshRemotePort/);
  assert.match(patched, /endpoint\.json/);
  assert.match(patched, /Test-WindowsSshCodexPort/);
  assert.match(patched, /ConvertFrom-Json/);
  assert.match(patched, /already listening on/);
  assert.match(patched, /ProcessId/);
  assert.match(patched, /ConvertTo-Json/);
  assert.match(patched, /TcpListener/);
  assert.match(patched, /LocalEndpoint\.Port/);
  assert.match(patched, /parseInt\(codexWindowsSshPortOutput\.trim\(\),10\)/);
  assert.doesNotMatch(patched, /codexWindowsSshRemotePort=42817/);
  assert.match(patched, /connectCodexWindowsSshRemote\(codexSshConnectContext\)/);
  assert.match(patched, /new n\._n\(`ws:\/\/127\.0\.0\.1:\$\{t\}\/rpc`/);
  assert.match(patched, /g\.default\.createServer\(\)/);
  assert.match(patched, /n\.kn\(\{args:\[`ssh`,\.\.\.Xg\(\),\.\.\.Qg\(this\.options\.sshConnection\),codexWindowsSshProbeCommand\]/);
  assert.match(patched, /n\.kn\(\{args:\[`ssh`,\.\.\.Xg\(\),\.\.\.Qg\(this\.options\.sshConnection\),codexWindowsSshStartCommand\]/);
  assert.match(patched, /Native Windows SSH target reached POSIX bootstrap/);
  assert.match(patched, /MissingStatementBlock/);
  assert.match(patched, /TcpClient/);
  assert.match(patched, /Windows SSH app-server did not listen/);
  assert.match(patched, /Get-Content \$err/);
  assert.match(patched, /\(0,m\.spawn\)\(`ssh`,\[`-N`,\.\.\.Xg\(\),\.\.\.Qg\(this\.options\.sshConnection\),`-L`,i\]/);
  assert.match(patched, /n\.gn\(s,\{onPongTimeout/);
  assert.match(patched, /new n\.vn\(s\)/);
  assert.match(patched, /codexWindowsSshTerminalPlatform/);
  assert.match(patched, /platformOs\?\.\(\)/);
  assert.match(patched, /powershell\.exe/);
  assert.match(patched, /PowerShell runner failed to start/);
  assert.match(patched, /EPERM/);
  assert.doesNotMatch(patched, /h\.default\.createServer/);
  assert.doesNotMatch(patched, /new t\.pn/);
  assert.doesNotMatch(patched, /\.\.\.Eg\(this\.options\.sshConnection\)/);
  assert.equal(applyWindowsSshRemoteGuardPatch(patched), patched);
});

test("upgrades already-patched PowerShell terminals with sandbox spawn diagnostics", () => {
  const patched = applyWindowsSshRemoteGuardPatch(alreadyPowerShellTerminalFixtureV2);

  assert.match(patched, /PowerShell runner failed to start/);
  assert.match(patched, /EPERM/);
  assert.equal(applyWindowsSshRemoteGuardPatch(patched), patched);
});

test("wraps worker remote git commands for native Windows SSH hosts", () => {
  const patched = applyWindowsSshRemoteGuardPatch(workerGitFixture);

  assert.match(patched, /codexWindowsSshWorkerGitPlatform/);
  assert.match(patched, /platformOs\?\.\(\)/);
  assert.match(patched, /powershell\.exe/);
  assert.match(patched, /-NoProfile/);
  assert.match(patched, /-NonInteractive/);
  assert.match(patched, /\$rest/);
  assert.match(patched, /@rest/);
  assert.equal(applyWindowsSshRemoteGuardPatch(patched), patched);
});

test("annotates Windows remote sandbox runner pipe-in timeouts", () => {
  const fixture =
    "function onNotification(e){case`error`:{let{error:t}=e.params,n=t.message;items.push({type:`error`,message:n});break}}";

  const patched = applyWindowsSshSandboxRunnerDiagnosticPatch(fixture);

  assert.match(patched, /Windows remote sandbox runner failed while connecting pipe-in/);
  assert.match(patched, /connecting runner pipe-in/);
  assert.match(patched, /sandboxPolicy/);
  assert.equal(applyWindowsSshSandboxRunnerDiagnosticPatch(patched), patched);
});

test("annotates app-server manager error notifications for runner pipe-in timeouts", () => {
  const fixture =
    "case`error`:{let{error:e,willRetry:t,threadId:r,turnId:i}=n.params,{message:a,codexErrorInfo:o,additionalDetails:s}=e,c=N(r);this.updateTurnState(c,i,e=>{e.items.push({id:I(),type:`error`,message:a,willRetry:t,errorInfo:o,additionalDetails:s??null})});break}";

  const patched = applyWindowsSshSandboxRunnerDiagnosticPatch(fixture);

  assert.match(patched, /Windows remote sandbox runner failed while connecting pipe-in/);
  assert.match(patched, /connecting runner pipe-in/);
  assert.match(patched, /sandboxPolicy/);
  assert.equal(applyWindowsSshSandboxRunnerDiagnosticPatch(patched), patched);
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
