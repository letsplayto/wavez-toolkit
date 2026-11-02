const $ = (id) => document.getElementById(id);
const checks = ["autoWoot", "autoJoin", "notifyTrack", "notifyMention", "notifyUpNext", "afkEnabled", "hotkeys",
  "modEnabled", "modWatch", "modLinks", "modFlood", "modTracks", "modAutoWarn", "modWelcome"];
const lists = ["blocklist", "alertWords", "modRoles", "modWords", "modAllowedDomains", "modTrackWords"];
const texts = ["blockAction", "afkMessage", "panelTheme", "wootScope", "modWarnMessage", "modWelcomeMessage"];
const say = (t) => { $("status").textContent = t; };

browser.storage.local.get(DEFAULTS).then((s) => {
  checks.forEach((k) => { $(k).checked = !!s[k]; });
  lists.forEach((k) => { $(k).value = s[k].join("\n"); });
  ["voteAfterSec", "fadeInSec", ...texts].forEach((k) => { $(k).value = s[k]; });
});

$("save").addEventListener("click", async () => {
  const s = {
    voteAfterSec: Math.min(600, Math.max(0, Number($("voteAfterSec").value) || 0)),
    fadeInSec: Math.min(30, Math.max(0, Number($("fadeInSec").value) || 0)),
  };
  texts.forEach((k) => { s[k] = $(k).value.slice(0, 200); });
  checks.forEach((k) => { s[k] = $(k).checked; });
  lists.forEach((k) => { s[k] = $(k).value.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean); });
  s.modAllowedDomains = s.modAllowedDomains.map((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")).filter(Boolean);
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
