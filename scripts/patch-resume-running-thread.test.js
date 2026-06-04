const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyAppMainPatch,
  applyLocalConversationThreadPatch,
  applyResumeRunningThreadPatch,
} = require("./patch-resume-running-thread");

const fixture = [
  "async function h(e){try{await ze(`maybe-resume-conversation`,{conversationId:e})}",
  "catch(r){if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;",
  "let i=t.get(te,e),a=i==null?!1:await ze(`get-is-conversation-archiving-for-host`,{hostId:i,conversationId:e});",
  "if(i==null||a||!t.get(ct,e)){f.current=!1;return}",
  "rt(t.get(st,e))?.parentThreadId==null&&!f.current&&(t.get(ur).danger(_k(n,r),{id:`resume-task-error-${e}`}),f.current=!0),",
  "d.current??=setTimeout(()=>{d.current=null,m(e=>e+1)},750)}}",
].join("");

test("short-circuits cannot resume running thread before toast and retry", () => {
  const patched = applyLocalConversationThreadPatch(fixture);

  assert.match(patched, /cannot resume running thread/i);
  assert.match(
    patched,
    /catch\(r\)\{if\(\/cannot resume running thread\/i\.test\(N\(r\)\)\)\{u\.current===e&&\(f\.current=!1\);return\}if\(Qt\.error/,
  );
  assert.equal(applyLocalConversationThreadPatch(patched), patched);
});

test("leaves source unchanged when resume catch block is absent", () => {
  const source = "function unrelated(){return 1}";
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    assert.equal(applyLocalConversationThreadPatch(source), source);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /resume catch block/);
});

test("treats already-running resume as terminal in app-main heartbeat", () => {
  const source =
    "function Pk(e){return Ce(e).toLowerCase().includes(`no rollout found for thread id`)}";
  const patched = applyAppMainPatch(source);

  assert.match(patched, /cannot resume running thread/);
  assert.match(patched, /let t=Ce\(e\)\.toLowerCase\(\)/);
  assert.match(patched, /t\.includes\(`no rollout found for thread id`\)\|\|t\.includes\(`cannot resume running thread`\)/);
  assert.equal(applyAppMainPatch(patched), patched);
});

test("swallows already-running resume at the maybe-resume command handler", () => {
  const source = '"maybe-resume-conversation":MR(async(e,t)=>{await Rt(e,t)})';
  const patched = applyAppMainPatch(source);

  assert.match(patched, /try\{await Rt\(e,t\)\}catch\(n\)/);
  assert.match(patched, /Ce\(n\)\.toLowerCase\(\)\.includes\(`cannot resume running thread`\)/);
  assert.match(patched, /throw n/);
  assert.equal(applyAppMainPatch(patched), patched);
});

test("combined patch applies local and app-main shapes", () => {
  const source = `${fixture};function Pk(e){return Ce(e).toLowerCase().includes(\`no rollout found for thread id\`)};"maybe-resume-conversation":MR(async(e,t)=>{await Rt(e,t)})`;
  const patched = applyResumeRunningThreadPatch(source);

  assert.match(patched, /Failed to resume conversation/);
  assert.match(patched, /cannot resume running thread/i);
  assert.match(patched, /try\{await Rt\(e,t\)\}catch\(n\)/);
});
