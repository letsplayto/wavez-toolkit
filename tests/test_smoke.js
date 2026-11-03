// Loads the extension scripts against a stub browser/DOM and exercises the settings path. usage: node tests/test_smoke.js [extension dir]
const fs = require("fs"), vm = require("vm"), path = require("path");
const dir = process.argv[2] || ".";
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
process.on("unhandledRejection", (e) => { console.log("UNHANDLED REJECTION:", e && e.stack || e); process.exitCode = 1; });

function node(tag) {
  const n = { tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, listeners: {}, value: "", checked: false, textContent: "", className: "", disabled: false, open: false, isConnected: false,
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; }, contains(c) { return this._s.has(c); } },
    append(...a) { this.children.push(...a); }, appendChild(a) { this.children.push(a); a.isConnected = true; return a; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }, removeEventListener() {},
    attachShadow() { return node("shadow"); }, setAttribute() {}, remove() {}, focus() {},
    getBoundingClientRect() { return { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 }; },
    querySelector() { return node("x"); }, fire(t, ev) { (this.listeners[t] || []).forEach((f) => f({ target: this, preventDefault() {}, ...ev })); },
    click() { this.fire("click"); }, files: [] };
  return n;
}
function env(initial) {
  const store = JSON.parse(JSON.stringify(initial || {})), changed = [], sent = [], ids = {};
  const merge = (d) => { if (typeof d === "string") return { [d]: store[d] }; const o = {}; for (const k of Object.keys(d || {})) o[k] = k in store ? JSON.parse(JSON.stringify(store[k])) : d[k]; return o; };
  const browser = {
    storage: { local: { get: async (d) => merge(d), set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); changed.forEach((f) => f(Object.fromEntries(Object.keys(o).map((k) => [k, { newValue: o[k] }])), "local")); }, remove: async () => {} },
      session: { get: async () => ({}) }, onChanged: { addListener: (f) => changed.push(f) } },
    runtime: { sendMessage: async (m) => { sent.push(m); }, getManifest: () => JSON.parse(read("manifest.json")), getURL: (p) => p, openOptionsPage() {}, onMessage: { addListener() {} } },
    notifications: { create() {}, onClicked: { addListener() {} } }, action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    tabs: { query: async () => [], update: async () => {} }, windows: { update: async () => {} } };
  const posted = [], winH = {};
  const document = { hidden: false, title: "t", body: node("body"), head: node("head"), documentElement: node("html"), activeElement: null,
    createElement: node, createTextNode: (t) => ({ textContent: t }), getElementById: (id) => (ids[id] = ids[id] || node("el:" + id)), addEventListener() {} };
  const win = { addEventListener: (t, f) => { (winH[t] = winH[t] || []).push(f); }, removeEventListener() {}, postMessage: (m) => posted.push(m), matchMedia: () => ({ matches: true, addEventListener() {} }),
    innerWidth: 1000, innerHeight: 800, getComputedStyle: () => ({}) };
  win.window = win;
  const ctx = vm.createContext({ window: win, document, browser, location: { origin: "https://wavez.fm", reload() {} }, navigator: { clipboard: { writeText: async () => {} } },
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, Date, Promise, console, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} }, Blob: function () {},
    FileReader: function () {}, AbortController, fetch: async () => ({ ok: true, text: async () => "## 0.9.0\n- hello" }), confirm: () => true, JSON, Math, Number, String, Object, Array, Set, Map, RegExp, Error });
  const run = (f) => vm.runInContext(read(f), ctx, { filename: f });
  return { store, sent, posted, ids, run, win, winH, document, ctx, browser };
}
const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + (extra || ""))); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // --- content scripts (shared, bridge, panel, theme share one scope) ---
  let e = env({ autoWoot: false });
  try { ["shared.js", "bridge.js", "panel.js", "theme.js"].forEach(e.run); check("content scripts load without throwing", true); }
  catch (err) { check("content scripts load without throwing", false, err.stack.split("\n").slice(0, 3).join(" | ")); }
  await wait(50);
  try {
    vm.runInContext('panelStatus({inRoom:true,room:"R",slug:"r",title:"T",artist:"A",dj:"d",woots:1,mehs:0,grabs:0,myVote:null,grabbed:false,canVote:true,isDj:false,queued:false,listeners:2,muted:false,queuePos:0,etaMs:null,role:"user",isMod:false,grab:"unsupported",sleep:0}); panelStatus({inRoom:false});', e.ctx);
    check("panel renders a status and an empty status", true);
  } catch (err) { check("panel renders a status", false, err.stack.split("\n").slice(0, 3).join(" | ")); }
  // bridge pushes settings to the page when asked
  e.win.postMessage = (m) => e.posted.push(m);
  (e.winH.message || []).forEach((h) => h({ source: e.win, origin: "https://wavez.fm", data: { __wtk: 1, dir: "toExt", type: "ready" } }));
  await wait(50);
  const pushed = e.posted.filter((m) => m.type === "settings").pop();
  check("bridge sends settings to the page", !!pushed && typeof pushed.payload === "object" && "autoWoot" in pushed.payload);
  // turning auto-woot on in storage must reach the page
  e.posted.length = 0;
  await e.browser.storage.local.set({ autoWoot: true });
  await wait(50);
  const pushed2 = e.posted.filter((m) => m.type === "settings").pop();
  check("changing autoWoot in storage re-sends settings with autoWoot true", !!pushed2 && pushed2.payload.autoWoot === true);

  // --- options page: auto-save path ---
  e = env({});
  try { ["shared.js", "options.js"].forEach(e.run); check("options.js loads without throwing", true); }
  catch (err) { check("options.js loads without throwing", false, err.stack.split("\n").slice(0, 3).join(" | ")); }
  await wait(50);
  const o = e.ids;
  o.autoWoot.checked = true; o.autoWoot.fire("change"); await wait(50);
  check("Options: ticking Auto-woot saves autoWoot=true", e.store.autoWoot === true, JSON.stringify(e.store.autoWoot));
  o.wootScope.value = "all"; o.wootScope.fire("change"); await wait(50);
  check("Options: scope select saves", e.store.wootScope === "all");
  o.voteAfterSec.value = "7"; o.voteAfterSec.fire("change"); await wait(50);
  check("Options: number field saves", e.store.voteAfterSec === 7);
  o.save.click(); await wait(100);
  check("Options: Save button writes autoWoot=true and defaults", e.store.autoWoot === true && Array.isArray(e.store.blocklist) && e.store.hotkeyKeys && e.store.hotkeyKeys.woot === "W");

  // --- popup ---
  e = env({});
  try { ["shared.js", "popup.js"].forEach(e.run); check("popup.js loads without throwing", true); }
  catch (err) { check("popup.js loads without throwing", false, err.stack.split("\n").slice(0, 3).join(" | ")); }
  await wait(50);
  e.ids.autoWoot.checked = true; e.ids.autoWoot.fire("change"); await wait(50);
  check("Popup: ticking Auto-woot saves autoWoot=true", e.store.autoWoot === true);

  // --- background ---
  e = env({});
  try { ["shared.js", "background.js"].forEach(e.run); check("background.js loads without throwing", true); }
  catch (err) { check("background.js loads without throwing", false, err.stack.split("\n").slice(0, 3).join(" | ")); }

  console.log(results.every(Boolean) ? "\nall passed" : "\nSOME FAILED");
  process.exit(results.every(Boolean) ? 0 : 1);
})();
