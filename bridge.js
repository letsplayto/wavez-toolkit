// Isolated-world relay between the page-world script and the extension.
const str = (v, n = 200) => String(v ?? "").slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const vote = (v) => (v === "woot" || v === "meh" ? v : null);

const post = (type, payload) =>
  window.postMessage({ __wtk: 1, dir: "toPage", type, payload }, location.origin);

async function pushSettings() {
  post("settings", await browser.storage.local.get(DEFAULTS));
}

function cleanStatus(s) {
  if (!s || typeof s !== "object") return { inRoom: false };
  return {
    inRoom: true, room: str(s.room), slug: str(s.slug, 80),
    title: str(s.title), artist: str(s.artist), dj: str(s.dj, 80),
    woots: num(s.woots), mehs: num(s.mehs), grabs: num(s.grabs),
    myVote: vote(s.myVote), grabbed: !!s.grabbed, canVote: !!s.canVote,
    isDj: !!s.isDj, queued: !!s.queued, listeners: num(s.listeners), muted: !!s.muted,
    queuePos: num(s.queuePos), etaMs: s.etaMs == null ? null : num(s.etaMs),
    role: str(s.role, 40), isMod: !!s.isMod, sleep: num(s.sleep), woot: str(s.woot, 60), me: str(s.me, 60),
    grab: ["idle", "ok", "error", "unsupported"].includes(s.grab) ? s.grab : "idle"
  };
}

function cleanTrack(t) {
  if (!t || typeof t !== "object") return null;
  return {
    key: str(t.key, 120), title: str(t.title), artist: str(t.artist), dj: str(t.dj, 80),
    woots: num(t.woots), mehs: num(t.mehs), grabs: num(t.grabs),
    myVote: vote(t.myVote), grabbed: !!t.grabbed, ts: num(t.ts), source: str(t.source, 20), mine: !!t.mine
  };
}

window.addEventListener("message", (e) => {
  const d = e.data;
  if (e.source !== window || !d || d.__wtk !== 1 || d.dir !== "toExt") return;
  let msg = null;
  if (d.type === "ready") { pushSettings(); return; }
  if (d.type === "status") {
    const cs = cleanStatus(d.payload);
    if (typeof themeSetRoom === "function") themeSetRoom(cs.inRoom ? cs.slug : "");
    if (typeof lookSetRoom === "function") lookSetRoom(cs.inRoom ? cs.slug : "", cs.inRoom ? cs.me : "");
    if (typeof panelStatus === "function") panelStatus(cs);
    msg = { type: "status", status: cs };
  }
  else if (d.type === "diag" && d.payload && typeof d.payload === "object") {
    const names = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && /^[\w$]{1,40}$/.test(x)).slice(0, 80) : []);
    const p = d.payload;
    browser.storage.local.set({ diag: { ts: Date.now(), version: str(p.version, 20), api: names(p.api),
      actions: names(p.actions), room: names(p.room), state: names(p.state), chat: names(p.chat),
      errors: (Array.isArray(p.errors) ? p.errors : []).slice(-20).map((e) => ({ ts: num(e && e.ts), action: str(e && e.action, 40),
        msg: str(e && e.msg, 120), n: num(e && e.n) })) } }).catch(() => {});
    return;
  }
  else if (d.type === "autostar" && d.payload && typeof d.payload === "object") {
    const t = { title: str(d.payload.title, 200), artist: str(d.payload.artist, 200), source: str(d.payload.source, 20) };
    if (t.title) browser.runtime.sendMessage({ type: "autostar", track: t }).catch(() => {});
    return;
  }
  else if (d.type === "ui") {
    const n = d.payload && d.payload.name;
    try { if (n === "star" || n === "togglePanel") panelUi[n](); } catch {}
    return;
  }
  else if (d.type === "track") { const t = cleanTrack(d.payload); if (t) msg = { type: "track", track: t }; }
  else if (d.type === "modflag" && d.payload) {
    msg = { type: "modflag", user: str(d.payload.user, 60), reason: str(d.payload.reason, 120), text: str(d.payload.text, 120) };
  }
  else if (d.type === "notify" && d.payload) {
    msg = { type: "notify", id: str(d.payload.id, 20), title: str(d.payload.title, 100), message: str(d.payload.message, 200) };
  }
  if (msg) browser.runtime.sendMessage(msg).catch(() => {});
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((k) => k in DEFAULTS)) pushSettings();
});
pushSettings();

// Used by panel.js buttons. Main script only accepts a fixed set of command names.
function sendCmd(name) { post("cmd", { name: str(name, 20) }); }
