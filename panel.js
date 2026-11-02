// Floating in-page panel (isolated world, shadow DOM). Uses only textContent.
let pStatus = null;
let panelRender = null;
function panelStatus(s) { pStatus = s; if (panelRender) panelRender(); }

(() => {
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const fmtEta = (ms) => {
    if (ms == null) return "";
    const m = Math.round(ms / 60000);
    return m < 1 ? "<1 min" : `~${m} min`;
  };

  const host = document.createElement("div");
  host.id = "wavez-toolkit-host";
  const root = host.attachShadow({ mode: "open" });

  const style = el("style");
  style.textContent = `
    :host { all: initial; }
    .wrap { --bg:#141414; --fg:#eee; --muted:#999; --line:#333; --btn:#2a2a2a; --link:#9d8cff; --good:#7be0a0;
            position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 13px system-ui, sans-serif; color: var(--fg); }
    .wrap[data-theme="light"] { --bg:#fff; --fg:#1a1a1a; --muted:#666; --line:#ddd; --btn:#f0f0f0; --link:#583cc8; --good:#1c8a4a; }
    .pill { background:#583cc8; color:#fff; border:0; border-radius:20px; padding:8px 14px; cursor:pointer;
            font-weight:600; box-shadow:0 2px 10px rgba(0,0,0,.4); display:block; margin-left:auto; }
    .panel { width:280px; background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:10px 12px;
             box-shadow:0 4px 18px rgba(0,0,0,.45); margin-bottom:8px; max-height:70vh; overflow:auto; }
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; cursor:move; user-select:none; }
    .muted { color:var(--muted); } .title { font-weight:600; } .mine { font-weight:700; color:var(--good); }
    .votes span { margin-right:10px; }
    .row { display:flex; align-items:center; gap:6px; padding:3px 0; }
    .row select, input.txt { margin-left:auto; background:var(--btn); color:var(--fg); border:1px solid var(--line); border-radius:4px; }
    input.txt { width:100%; margin:2px 0; box-sizing:border-box; padding:3px 6px; }
    h3 { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:10px 0 4px; }
    .track { padding:3px 0; border-bottom:1px solid var(--line); }
    .btns { display:flex; gap:4px; margin:6px 0 2px; }
    button.small { background:var(--btn); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:3px 8px; cursor:pointer; }
    button.small:disabled { opacity:.4; cursor:default; }
    .btns button { flex:1; }
    a { color:var(--link); cursor:pointer; }
    .hidden { display:none; }
  `;

  const wrap = el("div", undefined, "wrap");
  const panel = el("div", undefined, "panel");
  const pill = el("button", "Wavez Toolkit", "pill");
  wrap.append(panel, pill);
  root.append(style, wrap);

  const head = el("div", undefined, "head");
  const optsLink = el("a", "Options");
  head.append(el("strong", "Wavez Toolkit ⠿"), optsLink);
  const statusBox = el("div");

  const btns = el("div", undefined, "btns");
  const bWoot = el("button", "👍", "small"), bMeh = el("button", "👎", "small");
  const bMute = el("button", "🔇", "small"), bQueue = el("button", "Queue", "small");
  bWoot.title = "Woot (Alt+Shift+W)"; bMeh.title = "Meh (Alt+Shift+M)";
  bMute.title = "Mute / unmute (Alt+Shift+S)"; bQueue.title = "Join / leave DJ queue (Alt+Shift+Q)";
  btns.append(bWoot, bMeh, bMute, bQueue);

  const check = (label) => {
    const i = el("input"); i.type = "checkbox";
    const r = el("label", undefined, "row"); r.append(i, document.createTextNode(label));
    return { i, r };
  };
  const cWoot = check("Auto-woot"), cJoin = check("Auto-join DJ queue"), cAfk = check("AFK auto-reply");
  const afkMsg = el("input", undefined, "txt"); afkMsg.type = "text"; afkMsg.placeholder = "AFK message"; afkMsg.maxLength = 200;
  const block = el("select");
  [["off", "Off"], ["meh", "Meh"], ["mute", "Mute"]].forEach(([v, t]) => { const o = el("option", t); o.value = v; block.append(o); });
  const rBlock = el("label", undefined, "row"); rBlock.append(document.createTextNode("Blocklist action"), block);
  const blockBtn = el("button", "Block this artist", "small");
  const msg = el("div", "", "muted");
  const statsBox = el("div"), histBox = el("div");
  const cMod = check("Mod assist"), cModWarn = check("Auto-warn in chat"), cModWelcome = check("Welcome new users");
  const modNote = el("div", "", "muted"), modLogBox = el("div");
  const themeSel = el("select");
  const rTheme = el("label", undefined, "row"); rTheme.append(document.createTextNode("This room"), themeSel);
  const themeNote = el("div", "", "muted");
  let themeSlugShown = null;
  panel.append(head, statusBox, btns, cWoot.r, cJoin.r, cAfk.r, afkMsg, rBlock, blockBtn, msg,
    el("h3", "Room theme"), rTheme, themeNote,
    el("h3", "Mod assist"), modNote, cMod.r, cModWarn.r, cModWelcome.r, modLogBox,
    el("h3", "My DJ stats"), statsBox, el("h3", "Recent tracks"), histBox);

  function renderStatus() {
    statusBox.textContent = "";
    const s = pStatus;
    const live = !!(s && s.inRoom);
    [bWoot, bMeh, bMute, bQueue].forEach((b) => { b.disabled = !live; });
    blockBtn.disabled = !(live && s.artist);
    const slugNow = live && s.slug ? s.slug : "";
    if (slugNow !== themeSlugShown) { themeSlugShown = slugNow; renderTheme(); }
    const mod = live && s.isMod;
    [cMod.i, cModWarn.i, cModWelcome.i].forEach((i) => { i.disabled = !mod; });
    modNote.textContent = !live ? "Join a room to check your role."
      : mod ? `Active: you're ${s.role || "a mod"} in this room.`
      : `Off: your role here is "${s.role || "unknown"}", which isn't in your mod roles list (Options).`;
    if (!live) {
      statusBox.append(el("div", "Join a room and a track to see live stats.", "muted"));
      pill.textContent = "Wavez Toolkit";
      return;
    }
    statusBox.append(el("div", s.room, "muted"), el("div", s.title, "title"), el("div", `${s.artist} · DJ ${s.dj}`, "muted"));
    const v = el("div", undefined, "votes");
    v.append(el("span", `👍 ${s.woots}`, s.myVote === "woot" ? "mine" : ""),
      el("span", `👎 ${s.mehs}`, s.myVote === "meh" ? "mine" : ""),
      el("span", `❤ ${s.grabs}`, s.grabbed ? "mine" : ""));
    statusBox.append(v);
    const notes = [];
    if (s.isDj) notes.push("You're DJing");
    else if (s.queuePos > 0) notes.push(`Queue #${s.queuePos}${s.etaMs != null ? " · " + fmtEta(s.etaMs) : ""}`);
    else if (s.queued) notes.push("In queue");
    if (s.muted) notes.push("Muted");
    if (notes.length) statusBox.append(el("div", notes.join(" · "), "muted"));
    bQueue.textContent = s.queued || s.isDj ? "Leave" : "Join";
    pill.textContent = `Wavez 👍 ${s.woots}`;
  }
  panelRender = renderStatus;

  async function renderHistory() {
    const { history } = await browser.storage.local.get({ history: [] });
    histBox.textContent = "";
    if (!history.length) { histBox.append(el("div", "Nothing logged yet.", "muted")); return; }
    history.slice(0, 5).forEach((t) => {
      const r = el("div", undefined, "track");
      r.append(el("div", t.title, "title"), el("div", `${t.artist} · 👍${t.woots} 👎${t.mehs} ❤${t.grabs}`, "muted"));
      histBox.append(r);
    });
  }

  async function renderModLog() {
    const { modLog } = await browser.storage.local.get({ modLog: [] });
    modLogBox.textContent = "";
    if (!modLog.length) return;
    modLogBox.append(el("div", "Latest flags", "muted"));
    modLog.slice(0, 5).forEach((f) => {
      const r = el("div", undefined, "track");
      r.append(el("div", `${f.user}: ${f.reason}`, "title"), el("div", f.text, "muted"));
      modLogBox.append(r);
    });
  }

  async function renderStats() {
    const { djStats } = await browser.storage.local.get({ djStats: null });
    statsBox.textContent = "";
    if (!djStats || !djStats.tracks) { statsBox.append(el("div", "Play a track to start your scoreboard.", "muted")); return; }
    statsBox.append(el("div", `${djStats.tracks} tracks · 👍${djStats.woots} 👎${djStats.mehs} ❤${djStats.grabs}`));
    if (djStats.best) statsBox.append(el("div", `Best: ${djStats.best.title} (👍${djStats.best.woots})`, "muted"));
  }

  async function renderTheme() {
    const s = await browser.storage.local.get(THEME_DEFAULTS);
    themeSel.textContent = "";
    [["", "Use my default"], ["off", "No theme"], ...[...PRESET_THEMES, ...s.customThemes].map((t) => [t.id, t.name])]
      .forEach(([v, t]) => { const o = el("option", t); o.value = v; themeSel.append(o); });
    const own = themeSlugShown && Object.prototype.hasOwnProperty.call(s.roomThemes, themeSlugShown);
    themeSel.value = own ? s.roomThemes[themeSlugShown] : "";
    themeSel.disabled = !themeSlugShown;
    themeNote.textContent = !themeSlugShown ? "Join a room to give it its own theme."
      : s.themeEnabled ? "" : "Themes are off; picking one here turns them on.";
  }

  themeSel.addEventListener("change", async () => {
    if (!themeSlugShown) return;
    const { roomThemes } = await browser.storage.local.get({ roomThemes: {} });
    if (themeSel.value) roomThemes[themeSlugShown] = themeSel.value; else delete roomThemes[themeSlugShown];
    await save(themeSel.value ? { roomThemes, themeEnabled: true } : { roomThemes });
  });

  function applyTheme(t) {
    const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    wrap.dataset.theme = t === "auto" ? (dark ? "dark" : "light") : t === "light" ? "light" : "dark";
  }

  async function loadSettings() {
    const s = await browser.storage.local.get(DEFAULTS);
    cWoot.i.checked = !!s.autoWoot; cJoin.i.checked = !!s.autoJoin; cAfk.i.checked = !!s.afkEnabled;
    cMod.i.checked = !!s.modEnabled; cModWarn.i.checked = !!s.modAutoWarn; cModWelcome.i.checked = !!s.modWelcome;
    if (document.activeElement !== afkMsg) afkMsg.value = s.afkMessage;
    block.value = s.blockAction;
    applyTheme(s.panelTheme);
  }

  const save = (o) => browser.storage.local.set(o);
  cWoot.i.addEventListener("change", () => save({ autoWoot: cWoot.i.checked }));
  cJoin.i.addEventListener("change", () => save({ autoJoin: cJoin.i.checked }));
  cAfk.i.addEventListener("change", () => save({ afkEnabled: cAfk.i.checked }));
  cMod.i.addEventListener("change", () => save({ modEnabled: cMod.i.checked }));
  cModWarn.i.addEventListener("change", () => save({ modAutoWarn: cModWarn.i.checked }));
  cModWelcome.i.addEventListener("change", () => save({ modWelcome: cModWelcome.i.checked }));
  afkMsg.addEventListener("change", () => save({ afkMessage: afkMsg.value.slice(0, 200) }));
  block.addEventListener("change", () => save({ blockAction: block.value }));
  bWoot.addEventListener("click", () => sendCmd("woot"));
  bMeh.addEventListener("click", () => sendCmd("meh"));
  bMute.addEventListener("click", () => sendCmd("toggleMute"));
  bQueue.addEventListener("click", () => sendCmd("joinLeave"));
  optsLink.addEventListener("click", () => browser.runtime.sendMessage({ type: "openOptions" }).catch(() => {}));
  blockBtn.addEventListener("click", async () => {
    if (!pStatus || !pStatus.artist) return;
    const s = await browser.storage.local.get(DEFAULTS);
    const k = pStatus.artist.toLowerCase();
    if (!s.blocklist.includes(k)) s.blocklist.push(k);
    await save({ blocklist: s.blocklist });
    msg.textContent = s.blockAction === "off"
      ? `Added "${pStatus.artist}". Set the action to Meh or Mute to use it.`
      : `Added "${pStatus.artist}" to the blocklist.`;
  });

  // Open/close (pill) and drag (header). Position is anchored left/bottom so the pill stays put.
  pill.addEventListener("click", async () => {
    const open = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !open);
    await save({ panelOpen: open });
  });

  function place(left, bottom) {
    const r = wrap.getBoundingClientRect();
    left = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - r.width));
    bottom = Math.min(Math.max(0, bottom), Math.max(0, window.innerHeight - r.height));
    wrap.style.right = "auto"; wrap.style.left = left + "px"; wrap.style.bottom = bottom + "px";
    return { left, bottom };
  }
  head.addEventListener("pointerdown", (e) => {
    if (e.target === optsLink) return;
    const r = wrap.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, l0 = r.left, b0 = window.innerHeight - r.bottom;
    let pos = null;
    const move = (ev) => { pos = place(l0 + ev.clientX - sx, b0 - (ev.clientY - sy)); };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (pos) save({ panelPos: pos });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    e.preventDefault();
  });

  browser.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    if (ch.history) renderHistory();
    if (ch.djStats) renderStats();
    if (ch.modLog) renderModLog();
    if (Object.keys(ch).some((k) => k in THEME_DEFAULTS)) renderTheme();
    if (Object.keys(ch).some((k) => k in DEFAULTS)) loadSettings();
  });

  browser.storage.local.get({ panelOpen: true, panelPos: null }).then((s) => {
    panel.classList.toggle("hidden", !s.panelOpen);
    if (s.panelPos) setTimeout(() => place(s.panelPos.left, s.panelPos.bottom), 600);
  });
  loadSettings(); renderHistory(); renderStats(); renderModLog(); renderStatus();

  // Mount after the app has hydrated, and re-attach if the SPA removes it.
  const mount = () => { if (document.body && !host.isConnected) document.body.appendChild(host); };
  window.addEventListener("load", () => setTimeout(mount, 500));
  setInterval(mount, 2000);
})();
