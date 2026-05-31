#!/usr/bin/env node
/**
 * patch-win-ssh-remote.js - Add an experimental native Windows SSH transport.
 *
 * Codex Desktop's SSH transport bootstraps a POSIX shell and starts the remote
 * app server with a Unix socket. Native Windows OpenSSH hosts can fail either
 * in the PowerShell bootstrap path or later when the Unix socket transport is
 * unavailable. This patch adds a raw `cmd.exe /c ver` probe before the POSIX
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
const MARKER = "s.on?.(`error`,()=>{});try{return await new Promise";
const REMOTE_WS_PORT = 42817;

function windowsSshGuardSource() {
  return [
    "let codexWindowsSshProbeResult;",
    "try{",
    "let codexWindowsSshProbeProcess=t.Tn({args:[`ssh`,...wg(),...Eg(this.options.sshConnection),`cmd.exe /c ver`],forceSpawnOutsideWsl:!0});",
    "codexWindowsSshProbeResult=await Pg({process:codexWindowsSshProbeProcess,timeoutMs:1e4,timeoutMessage:`SSH: remote Windows probe timed out`});",
    "let codexWindowsSshProbeOutput=`${codexWindowsSshProbeProcess.getStdout().toString(`utf8`)}\\n${codexWindowsSshProbeResult.stderr??``}`;",
    `if(codexWindowsSshProbeResult.code===0&&/Microsoft Windows/i.test(codexWindowsSshProbeOutput)){this.codexWindowsSshRemotePort=${REMOTE_WS_PORT};let codexWindowsSshStartCommand=\`cmd.exe /d /s /c "if not exist \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\" mkdir \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\" & start \\"\\" /b \${r} app-server --listen ws://127.0.0.1:\${this.codexWindowsSshRemotePort} > \\"%USERPROFILE%\\\\.codex\\\\app-server-control\\\\app-server.log\\" 2>&1"\`,codexWindowsSshStartProcess=t.Tn({args:[\`ssh\`,...wg(),...Eg(this.options.sshConnection),codexWindowsSshStartCommand],forceSpawnOutsideWsl:!0}),codexWindowsSshStartResult=await Pg({process:codexWindowsSshStartProcess,timeoutMs:_g.remoteBootstrapCommand,timeoutMessage:\`SSH: remote Windows app-server bootstrap timed out\`});if(codexWindowsSshStartResult.code!==0)throw this.createSshSetupError(\`remote_windows_app_server_start\`,Error(await this.getSshCommandFailureMessage(codexWindowsSshStartResult)));return}`,
    "}catch(e){if(e instanceof t.wn)throw e;this.logger.info(`ssh_websocket_v0.remote_windows_probe_skipped`,{safe:{},sensitive:{error:e,sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port}})}",
  ].join("");
}

function windowsSshTransportMethodsSource() {
  return [
    "async getCodexWindowsSshLocalPort(){return await new Promise((e,t)=>{let n=h.default.createServer();n.once(`error`,t),n.listen(0,`127.0.0.1`,()=>{let r=n.address(),i=typeof r==`object`&&r?r.port:null;n.close(()=>{i==null?t(Error(`Unable to allocate local SSH tunnel port`)):e(i)})})})}",
    "async openCodexWindowsSshWebSocket(e,n,r,i){let a=Date.now()+15e3,o=null;for(;;){let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1});s.on?.(`error`,()=>{});try{return await new Promise((c,l)=>{let u=setTimeout(()=>{d(),l(Error(`Timed out waiting for Windows SSH app-server WebSocket`))},1e3),d=()=>{clearTimeout(u),s.removeListener?.(`open`,c),s.removeListener?.(`error`,f),s.removeListener?.(`close`,m)},f=e=>{d(),l(e instanceof Error?e:Error(String(e)))},m=(e,t)=>{d(),l(Error(`codex app-server websocket closed while opening (code=${e})`))};s.once(`open`,()=>{d(),c(s)}),s.once(`error`,f),s.once(`close`,m)})}catch(c){o=c;if(Date.now()>=a){let a=Tg(i);throw this.createSshSetupError(`remote_windows_app_server_connect`,Error(`Windows SSH app-server WebSocket did not open on ws://127.0.0.1:${n}/rpc via SSH tunnel to 127.0.0.1:${r}${a?`: ${a}`:``}${o instanceof Error?`: ${o.message}`:``}`))}await new Promise(e=>setTimeout(e,500))}}}",
    "async connectCodexWindowsSshRemote(e){let n=await this.getCodexWindowsSshLocalPort(),r=this.codexWindowsSshRemotePort;if(r==null)throw Error(`Missing Windows SSH remote app-server port`);let i=`127.0.0.1:${n}:127.0.0.1:${r}`,a=(0,p.spawn)(`ssh`,[`-N`,...wg(),...Eg(this.options.sshConnection),`-L`,i],{env:t.jr(process.env),stdio:[`ignore`,`ignore`,`pipe`]}),o=``;a.stderr?.on(`data`,e=>{o=`${o}${e.toString(`utf8`)}`.slice(-4e3)});let s=await this.openCodexWindowsSshWebSocket(e,n,r,o),c=()=>{a.kill()};return s.once(`close`,c),s.once(`error`,c),a.on(`close`,(n,r)=>{if(n===0)return;this.logger.warning(`ssh_websocket_v0.windows_tunnel_closed`,{safe:{code:n,signal:r,operation:`app_server_windows_tunnel`,...jg(e.shellEnv),sshPhase:e.phase},sensitive:{sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port,stderr:o}}),s.terminate?.()}),t.fn(s,{onPongTimeout:()=>{s.terminate()}}),new t.mn(s)}",
  ].join("");
}

function oldWindowsSshTransportMethodsSource() {
  return [
    "async getCodexWindowsSshLocalPort(){return await new Promise((e,t)=>{let n=h.default.createServer();n.once(`error`,t),n.listen(0,`127.0.0.1`,()=>{let r=n.address(),i=typeof r==`object`&&r?r.port:null;n.close(()=>{i==null?t(Error(`Unable to allocate local SSH tunnel port`)):e(i)})})})}",
    "async connectCodexWindowsSshRemote(e){let n=await this.getCodexWindowsSshLocalPort(),r=this.codexWindowsSshRemotePort;if(r==null)throw Error(`Missing Windows SSH remote app-server port`);let i=`127.0.0.1:${n}:127.0.0.1:${r}`,a=(0,p.spawn)(`ssh`,[`-N`,...wg(),...Eg(this.options.sshConnection),`-L`,i],{env:t.jr(process.env),stdio:[`ignore`,`ignore`,`pipe`]}),o=``;a.stderr?.on(`data`,e=>{o=`${o}${e.toString(`utf8`)}`.slice(-4e3)}),await new Promise(e=>setTimeout(e,500));let s=new t.pn(`ws://127.0.0.1:${n}/rpc`,{perMessageDeflate:!1}),c=()=>{a.kill()};return s.once(`close`,c),s.once(`error`,c),a.on(`close`,(n,r)=>{if(n===0)return;this.logger.warning(`ssh_websocket_v0.windows_tunnel_closed`,{safe:{code:n,signal:r,operation:`app_server_windows_tunnel`,...jg(e.shellEnv),sshPhase:e.phase},sensitive:{sshAlias:this.options.sshConnection.alias,sshHost:this.options.sshConnection.host,sshPort:this.options.sshConnection.port,stderr:o}}),s.terminate?.()}),t.fn(s,{onPongTimeout:()=>{s.terminate()}}),new t.mn(s)}",
  ].join("");
}

function applyWindowsSshRemoteGuardPatch(source) {
  if (source.includes(MARKER)) return source;

  let patched = source;
  let changed = false;

  const connectNeedle =
    ",await this.ensureRemoteAppServer({phase:`connect`,shellEnv:e.getState()});let n=null,r=new t.pn(vg,{";
  const connectReplacement =
    ";let codexSshConnectContext={phase:`connect`,shellEnv:e.getState()};await this.ensureRemoteAppServer(codexSshConnectContext);if(this.codexWindowsSshRemotePort!=null)return await this.connectCodexWindowsSshRemote(codexSshConnectContext);let n=null,r=new t.pn(vg,{";
  if (patched.includes("connectCodexWindowsSshRemote(codexSshConnectContext)")) {
    // Already has the Windows SSH connect branch; later blocks may still upgrade transport helpers.
  } else if (patched.includes(connectNeedle)) {
    patched = patched.replace(connectNeedle, connectReplacement);
    changed = true;
  } else {
    console.warn("WARN: Could not find SSH connect transport shape - skipping Windows SSH remote connect patch");
  }

  const startNeedle = "async startRemoteAppServer(n){let r=eg(),i;";
  if (patched.includes("codexWindowsSshProbeResult")) {
    // Already has the Windows bootstrap branch; avoid duplicating it during helper upgrades.
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
  if (patched.includes("openCodexWindowsSshWebSocket")) {
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
    changed = patched !== source;
  } else if (patched.includes(oldTransportMethods)) {
    patched = patched.replace(oldTransportMethods, windowsSshTransportMethodsSource());
    changed = true;
  } else if (patched.includes(proxyNeedle)) {
    patched = patched.replace(proxyNeedle, `${windowsSshTransportMethodsSource()}${proxyNeedle}`);
    changed = true;
  } else {
    console.warn("WARN: Could not find SSH proxy method shape - skipping Windows SSH remote transport patch");
  }

  return changed ? patched : source;
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
  applyWindowsSshRemoteGuardPatch,
  patchBundles,
};
