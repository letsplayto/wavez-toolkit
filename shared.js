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
