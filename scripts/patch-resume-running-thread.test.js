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

const hiddenLocalFixture = fixture.replace(
  "catch(r){if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;",
  "catch(r){if(/cannot resume running thread/i.test(N(r))){u.current===e&&(f.current=!1);return}if(Qt.error(`Failed to resume conversation`,{safe:{},sensitive:{conversationId:e,error:r}}),u.current!==e)return;",
);

test("exposes cannot resume running thread to the local resume error path", () => {
  const patched = applyLocalConversationThreadPatch(hiddenLocalFixture);

  assert.equal(patched, fixture);
  assert.doesNotMatch(patched, /cannot resume running thread/i);
  assert.equal(applyLocalConversationThreadPatch(patched), patched);
});

test("leaves stock local resume catch unchanged", () => {
  assert.equal(applyLocalConversationThreadPatch(fixture), fixture);
});

test("leaves unrelated source unchanged", () => {
  const source = "function unrelated(){return 1}";
  assert.equal(applyLocalConversationThreadPatch(source), source);
});

test("does not treat already-running resume as terminal in app-main heartbeat", () => {
  const source =
    "function Pk(e){let t=Ce(e).toLowerCase();return t.includes(`no rollout found for thread id`)||t.includes(`cannot resume running thread`)}";
  const patched = applyAppMainPatch(source);

  assert.equal(
    patched,
    "function Pk(e){return Ce(e).toLowerCase().includes(`no rollout found for thread id`)}",
  );
  assert.equal(applyAppMainPatch(patched), patched);
});

test("lets already-running resume reject at the maybe-resume command handler", () => {
  const source =
    '"maybe-resume-conversation":MR(async(e,t)=>{try{await Rt(e,t)}catch(n){if(Ce(n).toLowerCase().includes(`cannot resume running thread`))return;throw n}})';
  const patched = applyAppMainPatch(source);

  assert.equal(patched, '"maybe-resume-conversation":MR(async(e,t)=>{await Rt(e,t)})');
  assert.equal(applyAppMainPatch(patched), patched);
});

test("combined patch exposes already-running resume errors", () => {
  const source = `${hiddenLocalFixture};function Pk(e){let t=Ce(e).toLowerCase();return t.includes(\`no rollout found for thread id\`)||t.includes(\`cannot resume running thread\`)};"maybe-resume-conversation":MR(async(e,t)=>{try{await Rt(e,t)}catch(n){if(Ce(n).toLowerCase().includes(\`cannot resume running thread\`))return;throw n}})`;
  const patched = applyResumeRunningThreadPatch(source);

  assert.match(patched, /Failed to resume conversation/);
  assert.doesNotMatch(patched, /cannot resume running thread/i);
  assert.doesNotMatch(patched, /try\{await Rt\(e,t\)\}catch\(n\)/);
});
