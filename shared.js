const DEFAULTS = {
  autoWoot: false,
  voteAfterSec: 0,       // wait this long into a track before auto-voting
  autoJoin: false,       // keep yourself in the DJ queue
  blockAction: "off",    // off | meh | mute
  blocklist: [],         // keywords matched in title/artist; "dj:name" matches the DJ
  notifyTrack: false,    // desktop notification on new track (tab hidden only)
  notifyMention: true,   // desktop notification on @mention (tab hidden only)
  notifyUpNext: true,    // desktop notification when you're next to DJ
  alertWords: [],        // extra chat keywords to notify on (tab hidden only)
  hotkeys: true,         // Alt+Shift+W woot, +M meh, +S mute toggle, +Q join/leave queue
  fadeInSec: 0,          // ramp volume up over N seconds at each new track (0 = off)
  afkEnabled: false,     // auto-reply to @mentions while away
  afkMessage: "I'm away right now, back soon.",
  wootScope: "all",      // all | following (only auto-woot DJs you follow)
  panelTheme: "dark",    // dark | light | auto

  // Grab, favorites and smarter voting
  autoGrab: false,       // grab tracks automatically (only works if the site's extension API offers a grab action)
  grabMode: "all",       // all | voted (only tracks you wooted) | starred | minwoots
  grabMinWoots: 5,       // used by grabMode "minwoots"
  crowdWoots: 0,         // auto-woot waits until the track has this many woots (0 = off)
  favorites: [],         // starred tracks: [{k, title, artist, ts}]
  wootDjs: [],           // DJs you always woot (even with auto-woot off); usernames
  upNextSpots: 1,        // notify when you're this many spots (or fewer) from the front of the queue
  tabTitle: false,       // show the current track in the browser tab title
  roomOverrides: {},     // room slug -> {autoWoot|autoGrab|autoJoin: "on"|"off"}
  autoStar: false,       // add tracks to your starred list automatically (works with or without grab support)
  starMode: "voted",     // voted (tracks you woot) | minwoots | all
  starMinWoots: 5,       // used by starMode "minwoots"
  fetchUpdateLog: true,  // load the update log from GitHub when Options opens (one public text file, no personal data)
  notifyFavorite: true,  // notification when a starred track starts (tab hidden only)
  alertUsers: [],        // notify (tab hidden) when these users chat
  quietEnabled: false,   // suppress all notifications during quiet hours
  quietFrom: "23:00",
  quietTo: "07:00",
  hotkeyKeys: { woot: "W", meh: "M", mute: "S", queue: "Q", grab: "G", star: "F", panel: "P" }, // used with Alt+Shift

  // Mod Assist: detection, alerts, logging and optional chat warnings.
  // Only active when your role in the room is in modRoles. No kick/ban/skip: the official API has none.
  modEnabled: false,
  modRoles: ["owner", "host", "cohost", "co-host", "manager", "moderator", "mod", "bouncer", "admin"],
  modWatch: true,        // flag chat containing modWords
  modWords: [],
  modLinks: true,        // flag links to domains not in modAllowedDomains
  modAllowedDomains: ["youtube.com", "youtu.be", "soundcloud.com", "wavez.fm"],
  modFlood: true,        // flag 5+ msgs in 10s, or the same msg 3x in 30s
  modTracks: true,       // flag tracks matching modTrackWords (or dj:name)
  modTrackWords: [],
  modAutoWarn: false,    // post an [auto-mod] chat warning when something is flagged
  modWarnMessage: "{user} please follow the room rules (no spam or unapproved links).",
  modWelcome: false,     // greet new arrivals
  modWelcomeMessage: "Welcome {user}! Enjoy the music.",
  modNotes: [],          // "username: note", shown when that user is flagged
  modOnlyRooms: []       // room slugs where mod assist may run (empty = every room)
};

// True when "now" falls in the window from..to ("HH:MM"), which may wrap past midnight.
function inTimeWindow(from, to, now) {
  const m = (s) => { const p = /^(\d{1,2}):(\d{2})$/.exec(String(s)); return p ? (+p[1]) * 60 + (+p[2]) : null; };
  const a = m(from), b = m(to);
  if (a == null || b == null || a === b) return false;
  const d = now || new Date(), c = d.getHours() * 60 + d.getMinutes();
  return a < b ? c >= a && c < b : c >= a || c < b;
}

// ---- Local room themes (stored separately from DEFAULTS so they stay out of the page-world settings push) ----
const THEME_DEFAULTS = {
  themeEnabled: false,
  activeTheme: "midnight",  // id of a preset or custom theme
  customThemes: [],         // [{id, name, bg, fg, accent, image, css}]
  roomThemes: {},           // room slug -> theme id, or "off" for no theme in that room
  themeSchedule: "off",     // off | time | system (switch between a day and a night theme)
  themeDay: "paper",
  themeNight: "midnight",
  themeNightFrom: "19:00",
  themeNightTo: "07:00"
};

const PRESET_THEMES = [
  { id: "midnight", name: "Midnight", bg: "#0b1020", fg: "#e6e9f5", accent: "#7c9cff", image: "", css: "" },
  { id: "sunset",   name: "Sunset",   bg: "#2a1020", fg: "#ffe9e0", accent: "#ff7a59", image: "", css: "" },
  { id: "forest",   name: "Forest",   bg: "#0e1a14", fg: "#e3f2e8", accent: "#4fd18b", image: "", css: "" },
  { id: "neon",     name: "Neon",     bg: "#0a0a0f", fg: "#f0f0ff", accent: "#ff2bd6", image: "", css: "" },
  { id: "paper",    name: "Paper",    bg: "#f6f1e7", fg: "#2b2620", accent: "#b5502e", image: "", css: "" },
  { id: "ocean",    name: "Ocean",    bg: "#06202b", fg: "#dff3fa", accent: "#35c2e8", image: "", css: "" },
  { id: "rose",     name: "Rose",     bg: "#2b1620", fg: "#ffe3ec", accent: "#ff6b9a", image: "", css: "" },
  { id: "mono",     name: "Mono",     bg: "#111111", fg: "#e8e8e8", accent: "#bdbdbd", image: "", css: "" },
  { id: "daylight", name: "Daylight", bg: "#fdf6e3", fg: "#073642", accent: "#268bd2", image: "", css: "" }
];

function findTheme(s, id) {
  return [...(s.customThemes || []), ...PRESET_THEMES].find((t) => t.id === id) || null;
}

// Builds the stylesheet for one theme. Colors must be #rrggbb; the image must be a plain https URL.
function buildThemeCss(t) {
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const bg = hex(t.bg, "#101010"), fg = hex(t.fg, "#eeeeee"), ac = hex(t.accent, "#9d8cff");
  const n = parseInt(bg.slice(1), 16);
  const dark = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
  const img = /^https:\/\/[^\s"'()\\]+$/.test(t.image || "") ? t.image : "";
  const bgImg = img
    ? `background-image:linear-gradient(rgba(0,0,0,${dark ? ".4" : ".1"}),rgba(0,0,0,${dark ? ".4" : ".1"})),url("${img}")!important;` +
      "background-size:cover!important;background-position:center!important;background-attachment:fixed!important;"
    : "";
  return `:root{--wtk-bg:${bg};--wtk-fg:${fg};--wtk-accent:${ac};color-scheme:${dark ? "dark" : "light"}}
html,body{background-color:${bg}!important;color:${fg}!important;${bgImg}}
#root,#__next,#app{background-color:transparent!important}
a{color:${ac}}
::selection{background:${ac};color:${bg}}
*{scrollbar-color:${ac} ${bg};accent-color:${ac}}
${String(t.css || "").slice(0, 5000)}`;
}

function trackKey(title, artist) {
  return String(title ?? "").trim().toLowerCase() + "|" + String(artist ?? "").trim().toLowerCase();
}

// ---- Update log helpers. The log is plain text from GitHub and is only ever displayed as text. ----
function cmpVersion(a, b) {
  const p = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}
// Reads "## 1.2.3" headings followed by "- item" lines (the CHANGELOG.md format).
function parseChangelog(text) {
  const out = [];
  let cur = null;
  String(text).slice(0, 200000).split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    const h = /^##\s+v?(\d+\.\d+\.\d+)\b/.exec(line);
    if (h) { cur = out.length < 30 ? { version: h[1], items: [] } : null; if (cur) out.push(cur); return; }
    const li = /^[-*]\s+(.+)/.exec(line);
    if (cur && li && cur.items.length < 40) cur.items.push(li[1].replace(/[`*_]/g, "").slice(0, 300));
  });
  return out;
}

// ---- Wallpapers, chat look and page targets (picked on the page) ----
const LOOK_DEFAULTS = {
  pageTargets: {},        // role -> CSS selector the user picked on the page (see TARGET_ROLES)
  wallpaper: "none",      // id of a built-in or custom wallpaper, or "none"
  roomWallpapers: {},     // room slug -> wallpaper id, or "off"
  customWallpapers: [],   // [{id, name, image, dim}]
  chatFontPct: 100,       // chat message text size, 70-200 (%)
  chatCompact: false,
  chatHideAvatars: false,
  chatHideTimes: false,
  chatBgOn: false,
  chatBg: "#141414",
  chatBgAlpha: 100,       // 0-100
  chatMentionHighlight: false,
  chatMentionColor: "#ffd54a",
  chatMutedWords: [],     // hide messages containing these
  chatIgnoredUsers: []    // hide messages from these users
};

const TARGET_ROLES = [
  { id: "scene",   label: "Room background",   multi: false },
  { id: "chat",    label: "Chat panel",        multi: false },
  { id: "message", label: "A chat message",    multi: true },
  { id: "avatar",  label: "A chat avatar",     multi: true },
  { id: "time",    label: "A chat timestamp",  multi: true }
];

// Built-in wallpapers are plain CSS gradients, so they work offline.
const PRESET_WALLPAPERS = [
  { id: "aurora",      name: "Aurora",       css: "linear-gradient(135deg,#0b132b 0%,#1c2541 40%,#3a506b 70%,#5bc0be 100%)" },
  { id: "dusk",        name: "Dusk",         css: "linear-gradient(160deg,#1a1033 0%,#4a1942 45%,#c2455e 80%,#f4a259 100%)" },
  { id: "deepspace",   name: "Deep space",   css: "radial-gradient(ellipse at 30% 20%,#1b2a49 0%,#0a0f1f 60%,#04060d 100%)" },
  { id: "forestnight", name: "Forest night", css: "linear-gradient(180deg,#07130e 0%,#0f2a1d 60%,#17432f 100%)" },
  { id: "paperwall",   name: "Paper",        css: "linear-gradient(180deg,#f6f1e7,#e7dfcd)" }
];

// A picked selector ends up inside a stylesheet, so it must not be able to close the rule or add new ones.
function safeSelector(sel) {
  return typeof sel === "string" && /^[^{};@\n\r\t]{1,300}$/.test(sel) && !sel.includes("/*") && !sel.includes("<");
}
function findWallpaper(look, id) {
  return [...PRESET_WALLPAPERS, ...((look && look.customWallpapers) || [])].find((w) => w.id === id) || null;
}
// CSS background-image value for a wallpaper, or "" if it isn't usable.
function wallpaperValue(w) {
  if (!w) return "";
  if (w.css) return w.css;
  const img = String(w.image || "");
  if (!/^https:\/\/[^\s"'()\\]+$/.test(img)) return "";
  const d = Math.min(80, Math.max(0, Number(w.dim) || 0)) / 100;
  return d ? `linear-gradient(rgba(0,0,0,${d}),rgba(0,0,0,${d})),url("${img}")` : `url("${img}")`;
}
function buildLookCss(look, wallpaper) {
  const T = look.pageTargets || {};
  const sel = (r) => (safeSelector(T[r]) ? T[r] : "");
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
  const rgb = (h) => { const n = parseInt(h.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
  const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  let css = "";
  const wp = wallpaperValue(wallpaper);
  if (wp) {
    css += `${sel("scene") || "html,body"}{background-image:${wp}!important;background-size:cover!important;` +
      "background-position:center!important;background-repeat:no-repeat!important}\n";
  }
  if (look.chatBgOn && sel("chat")) {
    css += `${sel("chat")}{background-color:rgba(${rgb(hex(look.chatBg, "#141414"))},${num(look.chatBgAlpha, 0, 100, 100) / 100})!important}\n`;
  }
  const pct = num(look.chatFontPct, 70, 200, 100);
  if (pct !== 100 && sel("message")) css += `${sel("message")}{font-size:${pct}%!important}\n`;
  if (look.chatCompact && sel("message")) {
    css += `${sel("message")}{padding-top:2px!important;padding-bottom:2px!important;margin-top:2px!important;margin-bottom:2px!important;line-height:1.25!important}\n`;
  }
  if (look.chatHideAvatars && sel("avatar")) css += `${sel("avatar")}{display:none!important}\n`;
  if (look.chatHideTimes && sel("time")) css += `${sel("time")}{display:none!important}\n`;
  const mc = hex(look.chatMentionColor, "#ffd54a");
  css += `[data-wtk-mention]{box-shadow:inset 3px 0 0 ${mc}!important;background-color:rgba(${rgb(mc)},.14)!important}\n`;
  css += "[data-wtk-hide]{display:none!important}\n";
  return css;
}
