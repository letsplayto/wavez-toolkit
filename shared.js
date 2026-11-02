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
  modWelcomeMessage: "Welcome {user}! Enjoy the music."
};

// ---- Local room themes (stored separately from DEFAULTS so they stay out of the page-world settings push) ----
const THEME_DEFAULTS = {
  themeEnabled: false,
  activeTheme: "midnight",  // id of a preset or custom theme
  customThemes: [],         // [{id, name, bg, fg, accent, image, css}]
  roomThemes: {}            // room slug -> theme id, or "off" for no theme in that room
};

const PRESET_THEMES = [
  { id: "midnight", name: "Midnight", bg: "#0b1020", fg: "#e6e9f5", accent: "#7c9cff", image: "", css: "" },
  { id: "sunset",   name: "Sunset",   bg: "#2a1020", fg: "#ffe9e0", accent: "#ff7a59", image: "", css: "" },
  { id: "forest",   name: "Forest",   bg: "#0e1a14", fg: "#e3f2e8", accent: "#4fd18b", image: "", css: "" },
  { id: "neon",     name: "Neon",     bg: "#0a0a0f", fg: "#f0f0ff", accent: "#ff2bd6", image: "", css: "" },
  { id: "paper",    name: "Paper",    bg: "#f6f1e7", fg: "#2b2620", accent: "#b5502e", image: "", css: "" }
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
