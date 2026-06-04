#!/usr/bin/env node
/**
 * patch-win-ssh-remote.js - Add an experimental native Windows SSH transport.
 *
 * Codex Desktop's SSH transport bootstraps a POSIX shell and starts the remote
 * app server with a Unix socket. Native Windows OpenSSH hosts can fail either
 * in the PowerShell bootstrap path or later when the Unix socket transport is
 * unavailable. This patch adds an encoded PowerShell OS probe before the POSIX
 * bootstrap. When the remote is native Windows, it starts the remote app-server
 * on a loopback WebSocket endpoint and connects through an SSH local forward.
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
const MARKER = "codexWindowsSshProbeCommand";

function windowsSshStartScriptSource() {
  return `$ErrorActionPreference='Continue'; $dir=Join-Path $env:USERPROFILE '.codex/app-server-control'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $out=Join-Path $dir 'app-server.out.log'; $err=Join-Path $dir 'app-server.err.log'; $listen='ws://127.0.0.1:\${this.codexWindowsSshRemotePort}'; $codex=(Get-Command \${r} -ErrorAction SilentlyContinue).Source; if(-not $codex){ Write-Error 'codex not found in PATH'; exit 9009 }; $codexDir=Split-Path -Parent $codex; $codexJs=Join-Path $codexDir 'node_modules/@openai/codex/bin/codex.js'; $node=(Get-Command node -ErrorAction SilentlyContinue).Source; $codexExt=[IO.Path]::GetExtension($codex).ToLowerInvariant(); $codexCmd=[IO.Path]::ChangeExtension($codex,'.cmd'); if($node -and (Test-Path $codexJs)){ $cmdLine='cmd.exe /d /s /c ""'+$node+'" "'+$codexJs+'" app-server --listen '+$listen+' > "'+$out+'" 2> "'+$err+'""'; $createResult=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdLine }; if($createResult.ReturnValue -ne 0){ Write-Error ('failed to create app-server process: '+$createResult.ReturnValue); exit $createResult.ReturnValue }; exit 0 } elseif($codexExt -eq '.ps1' -and (Test-Path $codexCmd)){ $launcher='cmd.exe'; $launcherArgs='/d /s /c ""'+$codexCmd+'" app-server --listen '+$listen+'"' } elseif($codexExt -eq '.ps1'){ $launcher='powershell.exe'; $launcherArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$codex,'app-server','--listen',$listen) } elseif($codexExt -eq '.cmd' -or $codexExt -eq '.bat'){ $launcher='cmd.exe'; $launcherArgs='/d /s /c ""'+$codex+'" app-server --listen '+$listen+'"' } else { $launcher=$codex; $launcherArgs=@('app-server','--listen',$listen) }; Start-Process -WindowStyle Hidden -FilePath $launcher -ArgumentList $launcherArgs -RedirectStandardOutput $out -RedirectStandardError $err; exit 0`;
}

function windowsSshStartSource() {
  return `let codexWindowsSshStartScript=\`${windowsSshStartScriptSource()}\`,codexWindowsSshStartCommand=\`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \${Buffer.from(codexWindowsSshStartScript,\`utf16le\`).toString(\`base64\`)}\`,codexWindowsSshStartProcess=t.Tn({args:[\`ssh\`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await Pg({process:codexWindowsSshStartProcess,timeoutMs:_g.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return`;
}

function windowsSshStartSourceV2() {
  return `let codexWindowsSshStartScript=\`${windowsSshStartScriptSource()}\`,codexWindowsSshStartCommand=\`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \${Buffer.from(codexWindowsSshStartScript,\`utf16le\`).toString(\`base64\`)}\`,codexWindowsSshStartProcess=n.kn({args:[\`ssh\`,...Xg(),...Qg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await o_({process:codexWindowsSshStartProcess,timeoutMs:Vg.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return`;
}

function windowsSshRemotePortSource() {
  return "let codexWindowsSshPortScript=`$listener=[System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'),0); $listener.Start(); try{ [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }`,codexWindowsSshPortCommand=`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(codexWindowsSshPortScript,`utf16le`).toString(`base64`)}`,codexWindowsSshPortProcess=t.Tn({args:[`ssh`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshPortCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshPortResult=await Pg({process:codexWindowsSshPortProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows port probe timed out`});if(codexWindowsSshPortResult.code!==0)throw this.createSshSetupError(`remote_windows_app_server_port`,Error(await this.getSshCommandFailureMessage(codexWindowsSshPortResult)));let codexWindowsSshPortOutput=codexWindowsSshPortProcess.getStdout().toString(`utf8`),codexWindowsSshRemotePort=parseInt(codexWindowsSshPortOutput.trim(),10);if(!Number.isInteger(codexWindowsSshRemotePort)||codexWindowsSshRemotePort<=0||codexWindowsSshRemotePort>65535)throw this.createSshSetupError(`remote_windows_app_server_port`,Error(`Remote Windows port probe returned invalid port: ${codexWindowsSshPortOutput.trim()}`));this.codexWindowsSshRemotePort=codexWindowsSshRemotePort;";
}

function windowsSshRemotePortSourceV2() {
  return "let codexWindowsSshPortScript=`$listener=[System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'),0); $listener.Start(); try{ [int]$listener.LocalEndpoint.Port } finally { $listener.Stop() }`,codexWindowsSshPortCommand=`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(codexWindowsSshPortScript,`utf16le`).toString(`base64`)}`,codexWindowsSshPortProcess=n.kn({args:[`ssh`,...Xg(),...Qg(this.options.sshConnection),codexWindowsSshPortCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshPortResult=await o_({process:codexWindowsSshPortProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows port probe timed out`});if(codexWindowsSshPortResult.code!==0)throw this.createSshSetupError(`remote_windows_app_server_port`,Error(await this.getSshCommandFailureMessage(codexWindowsSshPortResult)));let codexWindowsSshPortOutput=codexWindowsSshPortProcess.getStdout().toString(`utf8`),codexWindowsSshRemotePort=parseInt(codexWindowsSshPortOutput.trim(),10);if(!Number.isInteger(codexWindowsSshRemotePort)||codexWindowsSshRemotePort<=0||codexWindowsSshRemotePort>65535)throw this.createSshSetupError(`remote_windows_app_server_port`,Error(`Remote Windows port probe returned invalid port: ${codexWindowsSshPortOutput.trim()}`));this.codexWindowsSshRemotePort=codexWindowsSshRemotePort;";
}

function windowsSshProbePreambleSource() {
  return "let codexWindowsSshProbeScript=`[Environment]::OSVersion.VersionString`,codexWindowsSshProbeCommand=`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(codexWindowsSshProbeScript,`utf16le`).toString(`base64`)}`,codexWindowsSshProbeProcess=t.Tn({args:[`ssh`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshProbeCommand],forceSpawnOutsideWsl:!0});codexWindowsSshProbeResult=await Pg({process:codexWindowsSshProbeProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows probe timed out`});let codexWindowsSshProbeOutput=`${codexWindowsSshProbeProcess.getStdout().toString(`utf8`)}\\n${codexWindowsSshProbeResult.stderr??``}`;if(codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput)){";
}

function windowsSshProbePreambleSourceV2() {
  return "let codexWindowsSshProbeScript=`[Environment]::OSVersion.VersionString`,codexWindowsSshProbeCommand=`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${Buffer.from(codexWindowsSshProbeScript,`utf16le`).toString(`base64`)}`,codexWindowsSshProbeProcess=n.kn({args:[`ssh`,...Xg(),...Qg(this.options.sshConnection),codexWindowsSshProbeCommand],forceSpawnOutsideWsl:!0});codexWindowsSshProbeResult=await o_({process:codexWindowsSshProbeProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows probe timed out`});let codexWindowsSshProbeOutput=`${codexWindowsSshProbeProcess.getStdout().toString(`utf8`)}\\n${codexWindowsSshProbeResult.stderr??``}`;if(codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput)){";
}

function directPowerShellWindowsSshStartSource() {
  return `let codexWindowsSshStartCommand=\`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Continue'; $dir=Join-Path $env:USERPROFILE '.codex/app-server-control'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $out=Join-Path $dir 'app-server.out.log'; $err=Join-Path $dir 'app-server.err.log'; $codex=(Get-Command \${r} -ErrorAction SilentlyContinue).Source; if(-not $codex){ Write-Error 'codex not found in PATH'; exit 9009 }; Start-Process -WindowStyle Hidden -FilePath $codex -ArgumentList @('app-server','--listen','ws://127.0.0.1:\${this.codexWindowsSshRemotePort}') -RedirectStandardOutput $out -RedirectStandardError $err; exit 0"\`,codexWindowsSshStartProcess=t.Tn({args:[\`ssh\`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await Pg({process:codexWindowsSshStartProcess,timeoutMs:_g.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return`;
}

function encodedPowerShellWindowsSshStartSourceWithoutShimHandling() {
  return `let codexWindowsSshStartScript=\`$ErrorActionPreference='Continue'; $dir=Join-Path $env:USERPROFILE '.codex/app-server-control'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $out=Join-Path $dir 'app-server.out.log'; $err=Join-Path $dir 'app-server.err.log'; $codex=(Get-Command \${r} -ErrorAction SilentlyContinue).Source; if(-not $codex){ Write-Error 'codex not found in PATH'; exit 9009 }; Start-Process -WindowStyle Hidden -FilePath $codex -ArgumentList @('app-server','--listen','ws://127.0.0.1:\${this.codexWindowsSshRemotePort}') -RedirectStandardOutput $out -RedirectStandardError $err; exit 0\`,codexWindowsSshStartCommand=\`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand \${Buffer.from(codexWindowsSshStartScript,\`utf16le\`).toString(\`base64\`)}\`,codexWindowsSshStartProcess=t.Tn({args:[\`ssh\`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await Pg({process:codexWindowsSshStartProcess,timeoutMs:_g.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return`;
}

function oldWindowsSshStartSource() {
  return `let codexWindowsSshStartCommand=\`cmd.exe /d /s /c "if not exist \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\" mkdir \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\" & start \\"\\" /b \${r} app-server --listen ws://127.0.0.1:\${this.codexWindowsSshRemotePort} > \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\\\app-server.log\\" 2>&1"\`,codexWindowsSshStartProcess=t.Tn({args:[\`ssh\`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await Pg({process:codexWindowsSshStartProcess,timeoutMs:_g.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return`;
}

function windowsSshGuardSource() {
  return [
    "let codexWindowsSshProbeResult;",
    "try{",
    `${windowsSshProbePreambleSource()}${windowsSshRemotePortSource()}${windowsSshStartSource()}}`,
    "}catch(e){if(e instanceof t.wn)throw e;this.logger.info(`ssh_websocket_v0.remote_windows_probe_skipped`,{safe:{},sensitive:{error:e,sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port}})}",
  ].join("");
}

function windowsSshGuardSourceV2() {
  return [
    "let codexWindowsSshProbeResult;",
    "try{",
    `${windowsSshProbePreambleSourceV2()}${windowsSshRemotePortSourceV2()}${windowsSshStartSourceV2()}}`,
    "}catch(e){if(e instanceof n.On)throw e;this.logger.info(`ssh_websocket_v0.remote_windows_probe_skipped`,{safe:{},sensitive:{error:e,sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port}})}",
  ].join("");
}

function windowsSshTransportMethodsSource() {
  return [
    "async getCodexWindowsSshLocalPort(){return await new Promise((e,t)=>{let n=h.default.createServer();n.once(`error`,t),n.listen(0,`127.0.0.1`,()=>{let r=n.address(),i=typeof r==`object`&&r?r.port:null;n.close(()=>{i==null?t(Error(`Unable to allocate local SSH tunnel port`)):e(i)})})})}",
    "async openCodexWindowsSshWebSocket(e,n,r,i){let a=Date.now()+15e3,o=null;for(;;){let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1});s.on?.(`error`,()=>{});try{return await new Promise((c,l)=>{let u=setTimeout(()=>{d(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))},1e3),d=()=>{clearTimeout(u),s.removeListener?.(`open`,c),s.removeListener?.(`error`,f),s.removeListener?.(`close`,m)},f=e=>{d(),l(e instanceof Error?e:Error(String(e)))},m=(e,t)=>{d(),l(Error(`codex app-server websocket closed while opening (code=${e})`))};s.once(`open`,()=>{d(),c(s)}),s.once(`error`,f),s.once(`close`,m)})}catch(c){o=c;if(Date.now()>=a){let a=Tg(i);throw this.createSshSetupError(`remote_windows_app_server_connect`,Error(`Windows SSH app-server WebSocket did not open on ws://127.0.0.1:${n}/rpc via SSH tunnel to 127.0.0.1:${r}${a?`: ${a}`:``}${o instanceof Error?`: ${o.message}`:``}`))}await new Promise(e=>setTimeout(e,500))}}}",
    "async connectCodexWindowsSshRemote(e){let n=await this.getCodexWindowsSshLocalPort(),r=this.codexWindowsSshRemotePort;if(r==null)throw Error(`Missing Windows SSH remote app-server port`);let i=`127.0.0.1:${n}:127.0.0.1:${r}`,a=(0,p.spawn)(`ssh`,[`-N`,...wg(),...Eg(this.options.sshConnection),`-L`,i],{env:t.jr(process.env),stdio:[`ignore`,`ignore`,`pipe`]}),o=``;a.stderr?.on(`data`,e=>{o=`${o}${e.toString(`utf8`)}`.slice(-4e3)});let s=await this.openCodexWindowsSshWebSocket(e,n,r,o),c=()=>{a.kill()};return s.once(`close`,c),s.once(`error`,c),a.on(`close`,(n,r)=>{if(n===0)return;this.logger.warning(`ssh_websocket_v0.windows_tunnel_closed`,{safe:{code:n,signal:r,operation:`app_server_windows_tunnel`,...jg(e.shellEnv),sshPhase:e.phase},sensitive:{sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port,stderr:o}}),s.terminate?.()}),t.fn(s,{onPongTimeout:()=>{s.terminate()}}),new t.mn(s)}",
  ].join("");
}

function windowsSshTransportMethodsSourceV2() {
  return [
    "async getCodexWindowsSshLocalPort(){return await new Promise((e,t)=>{let n=g.default.createServer();n.once(`error`,t),n.listen(0,`127.0.0.1`,()=>{let r=n.address(),i=typeof r==`object`&&r?r.port:null;n.close(()=>{i==null?t(Error(`Unable to allocate local SSH tunnel port`)):e(i)})})})}",
    "async openCodexWindowsSshWebSocket(e,t,r,i){let a=Date.now()+15e3,o=null;for(;;){let s=new n._n(`ws://127.0.0.1:${t}/rpc`,{perMessageDeflate:!1});s.on?.(`error`,()=>{});try{return await new Promise((c,l)=>{let u=setTimeout(()=>{d(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))},1e3),d=()=>{clearTimeout(u),s.removeListener?.(`open`,c),s.removeListener?.(`error`,f),s.removeListener?.(`close`,m)},f=e=>{d(),l(e instanceof Error?e:Error(String(e)))},m=(e,t)=>{d(),l(Error(`codex app-server websocket closed while opening (code=${e})`))};s.once(`open`,()=>{d(),c(s)}),s.once(`error`,f),s.once(`close`,m)})}catch(c){o=c;if(Date.now()>=a){let a=Tg(i);throw this.createSshSetupError(`remote_windows_app_server_connect`,Error(`Windows SSH app-server WebSocket did not open on ws://127.0.0.1:${t}/rpc via SSH tunnel to 127.0.0.1:${r}${a?`: ${a}`:``}${o instanceof Error?`: ${o.message}`:``}`))}await new Promise(e=>setTimeout(e,500))}}}",
    "async connectCodexWindowsSshRemote(e){let t=await this.getCodexWindowsSshLocalPort(),r=this.codexWindowsSshRemotePort;if(r==null)throw Error(`Missing Windows SSH remote app-server port`);let i=`127.0.0.1:${t}:127.0.0.1:${r}`,a=(0,m.spawn)(`ssh`,[`-N`,...Xg(),...Qg(this.options.sshConnection),`-L`,i],{env:n.Fr(process.env),stdio:[`ignore`,`ignore`,`pipe`]}),o=``;a.stderr?.on(`data`,e=>{o=`${o}${e.toString(`utf8`)}`.slice(-4e3)});let s=await this.openCodexWindowsSshWebSocket(e,t,r,o),c=()=>{a.kill()};return s.once(`close`,c),s.once(`error`,c),a.on(`close`,(t,n)=>{if(t===0)return;this.logger.warning(`ssh_websocket_v0.windows_tunnel_closed`,{safe:{code:t,signal:n,operation:`app_server_windows_tunnel`,...r_(e.shellEnv),sshPhase:e.phase},sensitive:{sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port,stderr:o}}),s.terminate?.()}),n.gn(s,{onPongTimeout:()=>{s.terminate()}}),new n.vn(s)}",
  ].join("");
}

function applyWindowsSshRemoteTerminalPatch(source) {
  if (source.includes("codexWindowsSshTerminalPlatform")) {
    return source;
  }

  const remoteTerminalNeedle =
    "createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,n=Xh(),r=null;return r=new VJ(t?.startProcess({processHandle:e.sessionId,command:n,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{r?.handleOutputDelta(e)},onStderrDelta:e=>{r?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:r,shell:xA(n),shellKind:`posix`,pendingState:{buffer:``,exit:null}}}";
  const remoteTerminalReplacement =
    "async createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,n=await t?.platformOs?.().catch(()=>null),codexWindowsSshTerminalPlatform=typeof n==`string`&&/windows/i.test(n)?`windows`:`posix`,r=codexWindowsSshTerminalPlatform===`windows`?[`powershell.exe`,`-NoLogo`,`-NoExit`,`-ExecutionPolicy`,`Bypass`]:Xh(),i=null;return i=new VJ(t?.startProcess({processHandle:e.sessionId,command:r,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{i?.handleOutputDelta(e)},onStderrDelta:e=>{i?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:i,shell:xA(r),shellKind:codexWindowsSshTerminalPlatform===`windows`?`powershell`:`posix`,pendingState:{buffer:``,exit:null}}}";

  if (source.includes(remoteTerminalNeedle)) {
    return source.replace(remoteTerminalNeedle, remoteTerminalReplacement);
  }

  const remoteTerminalNeedleV2 =
    "createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,n=bg(),r=null;return r=new VY(t?.startProcess({processHandle:e.sessionId,command:n,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{r?.handleOutputDelta(e)},onStderrDelta:e=>{r?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:r,shell:EA(n),shellKind:`posix`,pendingState:{buffer:``,exit:null}}}";
  const remoteTerminalReplacementV2 =
    "async createRemoteTerminalBackend(e){let t=this.getProcessConnectionForHostId?.(e.hostId)??null,r=await t?.platformOs?.().catch(()=>null),codexWindowsSshTerminalPlatform=typeof r==`string`&&/windows/i.test(r)?`windows`:`posix`,i=codexWindowsSshTerminalPlatform===`windows`?[`powershell.exe`,`-NoLogo`,`-NoExit`,`-ExecutionPolicy`,`Bypass`]:bg(),a=null;return a=new VY(t?.startProcess({processHandle:e.sessionId,command:i,tty:!0,size:{cols:e.cols,rows:e.rows},streamStdoutStderr:!0,outputBytesCap:null,timeoutMs:null,cwd:e.requestedCwd,env:this.buildRemoteProcessEnv(),onStdoutDelta:e=>{a?.handleOutputDelta(e)},onStderrDelta:e=>{a?.handleOutputDelta(e)}})??Promise.reject(Error(`Remote process connection is unavailable`)),e.callbacks),{backend:a,shell:EA(i),shellKind:codexWindowsSshTerminalPlatform===`windows`?`powershell`:`posix`,pendingState:{buffer:``,exit:null}}}";

  if (source.includes(remoteTerminalNeedleV2)) {
    return source.replace(remoteTerminalNeedleV2, remoteTerminalReplacementV2);
  }

  if (source.includes("createRemoteTerminalBackend")) {
    console.warn("WARN: Could not find remote terminal backend shape - skipping Windows SSH remote terminal patch");
  }
  return source;
}

function oldWindowsSshTransportMethodsSource() {
  return [
    "async getCodexWindowsSshLocalPort(){return await new Promise((e,t)=>{let n=h.default.createServer();n.once(`error`,t),n.listen(0,`127.0.0.1`,()=>{let r=n.address(),i=typeof r==`object`&&r?r.port:null;n.close(()=>{i==null?t(Error(`Unable to allocate local SSH tunnel port`)):e(i)})})})}",
    "async connectCodexWindowsSshRemote(e){let n=await this.getCodexWindowsSshLocalPort(),r=this.codexWindowsSshRemotePort;if(r==null)throw Error(`Missing Windows SSH remote app-server port`);let i=`127.0.0.1:${n}:127.0.0.1:${r}`,a=(0,p.spawn)(`ssh`,[`-N`,...wg(),...Eg(this.options.sshConnection),`-L`,i],{env:t.jr(process.env),stdio:[`ignore`,`ignore`,`pipe`]}),o=``;a.stderr?.on(`data`,e=>{o=`${o}${e.toString(`utf8`)}`.slice(-4e3)}),await new Promise(e=>setTimeout(e,500));let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1}),c=()=>{a.kill()};return s.once(`close`,c),s.once(`error`,c),a.on(`close`,(n,r)=>{if(n===0)return;this.logger.warning(`ssh_websocket_v0.windows_tunnel_closed`,{safe:{code:n,signal:r,operation:`app_server_windows_tunnel`,...jg(e.shellEnv),sshPhase:e.phase},sensitive:{sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port,stderr:o}}),s.terminate?.()}),t.fn(s,{onPongTimeout:()=>{s.terminate()}}),new t.mn(s)}",
  ].join("");
}

function applyWindowsSshRemoteGuardPatch(source) {
  const usesV2SshShape =
    source.includes("n.kn({args:[`ssh`,...Xg(),...Qg(this.options.sshConnection)") ||
    source.includes("new n._n(Hg,");

  if (
    source.includes(MARKER) &&
    source.includes("$codexCmd") &&
    source.includes("$codexJs") &&
    source.includes("Invoke-CimMethod") &&
    source.includes("TcpListener") &&
    !source.includes("codexWindowsSshRemotePort=42817") &&
    !(usesV2SshShape && source.includes("h.default.createServer")) &&
    !source.includes("OpenSSH_for_Windows")
  ) {
    return applyWindowsSshRemoteTerminalPatch(source);
  }

  let patched = source;
  let changed = false;

  const connectNeedle =
    ",await this.ensureRemoteAppServer({phase:`connect`,shellEnv:e.getState()});let n=null,r=new t.pn(vg,{";
  const connectReplacement =
    ";let codexSshConnectContext={phase:`connect`,shellEnv:e.getState()};await this.ensureRemoteAppServer(codexSshConnectContext);if(this.codexWindowsSshRemotePort!=null)return await this.connectCodexWindowsSshRemote(codexSshConnectContext);let n=null,r=new t.pn(vg,{";
  const connectNeedleV2 =
    ",await this.ensureRemoteAppServer({phase:`connect`,shellEnv:e.getState()});let t=null,r=new n._n(Hg,{";
  const connectReplacementV2 =
    ";let codexSshConnectContext={phase:`connect`,shellEnv:e.getState()};await this.ensureRemoteAppServer(codexSshConnectContext);if(this.codexWindowsSshRemotePort!=null)return await this.connectCodexWindowsSshRemote(codexSshConnectContext);let t=null,r=new n._n(Hg,{";
  if (patched.includes("connectCodexWindowsSshRemote(codexSshConnectContext)")) {
    // Already has the Windows SSH connect branch; later blocks may still upgrade transport helpers.
  } else if (patched.includes(connectNeedleV2)) {
    patched = patched.replace(connectNeedleV2, connectReplacementV2);
    changed = true;
  } else if (patched.includes(connectNeedle)) {
    patched = patched.replace(connectNeedle, connectReplacement);
    changed = true;
  } else {
    console.warn("WARN: Could not find SSH connect transport shape - skipping Windows SSH remote connect patch");
  }

  const startNeedle = "async startRemoteAppServer(n){let r=eg(),i;";
  const startNeedleV2 = "async startRemoteAppServer(e){let r=wg(),i;";
  const oldProbeRegex =
    /let codexWindowsSshProbeProcess=t\.Tn\(\{args:\[`ssh`,\.\.\.wg\(\),\.\.\.Eg\(this\.options\.sshConnection\),`cmd\.exe \/c ver`\],forceSpawnOutsideWsl:!0\}\);codexWindowsSshProbeResult=await Pg\(\{process:codexWindowsSshProbeProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows probe timed out`\}\);let codexWindowsSshProbeOutput=`\$\{codexWindowsSshProbeProcess\.getStdout\(\)\.toString\(`utf8`\)\}\\n\$\{codexWindowsSshProbeResult\.stderr\?\?``\}`;if\(codexWindowsSshProbeResult\.code===0&&\/Microsoft Windows\/i\.test\(codexWindowsSshProbeOutput\)\)\{/u;
  const oldStartSource = oldWindowsSshStartSource();
  const directPowerShellStartSource = directPowerShellWindowsSshStartSource();
  const encodedPowerShellStartSourceWithoutShimHandling =
    encodedPowerShellWindowsSshStartSourceWithoutShimHandling();
  const encodedStartScriptRegex =
    /let codexWindowsSshStartScript=`[^`]*`,codexWindowsSshStartCommand=/u;
  if (oldProbeRegex.test(patched)) {
    patched = patched.replace(oldProbeRegex, windowsSshProbePreambleSource());
    changed = true;
  } else if (patched.includes("||/OpenSSH_for_Windows/i.test(codexWindowsSshProbeOutput)")) {
    patched = patched.replace(
      "if((codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput))||/OpenSSH_for_Windows/i.test(codexWindowsSshProbeOutput)){",
      "if(codexWindowsSshProbeResult.code===0&&/Windows/i.test(codexWindowsSshProbeOutput)){",
    );
    changed = true;
  }
  if (patched.includes("this.codexWindowsSshRemotePort=42817;")) {
    patched = patched.replace(
      "this.codexWindowsSshRemotePort=42817;",
      usesV2SshShape ? windowsSshRemotePortSourceV2() : windowsSshRemotePortSource(),
    );
    changed = true;
  }
  if (patched.includes("codexWindowsSshStartScript=`") && !patched.includes("Invoke-CimMethod")) {
    patched = patched.replace(
      encodedStartScriptRegex,
      `let codexWindowsSshStartScript=\`${windowsSshStartScriptSource()}\`,codexWindowsSshStartCommand=`,
    );
    changed = patched !== source;
  } else if (patched.includes(oldStartSource)) {
    patched = patched.replace(oldStartSource, windowsSshStartSource());
    changed = true;
  } else if (patched.includes(directPowerShellStartSource)) {
    patched = patched.replace(directPowerShellStartSource, windowsSshStartSource());
    changed = true;
  } else if (patched.includes(encodedPowerShellStartSourceWithoutShimHandling)) {
    patched = patched.replace(encodedPowerShellStartSourceWithoutShimHandling, windowsSshStartSource());
    changed = true;
  } else if (patched.includes("codexWindowsSshProbeResult")) {
    // Already has the Windows bootstrap branch; avoid duplicating it during helper upgrades.
  } else if (usesV2SshShape && patched.includes(startNeedleV2)) {
    patched = patched.replace(startNeedleV2, `${startNeedleV2}${windowsSshGuardSourceV2()}`);
    changed = true;
  } else if (patched.includes(startNeedle)) {
    patched = patched.replace(startNeedle, `${startNeedle}${windowsSshGuardSource()}`);
    changed = true;
  } else {
    const genericStartRegex =
      /async startRemoteAppServer\(([A-Za-z_$][\w$]*)\)\{let ([A-Za-z_$][\w$]*)=eg\(\),([A-Za-z_$][\w$]*);/u;
    const match = patched.match(genericStartRegex);
    if (match == null) {
      console.warn("WARN: Could not find SSH startRemoteAppServer shape - skipping Windows SSH remote bootstrap patch");
    } else {
      patched = patched.replace(match[0], `${match[0]}${windowsSshGuardSource()}`);
      changed = true;
    }
  }

  const proxyNeedle = "createSshProxyStream(e){";
  const oldTransportMethods = oldWindowsSshTransportMethodsSource();
  const oldCurrentTransportMethods = windowsSshTransportMethodsSource();
  const transportMethodsRegex =
    /async getCodexWindowsSshLocalPort\(\)\{return await new Promise[\s\S]*?async connectCodexWindowsSshRemote\(e\)\{[\s\S]*?new t\.mn\(s\)\}/u;
  const transportMethodsRegexV2 =
    /async getCodexWindowsSshLocalPort\(\)\{return await new Promise[\s\S]*?async connectCodexWindowsSshRemote\(e\)\{[\s\S]*?new n\.vn\(s\)\}/u;
  if (patched.includes("openCodexWindowsSshWebSocket")) {
    if (usesV2SshShape && transportMethodsRegex.test(patched)) {
      patched = patched.replace(transportMethodsRegex, windowsSshTransportMethodsSourceV2());
    } else if (usesV2SshShape && transportMethodsRegexV2.test(patched)) {
      patched = patched.replace(transportMethodsRegexV2, windowsSshTransportMethodsSourceV2());
    } else {
      patched = patched
        .replace(
          "let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1});try{return await new Promise",
          "let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1});s.on?.(`error`,()=>{});try{return await new Promise",
        )
        .replace(
          "d(),s.terminate?.(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))",
          "d(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))",
        )
        .replace(
          "d();try{s.terminate?.()}catch{}l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))",
          "d(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))",
        )
        .replace("o=c,s.terminate?.();if(Date.now()>=a)", "o=c;if(Date.now()>=a)")
        .replace("o=c;try{s.terminate?.()}catch{}if(Date.now()>=a)", "o=c;if(Date.now()>=a)");
    }
    changed = patched !== source;
  } else if (patched.includes(oldTransportMethods)) {
    patched = patched.replace(oldTransportMethods, windowsSshTransportMethodsSource());
    changed = true;
  } else if (usesV2SshShape && patched.includes(oldCurrentTransportMethods)) {
    patched = patched.replace(oldCurrentTransportMethods, windowsSshTransportMethodsSourceV2());
    changed = true;
  } else if (usesV2SshShape && patched.includes(proxyNeedle)) {
    patched = patched.replace(proxyNeedle, `${windowsSshTransportMethodsSourceV2()}${proxyNeedle}`);
    changed = true;
  } else if (patched.includes(proxyNeedle)) {
    patched = patched.replace(proxyNeedle, `${windowsSshTransportMethodsSource()}${proxyNeedle}`);
    changed = true;
  } else {
    console.warn("WARN: Could not find SSH proxy method shape - skipping Windows SSH remote transport patch");
  }

  const terminalPatched = applyWindowsSshRemoteTerminalPatch(patched);
  return changed || terminalPatched !== patched ? terminalPatched : source;
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
  applyWindowsSshRemoteTerminalPatch,
  applyWindowsSshRemoteGuardPatch,
  patchBundles,
};
