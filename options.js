const $ = (id) => document.getElementById(id);
const checks = ["chatCompact", "chatHideAvatars", "chatHideTimes", "chatBgOn", "chatMentionHighlight", "fetchUpdateLog", "autoStar", "autoGrab", "notifyFavorite", "quietEnabled", "autoWoot", "autoJoin", "notifyTrack", "notifyMention", "notifyUpNext", "afkEnabled", "hotkeys",
  "tabTitle", "modEnabled", "modWatch", "modLinks", "modFlood", "modTracks", "modAutoWarn", "modWelcome"];
const rawLists = ["modNotes"]; // kept as typed (not lowercased)
const nums = { voteAfterSec: 600, fadeInSec: 30, grabMinWoots: 9999, starMinWoots: 9999, crowdWoots: 9999, upNextSpots: 20, chatFontPct: 200, chatBgAlpha: 100 };
const NUM_MIN = { upNextSpots: 1, chatFontPct: 70 };
const COLOR_KEYS = ["chatBg", "chatMentionColor"];
const ALLD = { ...DEFAULTS, ...LOOK_DEFAULTS };
const HK = { woot: "hkWoot", meh: "hkMeh", mute: "hkMute", queue: "hkQueue", grab: "hkGrab", star: "hkStar", panel: "hkPanel" };
const lists = ["chatMutedWords", "chatIgnoredUsers", "wootDjs", "alertUsers", "modOnlyRooms", "blocklist", "alertWords", "modRoles", "modWords", "modAllowedDomains", "modTrackWords"];
const texts = ["chatBg", "chatMentionColor", "starMode", "grabMode", "quietFrom", "quietTo", "blockAction", "afkMessage", "panelTheme", "wootScope", "modWarnMessage", "modWelcomeMessage"];
const allKeys = [...checks, ...Object.keys(nums), ...texts, ...lists, ...rawLists];
const say = (t) => { $("status").textContent = t; };

// Lowercase everything except the pattern part of "re:" lines, so escapes like \S keep their meaning.
const lcLine = (l) => (l.slice(0, 3).toLowerCase() === "re:" ? "re:" + l.slice(3).trim() : l.toLowerCase());
const lines = (k) => $(k).value.split("\n").map((l) => l.trim()).filter(Boolean);

function readKey(k) {
  if (checks.includes(k)) return $(k).checked;
  if (k in nums) return Math.min(nums[k], Math.max(NUM_MIN[k] || 0, Number($(k).value) || 0));
  if (texts.includes(k)) {
    const v = $(k).value.slice(0, 200);
    if (COLOR_KEYS.includes(k)) return /^#[0-9a-f]{6}$/i.test(v) ? v : LOOK_DEFAULTS[k];
    return (k === "quietFrom" || k === "quietTo") && !/^\d{2}:\d{2}$/.test(v) ? DEFAULTS[k] : v;
  }
  if (rawLists.includes(k)) return lines(k).map((l) => l.slice(0, 200));
  const a = lines(k).map(lcLine);
  return k === "modAllowedDomains"
    ? a.map((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean) : a;
}
function readHotkeys() {
  const keys = {};
  for (const [cmd, id] of Object.entries(HK)) {
    const v = $(id).value.trim().toUpperCase();
    keys[cmd] = /^[A-Z]$/.test(v) ? v : DEFAULTS.hotkeyKeys[cmd];
  }
  return new Set(Object.values(keys)).size === Object.keys(keys).length ? keys : null;
}

function fillKey(k, s) {
  const e = $(k);
  if (document.activeElement === e) return; // never overwrite what's being typed
  if (checks.includes(k)) e.checked = !!s[k];
  else if (lists.includes(k) || rawLists.includes(k)) e.value = s[k].join("\n");
  else e.value = s[k];
}
function fillHotkeys(s) {
  Object.entries(HK).forEach(([cmd, id]) => {
    if (document.activeElement !== $(id)) $(id).value = (s.hotkeyKeys && s.hotkeyKeys[cmd]) || DEFAULTS.hotkeyKeys[cmd];
  });
}
browser.storage.local.get(ALLD).then((s) => { allKeys.forEach((k) => fillKey(k, s)); fillHotkeys(s); });
// Keep the form in step with changes made elsewhere (the in-page panel, the popup, a restore).
browser.storage.onChanged.addListener((ch, area) => {
  const keys = area === "local" ? Object.keys(ch).filter((k) => k in ALLD) : [];
  if (!keys.length) return;
  browser.storage.local.get(ALLD).then((s) => {
    keys.forEach((k) => { if (allKeys.includes(k)) fillKey(k, s); });
    if (keys.includes("hotkeyKeys")) fillHotkeys(s);
  });
});

// Each field saves only its own setting, shortly after you change it.
const timers = {};
async function saveKey(k) {
  if (k === "hotkeyKeys") {
    const h = readHotkeys();
    if (!h) return say("Each hotkey needs a different letter. Not saved yet.");
    await browser.storage.local.set({ hotkeyKeys: h });
  } else await browser.storage.local.set({ [k]: readKey(k) });
  say("Saved.");
}
function wire(k, ids) {
  ids.forEach((id) => {
    $(id).addEventListener("input", () => { clearTimeout(timers[k]); timers[k] = setTimeout(() => saveKey(k), 700); });
    $(id).addEventListener("change", () => { clearTimeout(timers[k]); saveKey(k); });
  });
}
allKeys.forEach((k) => wire(k, [k]));
wire("hotkeyKeys", Object.values(HK));

$("save").addEventListener("click", async () => {
  const h = readHotkeys();
  if (!h) return say("Each hotkey needs a different letter. Not saved.");
  const s = { hotkeyKeys: h };
  allKeys.forEach((k) => { s[k] = readKey(k); });
  await browser.storage.local.set(s);
  say("Saved.");
});

// Cells starting with = + - @ are prefixed so spreadsheets never run them as formulas.
const cell = (v) => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};

$("export").addEventListener("click", async () => {
  const { history } = await browser.storage.local.get({ history: [] });
  if (!history.length) return say("No history to export yet.");
  const rows = [["time", "title", "artist", "dj", "woots", "mehs", "grabs", "my_vote", "i_grabbed", "i_was_dj", "source"]];
  history.forEach((t) => rows.push([new Date(t.ts).toISOString(), t.title, t.artist, t.dj, t.woots, t.mehs, t.grabs,
    t.myVote || "", t.grabbed ? "yes" : "", t.mine ? "yes" : "", t.source]));
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wavez-history.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  say(`Exported ${history.length} tracks.`);
});

$("clear").addEventListener("click", async () => { await browser.storage.local.set({ history: [] }); say("History cleared."); });
$("resetStats").addEventListener("click", async () => { await browser.storage.local.remove("djStats"); say("DJ stats reset."); });

$("exportMod").addEventListener("click", async () => {
  const { modLog } = await browser.storage.local.get({ modLog: [] });
  if (!modLog.length) return say("No mod flags logged yet.");
  const rows = [["time", "user", "reason", "message"]];
  modLog.forEach((f) => rows.push([new Date(f.ts).toISOString(), f.user, f.reason, f.text]));
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wavez-mod-log.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  say(`Exported ${modLog.length} flags.`);
});
$("clearMod").addEventListener("click", async () => { await browser.storage.local.set({ modLog: [] }); say("Mod log cleared."); });

// ---- Room themes (auto-saved, separate from the main Save button) ----
const themeIds = ["themeName", "themeBg", "themeFg", "themeAccent", "themeImage", "themeCss"];
const addOpt = (sel, v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.append(o); };

function themePreview() {
  const p = $("themePreview");
  p.style.background = $("themeBg").value; p.style.color = $("themeFg").value;
  p.querySelector("span").style.color = $("themeAccent").value;
}
function themeFill(t) {
  $("themeName").value = t.name; $("themeBg").value = t.bg; $("themeFg").value = t.fg;
  $("themeAccent").value = t.accent; $("themeImage").value = t.image || ""; $("themeCss").value = t.css || "";
  themePreview();
}

async function themeInit(editId) {
  const s = await browser.storage.local.get(THEME_DEFAULTS);
  $("themeEnabled").checked = s.themeEnabled;
  ["activeTheme", "themeEdit", "themeBase"].forEach((k) => { $(k).textContent = ""; });
  [...PRESET_THEMES, ...s.customThemes].forEach((t) => addOpt($("activeTheme"), t.id, t.name));
  $("activeTheme").value = findTheme(s, s.activeTheme) ? s.activeTheme : "midnight";
  ["themeDay", "themeNight"].forEach((k) => {
    $(k).textContent = "";
    [...PRESET_THEMES, ...s.customThemes].forEach((t) => addOpt($(k), t.id, t.name));
    $(k).value = findTheme(s, s[k]) ? s[k] : (k === "themeDay" ? "paper" : "midnight");
  });
  $("themeSchedule").value = s.themeSchedule;
  $("themeNightFrom").value = s.themeNightFrom; $("themeNightTo").value = s.themeNightTo;
  addOpt($("themeEdit"), "", "New theme...");
  s.customThemes.forEach((t) => addOpt($("themeEdit"), t.id, t.name));
  addOpt($("themeBase"), "", "Choose...");
  PRESET_THEMES.forEach((t) => addOpt($("themeBase"), t.id, t.name));
  $("themeEdit").value = s.customThemes.some((t) => t.id === editId) ? editId : "";
  themeFill(findTheme(s, $("themeEdit").value) || { ...PRESET_THEMES[0], name: "My theme" });
}

$("themeEnabled").addEventListener("change", () => browser.storage.local.set({ themeEnabled: $("themeEnabled").checked }));
$("activeTheme").addEventListener("change", () => browser.storage.local.set({ activeTheme: $("activeTheme").value }));
$("themeEdit").addEventListener("change", async () => {
  const s = await browser.storage.local.get(THEME_DEFAULTS);
  themeFill(findTheme(s, $("themeEdit").value) || { ...PRESET_THEMES[0], name: "My theme" });
});
$("themeBase").addEventListener("change", () => {
  const p = PRESET_THEMES.find((t) => t.id === $("themeBase").value);
  if (p) themeFill({ ...p, name: $("themeName").value || p.name, image: $("themeImage").value, css: $("themeCss").value });
  $("themeBase").value = "";
});
themeIds.forEach((k) => $(k).addEventListener("input", themePreview));

$("themeSave").addEventListener("click", async () => {
  const image = $("themeImage").value.trim();
  if (image && !/^https:\/\/[^\s"'()\\]+$/.test(image)) return say("Background image must be a plain https:// link.");
  const s = await browser.storage.local.get(THEME_DEFAULTS);
  const id = $("themeEdit").value || "c" + Date.now().toString(36);
  const t = {
    id, name: $("themeName").value.trim().slice(0, 40) || "My theme",
    bg: $("themeBg").value, fg: $("themeFg").value, accent: $("themeAccent").value,
    image, css: $("themeCss").value.slice(0, 5000)
  };
  const i = s.customThemes.findIndex((x) => x.id === id);
  if (i >= 0) s.customThemes[i] = t; else s.customThemes.push(t);
  await browser.storage.local.set({ customThemes: s.customThemes });
  await themeInit(id);
  say(`Saved theme "${t.name}".`);
});

$("themeDelete").addEventListener("click", async () => {
  const id = $("themeEdit").value;
  if (!id) return say("Pick one of your custom themes to delete.");
  const s = await browser.storage.local.get(THEME_DEFAULTS);
  s.customThemes = s.customThemes.filter((t) => t.id !== id);
  Object.keys(s.roomThemes).forEach((k) => { if (s.roomThemes[k] === id) delete s.roomThemes[k]; });
  await browser.storage.local.set({
    customThemes: s.customThemes, roomThemes: s.roomThemes, activeTheme: s.activeTheme === id ? "midnight" : s.activeTheme
  });
  await themeInit("");
  say("Theme deleted.");
});

$("themeClearRooms").addEventListener("click", async () => { await browser.storage.local.set({ roomThemes: {} }); say("Per-room theme choices cleared."); });
themeInit("");

// ---- Theme schedule (auto-saved) ----
["themeSchedule", "themeDay", "themeNight", "themeNightFrom", "themeNightTo"].forEach((k) =>
  $(k).addEventListener("change", () => {
    const v = $(k).value;
    if ((k === "themeNightFrom" || k === "themeNightTo") && !/^\d{2}:\d{2}$/.test(v)) return;
    browser.storage.local.set({ [k]: v });
  }));

// ---- Import / export helpers ----
const HEX = /^#[0-9a-f]{6}$/i;
const IMG = /^https:\/\/[^\s"'()\\]+$/;
function cleanTheme(t, id) {
  if (!t || typeof t !== "object" || !HEX.test(t.bg) || !HEX.test(t.fg) || !HEX.test(t.accent)) return null;
  const image = String(t.image || "").trim();
  return {
    id: id || String(t.id || "").replace(/[^\w-]/g, "").slice(0, 24) || "c" + Date.now().toString(36),
    name: String(t.name || "Imported theme").slice(0, 40),
    bg: t.bg.toLowerCase(), fg: t.fg.toLowerCase(), accent: t.accent.toLowerCase(),
    image: IMG.test(image) ? image : "", css: String(t.css || "").slice(0, 5000)
  };
}
function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const readJson = (file) => new Promise((res, rej) => {
  if (!file || file.size > 2e6) return rej(new Error("File missing or too large."));
  const r = new FileReader();
  r.onload = () => { try { res(JSON.parse(r.result)); } catch { rej(new Error("That file isn't valid JSON.")); } };
  r.onerror = () => rej(new Error("Couldn't read that file."));
  r.readAsText(file);
});

// ---- Theme export / import (import fills the editor; press Save theme to keep it) ----
$("themeExport").addEventListener("click", () => {
  const t = cleanTheme({ name: $("themeName").value, bg: $("themeBg").value, fg: $("themeFg").value,
    accent: $("themeAccent").value, image: $("themeImage").value, css: $("themeCss").value });
  download("wavez-theme-" + t.name.replace(/[^\w-]+/g, "_") + ".json", { type: "wavez-toolkit-theme", ...t, id: undefined });
  say("Theme exported.");
});
$("themeImportBtn").addEventListener("click", () => $("themeImport").click());
$("themeImport").addEventListener("change", async () => {
  try {
    const t = cleanTheme(await readJson($("themeImport").files[0]), "x");
    if (!t) throw new Error("That isn't a valid theme file.");
    $("themeEdit").value = "";
    themeFill(t);
    say(`Loaded "${t.name}". Press Save theme to keep it.`);
  } catch (e) { say(e.message); }
  $("themeImport").value = "";
});

// ---- Backup / restore ----
const ENUMS = {
  grabMode: ["all", "voted", "starred", "minwoots"], starMode: ["voted", "minwoots", "all"], wootScope: ["all", "following", "starred"],
  blockAction: ["off", "meh", "mute"], panelTheme: ["dark", "light", "auto"], themeSchedule: ["off", "time", "system"]
};
function cleanSettings(data) {
  const defs = { ...DEFAULTS, ...THEME_DEFAULTS, ...LOOK_DEFAULTS }, out = {};
  for (const [k, def] of Object.entries(defs)) {
    if (!(k in data)) continue;
    let v = data[k];
    if (Array.isArray(def)) { if (!Array.isArray(v)) continue; }
    else if (typeof v !== typeof def || v === null || Array.isArray(v)) continue;
    if (typeof v === "string") { v = v.slice(0, 5000); if (ENUMS[k] && !ENUMS[k].includes(v)) continue; }
    else if (typeof v === "number") { if (!Number.isFinite(v)) continue; v = Math.min(1e6, Math.max(0, v)); }
    else if (k === "customThemes") v = v.map((t) => cleanTheme(t)).filter(Boolean).slice(0, 50);
    else if (k === "favorites") {
      v = v.filter((f) => f && typeof f.title === "string").slice(0, 500)
        .map((f) => ({ k: trackKey(f.title, f.artist), title: String(f.title).slice(0, 200), artist: String(f.artist || "").slice(0, 200), source: String(f.source || "").slice(0, 20), ts: Number(f.ts) || 0 }));
    } else if (k === "hotkeyKeys") {
      const h = {};
      Object.keys(def).forEach((c) => { h[c] = /^[A-Za-z]$/.test(v[c]) ? v[c].toUpperCase() : def[c]; });
      v = h;
    } else if (k === "roomOverrides") {
      const r = {};
      Object.entries(v).slice(0, 500).forEach(([slug, o]) => {
        if (!o || typeof o !== "object") return;
        const c = {};
        ["autoWoot", "autoGrab", "autoJoin"].forEach((x) => { if (o[x] === "on" || o[x] === "off") c[x] = o[x]; });
        if (Object.keys(c).length) r[slug.slice(0, 80)] = c;
      });
      v = r;
    } else if (k === "customWallpapers") {
      v = v.map((w) => cleanWallpaper(w)).filter(Boolean).slice(0, 50);
    } else if (k === "pageTargets") {
      const t = {};
      TARGET_ROLES.forEach((r) => { if (safeSelector(v[r.id])) t[r.id] = v[r.id]; });
      v = t;
    } else if (k === "roomWallpapers") {
      const r = {};
      Object.entries(v).slice(0, 500).forEach(([slug, id]) => { if (typeof id === "string") r[slug.slice(0, 80)] = id.slice(0, 40); });
      v = r;
    } else if (k === "roomThemes") {
      const r = {};
      Object.entries(v).slice(0, 500).forEach(([slug, id]) => { if (typeof id === "string") r[slug.slice(0, 80)] = id.slice(0, 40); });
      v = r;
    } else if (Array.isArray(v)) v = v.filter((x) => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 2000);
    out[k] = v;
  }
  return out;
}
$("backupExport").addEventListener("click", async () => {
  const data = await browser.storage.local.get({ ...DEFAULTS, ...THEME_DEFAULTS, ...LOOK_DEFAULTS });
  download("wavez-toolkit-settings.json", { type: "wavez-toolkit-backup", version: 1, data });
  say("Settings exported.");
});
$("backupImportBtn").addEventListener("click", () => $("backupImport").click());
$("backupImport").addEventListener("change", async () => {
  try {
    const f = await readJson($("backupImport").files[0]);
    if (!f || f.type !== "wavez-toolkit-backup" || !f.data || typeof f.data !== "object") throw new Error("That isn't a Wavez Toolkit backup.");
    const clean = cleanSettings(f.data);
    await browser.storage.local.set(clean);
    say(`Restored ${Object.keys(clean).length} settings. Reloading...`);
    setTimeout(() => location.reload(), 800);
  } catch (e) { say(e.message); }
  $("backupImport").value = "";
});

// ---- Track history viewer ----
async function renderHist() {
  const { history, favorites } = await browser.storage.local.get({ history: [], favorites: [] });
  const q = $("histSearch").value.trim().toLowerCase();
  const rows = history.filter((t) => !q || `${t.title} ${t.artist} ${t.dj}`.toLowerCase().includes(q));
  const sum = $("histSummary");
  const top = [...history].sort((a, b) => b.woots - a.woots)[0];
  sum.textContent = history.length
    ? `${history.length} tracks logged · you wooted ${history.filter((t) => t.myVote === "woot").length} · grabbed ${history.filter((t) => t.grabbed).length} · ${favorites.length} starred` +
      (top ? ` · most wooted: ${top.title} (${top.woots})` : "")
    : "Nothing logged yet.";
  const byDj = new Map();
  history.forEach((t) => {
    if (!t.dj) return;
    const e = byDj.get(t.dj) || { n: 0, w: 0 };
    e.n++; e.w += t.woots || 0; byDj.set(t.dj, e);
  });
  const topDjs = [...byDj].filter(([, e]) => e.n >= 3).map(([d, e]) => [d, e.w / e.n, e.n]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  $("histInsights").textContent = topDjs.length
    ? "Top DJs by average woots (3+ tracks): " + topDjs.map(([d, a, n]) => `${d} ${a.toFixed(1)} (${n} tracks)`).join(" · ") : "";
  const box = $("histList");
  box.textContent = "";
  rows.slice(0, 100).forEach((t) => {
    const k = trackKey(t.title, t.artist);
    const starred = favorites.some((f) => f.k === k);
    const r = document.createElement("div"); r.className = "hrow";
    const txt = document.createElement("div"); txt.className = "t";
    const a = document.createElement("div"); a.textContent = `${t.title} - ${t.artist}`;
    const b = document.createElement("small");
    b.textContent = `DJ ${t.dj} · 👍${t.woots} 👎${t.mehs} ❤${t.grabs} · ${new Date(t.ts).toLocaleString()}`;
    txt.append(a, b);
    const btn = document.createElement("button");
    btn.textContent = starred ? "★" : "☆"; btn.title = starred ? "Unstar" : "Star";
    btn.addEventListener("click", async () => {
      const { favorites: fv } = await browser.storage.local.get({ favorites: [] });
      const i = fv.findIndex((f) => f.k === k);
      if (i >= 0) fv.splice(i, 1); else fv.unshift({ k, title: t.title, artist: t.artist, ts: Date.now() });
      await browser.storage.local.set({ favorites: fv.slice(0, 500) });
    });
    r.append(txt, btn);
    box.append(r);
  });
  if (history.length && !rows.length) box.textContent = "No matches.";
}
$("histSearch").addEventListener("input", renderHist);
browser.storage.onChanged.addListener((ch, area) => { if (area === "local" && (ch.history || ch.favorites)) renderHist(); });
renderHist();

// ---- Per-room rules and diagnostics ----
$("clearRoomRules").addEventListener("click", async () => { await browser.storage.local.set({ roomOverrides: {} }); say("Per-room rules cleared."); });

$("diagBtn").addEventListener("click", async () => {
  const { diag } = await browser.storage.local.get({ diag: null });
  const out = $("diagOut");
  if (!diag) { out.textContent = "No data yet. Open wavez.fm, join a room, then press this again."; return; }
  const g = ["grab", "grabTrack", "grabCurrent"].find((n) => diag.actions.includes(n));
  const list = (a) => (a.length ? a.join(", ") : "(none seen yet)");
  out.textContent = [
    `Captured ${new Date(diag.ts).toLocaleString()} (API version ${diag.version})`,
    `Grab: ${g ? "available as actions." + g : "no grab action found, so auto-grab can't run"}`,
    `Actions: ${list(diag.actions)}`,
    `Room functions: ${list(diag.room)}`,
    `State fields: ${list(diag.state)}`,
    `Chat message fields: ${list(diag.chat)}`,
    `Recent errors: ${(diag.errors || []).length ? "" : "none"}`,
    ...(diag.errors || []).map((e) => `  ${new Date(e.ts).toLocaleTimeString()}  ${e.action}: ${e.msg}${e.n > 1 ? ` (x${e.n})` : ""}`),
    `API: ${list(diag.api)}`
  ].join("\n");
});
$("diagCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("diagOut").textContent); say("Copied."); } catch { say("Couldn't copy."); }
});

// ---- Starred tracks manager ----
async function renderStars() {
  const { favorites } = await browser.storage.local.get({ favorites: [] });
  const q = $("starSearch").value.trim().toLowerCase();
  $("starCount").textContent = `${favorites.length} starred (the list keeps your newest 500)`;
  const box = $("starList");
  box.textContent = "";
  favorites.filter((f) => !q || `${f.title} ${f.artist}`.toLowerCase().includes(q)).slice(0, 200).forEach((f) => {
    const r = document.createElement("div"); r.className = "hrow";
    const txt = document.createElement("div"); txt.className = "t";
    const a = document.createElement("div"); a.textContent = `${f.title} - ${f.artist}`;
    const b = document.createElement("small");
    b.textContent = [f.source, f.ts ? new Date(f.ts).toLocaleDateString() : ""].filter(Boolean).join(" · ");
    txt.append(a, b);
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.addEventListener("click", async () => {
      const { favorites: fv } = await browser.storage.local.get({ favorites: [] });
      await browser.storage.local.set({ favorites: fv.filter((x) => x.k !== f.k) });
    });
    r.append(txt, btn);
    box.append(r);
  });
}
$("starSearch").addEventListener("input", renderStars);
browser.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.favorites) renderStars(); });
$("starExport").addEventListener("click", async () => {
  const { favorites } = await browser.storage.local.get({ favorites: [] });
  if (!favorites.length) return say("No starred tracks yet.");
  const rows = [["title", "artist", "source", "starred_at"]];
  favorites.forEach((f) => rows.push([f.title, f.artist, f.source || "", f.ts ? new Date(f.ts).toISOString() : ""]));
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wavez-starred.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  say(`Exported ${favorites.length} starred tracks.`);
});
$("starCopy").addEventListener("click", async () => {
  const { favorites } = await browser.storage.local.get({ favorites: [] });
  if (!favorites.length) return say("No starred tracks yet.");
  try { await navigator.clipboard.writeText(favorites.map((f) => `${f.artist} - ${f.title}`).join("\n")); say(`Copied ${favorites.length} tracks.`); }
  catch { say("Couldn't copy."); }
});
$("starClear").addEventListener("click", async () => {
  if (!confirm("Remove all starred tracks? This can't be undone.")) return;
  await browser.storage.local.set({ favorites: [] });
  say("Starred list cleared.");
});
renderStars();

// ---- Test notification and reset ----
$("testNotify").addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "testNotify" }).catch(() => {});
  say("Test notification sent. If you don't see it, check Firefox's and your system's notification settings.");
});
$("resetSettings").addEventListener("click", async () => {
  if (!confirm("Reset all settings to their defaults? Your starred tracks, track history, custom themes and wallpapers, and picked page parts are kept.")) return;
  const d = { ...DEFAULTS, ...THEME_DEFAULTS, ...LOOK_DEFAULTS };
  delete d.favorites; delete d.customThemes; delete d.customWallpapers; delete d.pageTargets;
  await browser.storage.local.set(d);
  say("Settings reset to defaults.");
});

// ---- What's new: the update log, read from GitHub ----
const CHANGELOG_URL = "https://raw.githubusercontent.com/letsplayto/wavez-toolkit/main/CHANGELOG.md";
const WN_MAX_AGE = 6 * 3600 * 1000;

function wnRender(cache, failed, enabled) {
  const cur = browser.runtime.getManifest().version;
  const list = $("wnList"), status = $("wnStatus");
  list.textContent = "";
  const parsed = cache ? parseChangelog(cache.text) : [];
  if (!parsed.length) {
    status.textContent = failed ? "Couldn't reach GitHub, and there's no saved copy yet. Try Refresh later."
      : enabled ? "Loading the update log..." : "The update log isn't loaded. Press Refresh to load it from GitHub.";
    return;
  }
  const latest = parsed.map((p) => p.version).sort(cmpVersion).pop();
  const when = new Date(cache.ts).toLocaleString();
  status.textContent = `You have version ${cur}. ` +
    (cmpVersion(latest, cur) > 0 ? `The log on GitHub lists a newer version (${latest}). ` : "You're up to date with the log. ") +
    (failed ? `Couldn't reach GitHub just now; showing the copy from ${when}.` : `Log loaded ${when}.`);
  parsed.forEach((p, i) => {
    const d = document.createElement("details"); d.className = "wn";
    d.open = i === 0 || p.version === cur;
    const s = document.createElement("summary");
    s.textContent = p.version + (p.version === cur ? " (installed)" : "");
    const ul = document.createElement("ul");
    p.items.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.append(li); });
    d.append(s, ul);
    list.append(d);
  });
}

async function wnLoad(force) {
  const { changelogCache, fetchUpdateLog } = await browser.storage.local.get({ changelogCache: null, fetchUpdateLog: DEFAULTS.fetchUpdateLog });
  let cache = changelogCache && typeof changelogCache.text === "string" ? changelogCache : null;
  let failed = false;
  if (force || (fetchUpdateLog && (!cache || Date.now() - cache.ts > WN_MAX_AGE))) {
    wnRender(cache, false, true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(CHANGELOG_URL, { cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer", signal: ctrl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = (await r.text()).slice(0, 200000);
      if (!parseChangelog(text).length) throw new Error("unreadable");
      cache = { ts: Date.now(), text };
      await browser.storage.local.set({ changelogCache: cache });
    } catch { failed = true; }
    clearTimeout(timer);
  }
  wnRender(cache, failed, fetchUpdateLog);
}
$("wnRefresh").addEventListener("click", () => wnLoad(true));
wnLoad(false);

// ---- Wallpapers (auto-saved) ----
function cleanWallpaper(w) {
  if (!w || typeof w !== "object") return null;
  const image = String(w.image || "").trim();
  if (!IMG.test(image)) return null;
  return {
    id: String(w.id || "").replace(/[^\w-]/g, "").slice(0, 24) || "w" + Date.now().toString(36),
    name: String(w.name || "Wallpaper").slice(0, 40), image,
    dim: Math.min(80, Math.max(0, Number(w.dim) || 0))
  };
}
async function wpInit(editId) {
  const s = await browser.storage.local.get(LOOK_DEFAULTS);
  const wp = $("wallpaper"), ed = $("wpEdit");
  wp.textContent = ""; ed.textContent = "";
  addOpt(wp, "none", "None");
  [...PRESET_WALLPAPERS, ...s.customWallpapers].forEach((w) => addOpt(wp, w.id, w.name));
  wp.value = s.wallpaper === "none" || findWallpaper(s, s.wallpaper) ? s.wallpaper : "none";
  addOpt(ed, "", "New wallpaper...");
  s.customWallpapers.forEach((w) => addOpt(ed, w.id, w.name));
  ed.value = s.customWallpapers.some((w) => w.id === editId) ? editId : "";
  const cur = s.customWallpapers.find((w) => w.id === ed.value);
  $("wpName").value = cur ? cur.name : ""; $("wpImage").value = cur ? cur.image : ""; $("wpDim").value = cur ? cur.dim : 30;
}
$("wallpaper").addEventListener("change", () => browser.storage.local.set({ wallpaper: $("wallpaper").value }));
$("wpEdit").addEventListener("change", () => wpInit($("wpEdit").value));
$("wpSave").addEventListener("click", async () => {
  const w = cleanWallpaper({ id: $("wpEdit").value, name: $("wpName").value.trim() || "My wallpaper", image: $("wpImage").value, dim: $("wpDim").value });
  if (!w) return say("The image must be a plain https:// link.");
  const s = await browser.storage.local.get(LOOK_DEFAULTS);
  const i = s.customWallpapers.findIndex((x) => x.id === w.id);
  if (i >= 0) s.customWallpapers[i] = w; else s.customWallpapers.push(w);
  await browser.storage.local.set({ customWallpapers: s.customWallpapers });
  await wpInit(w.id);
  say(`Saved wallpaper "${w.name}".`);
});
$("wpDelete").addEventListener("click", async () => {
  const id = $("wpEdit").value;
  if (!id) return say("Pick one of your custom wallpapers to delete.");
  const s = await browser.storage.local.get(LOOK_DEFAULTS);
  Object.keys(s.roomWallpapers).forEach((k) => { if (s.roomWallpapers[k] === id) delete s.roomWallpapers[k]; });
  await browser.storage.local.set({
    customWallpapers: s.customWallpapers.filter((w) => w.id !== id), roomWallpapers: s.roomWallpapers,
    wallpaper: s.wallpaper === id ? "none" : s.wallpaper
  });
  await wpInit("");
  say("Wallpaper deleted.");
});
wpInit("");

// ---- Picked page parts (selectors) ----
const TGT_IDS = TARGET_ROLES.map((r) => r.id);
function fillTargets(s) {
  TGT_IDS.forEach((id) => { const e = $("tgt_" + id); if (document.activeElement !== e) e.value = (s.pageTargets || {})[id] || ""; });
}
browser.storage.local.get(LOOK_DEFAULTS).then(fillTargets);
browser.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.pageTargets) browser.storage.local.get(LOOK_DEFAULTS).then(fillTargets);
});
TGT_IDS.forEach((id) => $("tgt_" + id).addEventListener("change", async () => {
  const v = $("tgt_" + id).value.trim();
  if (v && !safeSelector(v)) return say("That selector isn't allowed (no braces, semicolons, @ or line breaks).");
  const { pageTargets } = await browser.storage.local.get({ pageTargets: {} });
  if (v) pageTargets[id] = v; else delete pageTargets[id];
  await browser.storage.local.set({ pageTargets });
  say("Saved.");
}));
$("tgtClear").addEventListener("click", async () => { await browser.storage.local.set({ pageTargets: {} }); say("Picked page parts cleared."); });
