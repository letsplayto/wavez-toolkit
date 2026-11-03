// Floating in-page panel (isolated world, shadow DOM). Uses only textContent.
let pStatus = null;
let panelRender = null;
let panelUi = {}; // hotkey-driven actions, filled in below
function panelStatus(s) { pStatus = s; if (panelRender) panelRender(); }

(() => {
  const sessionStart = Date.now();
  let favs = [], roomOv = {};
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const fmtAgo = (ms) => {
    const m = Math.round(ms / 60000);
    return m < 60 ? `${Math.max(1, m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`;
  };
  let histCache = [];
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
    .panel { width:280px; max-width:calc(100vw - 24px); background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:10px 12px;
             box-shadow:0 4px 18px rgba(0,0,0,.45); margin-bottom:8px; max-height:70vh; overflow:auto; }
    .head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; cursor:move; user-select:none; touch-action:none; }
    .muted { color:var(--muted); } .title { font-weight:600; } .mine { font-weight:700; color:var(--good); }
    .votes span { margin-right:10px; }
    .row { display:flex; align-items:center; gap:6px; padding:3px 0; }
    .row select, input.txt { margin-left:auto; background:var(--btn); color:var(--fg); border:1px solid var(--line); border-radius:4px; }
    input.txt { width:100%; margin:2px 0; box-sizing:border-box; padding:3px 6px; }
    h3.sec { cursor:pointer; user-select:none; }
    h3 { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:10px 0 4px; }
    .track { padding:3px 0; border-bottom:1px solid var(--line); }
    .btns { display:flex; gap:4px; margin:6px 0 2px; }
    button.small { background:var(--btn); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:3px 8px; cursor:pointer; }
    button.small:disabled { opacity:.4; cursor:default; }
    .btns button { flex:1; }
    .btns select { flex:1; min-width:0; background:var(--btn); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:3px; }
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
  const bGrab = el("button", "❤", "small"), bStar = el("button", "☆", "small");
  bGrab.title = "Grab this track (Alt+Shift+G by default)"; bStar.title = "Star / unstar this track (Alt+Shift+F by default)";
  bWoot.title = "Woot (Alt+Shift+W)"; bMeh.title = "Meh (Alt+Shift+M)";
  bMute.title = "Mute / unmute (Alt+Shift+S)"; bQueue.title = "Join / leave DJ queue (Alt+Shift+Q)";
  btns.append(bWoot, bMeh, bGrab, bStar, bMute, bQueue);
  const bCopy = el("button", "Copy track", "small");
  const sleepSel = el("select");
  [["", "Sleep timer..."], ["sleep15", "15 min"], ["sleep30", "30 min"], ["sleep60", "60 min"], ["sleepOff", "Cancel"]]
    .forEach(([v, t]) => { const o = el("option", t); o.value = v; sleepSel.append(o); });
  const btns2 = el("div", undefined, "btns"); btns2.append(bCopy, sleepSel);
  const sleepNote = el("div", "", "muted");

  const check = (label) => {
    const i = el("input"); i.type = "checkbox";
    const r = el("label", undefined, "row"); r.append(i, document.createTextNode(label));
    return { i, r };
  };
  const cWoot = check("Auto-woot"), cJoin = check("Auto-join DJ queue"), cAfk = check("AFK auto-reply"), cGrab = check("Auto-grab tracks"), cStar = check("Auto-star tracks");
  cStar.r.title = "Saves tracks to your starred list inside this add-on. Works even if the site has no grab action.";
  const grabNote = el("div", "", "muted");
  const afkMsg = el("input", undefined, "txt"); afkMsg.type = "text"; afkMsg.placeholder = "AFK message"; afkMsg.maxLength = 200;
  const block = el("select");
  [["off", "Off"], ["meh", "Meh"], ["mute", "Mute"]].forEach(([v, t]) => { const o = el("option", t); o.value = v; block.append(o); });
  const rBlock = el("label", undefined, "row"); rBlock.append(document.createTextNode("Blocklist action"), block);
  const blockBtn = el("button", "Block this artist", "small");
  const msg = el("div", "", "muted");
  const statsBox = el("div"), histBox = el("div"), sessBox = el("div");
  const cMod = check("Mod assist"), cModWarn = check("Auto-warn in chat"), cModWelcome = check("Welcome new users");
  const modNote = el("div", "", "muted"), modLogBox = el("div");
  const themeSel = el("select");
  const rTheme = el("label", undefined, "row"); rTheme.append(document.createTextNode("This room"), themeSel);
  const themeNote = el("div", "", "muted");
  let themeSlugShown = null;
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const ovSel = {};
  const rOv = [["autoWoot", "Auto-woot"], ["autoGrab", "Auto-grab"], ["autoJoin", "Auto-join queue"]].map(([k, t]) => {
    const sel = el("select");
    [["", "Default"], ["on", "On"], ["off", "Off"]].forEach(([v, x]) => { const o = el("option", x); o.value = v; sel.append(o); });
    ovSel[k] = sel;
    const r = el("label", undefined, "row"); r.append(document.createTextNode(t), sel);
    sel.addEventListener("change", async () => {
      if (!themeSlugShown) return;
      const { roomOverrides } = await browser.storage.local.get({ roomOverrides: {} });
      const cur = hasOwn(roomOverrides, themeSlugShown) ? roomOverrides[themeSlugShown] : {};
      if (sel.value) cur[k] = sel.value; else delete cur[k];
      if (Object.keys(cur).length) roomOverrides[themeSlugShown] = cur; else delete roomOverrides[themeSlugShown];
      await browser.storage.local.set({ roomOverrides });
    });
    return r;
  });
  function renderRules() {
    const o = themeSlugShown && hasOwn(roomOv, themeSlugShown) ? roomOv[themeSlugShown] : {};
    Object.keys(ovSel).forEach((k) => { ovSel[k].value = o[k] || ""; ovSel[k].disabled = !themeSlugShown; });
  }
  // ---- Customize page: wallpaper for this room, and the page parts the user picks (room background, chat, ...) ----
  let lookS = { ...LOOK_DEFAULTS };
  const wpSel = el("select");
  const rWp = el("label", undefined, "row"); rWp.append(document.createTextNode("Wallpaper here"), wpSel);
  const wpNote = el("div", "", "muted");
  async function renderWallpaper() {
    wpSel.textContent = "";
    [["", "Use my default"], ["off", "No wallpaper"], ...[...PRESET_WALLPAPERS, ...lookS.customWallpapers].map((w) => [w.id, w.name])]
      .forEach(([v, t]) => { const o = el("option", t); o.value = v; wpSel.append(o); });
    const own = themeSlugShown && hasOwn(lookS.roomWallpapers, themeSlugShown);
    wpSel.value = own ? lookS.roomWallpapers[themeSlugShown] : "";
    wpSel.disabled = !themeSlugShown;
    wpNote.textContent = !(lookS.pageTargets || {}).scene
      ? "Tip: pick the room background below, or wallpapers only paint the page edges." : "";
  }
  wpSel.addEventListener("change", async () => {
    if (!themeSlugShown) return;
    const { roomWallpapers } = await browser.storage.local.get({ roomWallpapers: {} });
    if (wpSel.value) roomWallpapers[themeSlugShown] = wpSel.value; else delete roomWallpapers[themeSlugShown];
    await save({ roomWallpapers });
  });
  const targetCount = (sel) => { if (!safeSelector(sel)) return -1; try { return document.querySelectorAll(sel).length; } catch { return -1; } };
  const tgtRows = TARGET_ROLES.map((r) => {
    const row = el("div", undefined, "row"), stat = el("span", "", "muted");
    stat.style.marginLeft = "auto";
    const bPick = el("button", "Pick", "small"), bClr = el("button", "Clear", "small");
    row.append(el("span", r.label), stat, bPick, bClr);
    bPick.addEventListener("click", async () => {
      wrap.style.visibility = "hidden"; // get the panel out of the way while picking
      let sel = null;
      try { sel = await pickTarget(r.label, r.multi); } finally { wrap.style.visibility = ""; }
      if (!sel) return;
      const { pageTargets } = await browser.storage.local.get({ pageTargets: {} });
      pageTargets[r.id] = sel;
      await save({ pageTargets });
    });
    bClr.addEventListener("click", async () => {
      const { pageTargets } = await browser.storage.local.get({ pageTargets: {} });
      delete pageTargets[r.id];
      await save({ pageTargets });
    });
    return { r, stat, row };
  });
  function renderTargets() {
    tgtRows.forEach(({ r, stat }) => {
      const sel = (lookS.pageTargets || {})[r.id];
      const n = sel ? targetCount(sel) : null;
      stat.textContent = n === null ? "not set" : n < 0 ? "invalid" : n === 0 ? "not found" : n === 1 ? "1 found" : `${n} found`;
    });
  }
  async function loadLook() {
    lookS = await browser.storage.local.get(LOOK_DEFAULTS);
    renderTargets(); renderWallpaper();
  }
  const pickNote = el("div", "Click Pick, then click that part of the page. Chat settings and wallpapers (in Options) use these.", "muted");

  // Collapsible sections; open/closed state is remembered.
  const collapsed = {}, sections = [];
  function section(key, title, ...nodes) {
    const h = el("h3", undefined, "sec"), body = el("div");
    body.append(...nodes);
    const sync = () => {
      body.classList.toggle("hidden", !!collapsed[key]);
      h.textContent = (collapsed[key] ? "▸ " : "▾ ") + title;
    };
    h.addEventListener("click", () => { collapsed[key] = !collapsed[key]; sync(); save({ panelCollapsed: { ...collapsed } }); });
    sections.push(sync);
    sync();
    return [h, body];
  }
  panel.append(head, statusBox, btns, btns2, sleepNote, cWoot.r, cGrab.r, grabNote, cStar.r, cJoin.r, cAfk.r, afkMsg, rBlock, blockBtn, msg,
    ...section("theme", "Room theme", rTheme, themeNote),
    ...section("page", "Customize page", rWp, wpNote, ...tgtRows.map((x) => x.row), pickNote),
    ...section("rules", "Rules for this room", ...rOv),
    ...section("mod", "Mod assist", modNote, cMod.r, cModWarn.r, cModWelcome.r, modLogBox),
    ...section("session", "This session", sessBox),
    ...section("stats", "My DJ stats", statsBox),
    ...section("recent", "Recent tracks", histBox));

  function renderStatus() {
    statusBox.textContent = "";
    const s = pStatus;
    const live = !!(s && s.inRoom);
    [bWoot, bMeh, bMute, bQueue, bStar, bCopy, sleepSel].forEach((b) => { b.disabled = !live; });
    bGrab.disabled = !live || s.grab === "unsupported";
    sleepNote.textContent = live && s.sleep ? `Sleep timer: about ${s.sleep} min left` : "";
    grabNote.textContent = cGrab.i.checked && live && s.grab === "unsupported"
      ? "The site's extension API has no grab action, so auto-grab can't run."
      : cGrab.i.checked && live && s.grab === "error" ? "Grab failed; retrying." : "";
    bStar.textContent = live && favs.some((f) => f.k === trackKey(s.title, s.artist)) ? "★" : "☆";
    blockBtn.disabled = !(live && s.artist);
    const slugNow = live && s.slug ? s.slug : "";
    if (slugNow !== themeSlugShown) { themeSlugShown = slugNow; renderTheme(); renderRules(); renderWallpaper(); }
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
    if (s.woot) statusBox.append(el("div", "Auto-woot: " + s.woot, "muted"));
    if (s.title) {
      const k = trackKey(s.title, s.artist);
      const prev = histCache.filter((t) => trackKey(t.title, t.artist) === k);
      if (prev.length) {
        const last = Math.max(...prev.map((t) => t.ts || 0));
        statusBox.append(el("div", `Heard before: ${prev.length}x, last ${fmtAgo(Date.now() - last)} ago`, "muted"));
      }
    }
    bQueue.textContent = s.queued || s.isDj ? "Leave" : "Join";
    pill.textContent = `Wavez 👍 ${s.woots}`;
  }
  panelRender = renderStatus;

  async function renderHistory() {
    const { history } = await browser.storage.local.get({ history: [] });
    histCache = history; renderStatus();
    histBox.textContent = "";
    const mineNow = history.filter((t) => t.ts >= sessionStart);
    sessBox.textContent = mineNow.length
      ? `${mineNow.length} tracks · you wooted ${mineNow.filter((t) => t.myVote === "woot").length} · grabbed ${mineNow.filter((t) => t.grabbed).length}`
      : "Nothing yet this session.";
    sessBox.className = "muted";
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
    cGrab.i.checked = !!s.autoGrab; cStar.i.checked = !!s.autoStar; favs = Array.isArray(s.favorites) ? s.favorites : [];
    roomOv = s.roomOverrides && typeof s.roomOverrides === "object" ? s.roomOverrides : {}; renderRules();
    cMod.i.checked = !!s.modEnabled; cModWarn.i.checked = !!s.modAutoWarn; cModWelcome.i.checked = !!s.modWelcome;
    if (document.activeElement !== afkMsg) afkMsg.value = s.afkMessage;
    block.value = s.blockAction;
    applyTheme(s.panelTheme);
    renderStatus();
  }

  const save = (o) => browser.storage.local.set(o);
  cWoot.i.addEventListener("change", () => save({ autoWoot: cWoot.i.checked }));
  cJoin.i.addEventListener("change", () => save({ autoJoin: cJoin.i.checked }));
  cAfk.i.addEventListener("change", () => save({ afkEnabled: cAfk.i.checked }));
  cGrab.i.addEventListener("change", () => save({ autoGrab: cGrab.i.checked }));
  cStar.i.addEventListener("change", () => save({ autoStar: cStar.i.checked }));
  async function toggleStar() {
    if (!pStatus || !pStatus.inRoom || !pStatus.title) return;
    const k = trackKey(pStatus.title, pStatus.artist);
    const { favorites } = await browser.storage.local.get({ favorites: [] });
    const i = favorites.findIndex((f) => f.k === k);
    if (i >= 0) favorites.splice(i, 1);
    else favorites.unshift({ k, title: pStatus.title, artist: pStatus.artist, ts: Date.now() });
    await save({ favorites: favorites.slice(0, 500) });
  }
  bGrab.addEventListener("click", () => sendCmd("grab"));
  bCopy.addEventListener("click", async () => {
    if (!pStatus || !pStatus.title) return;
    try { await navigator.clipboard.writeText(`${pStatus.title} - ${pStatus.artist}`); msg.textContent = "Copied."; }
    catch { msg.textContent = "Couldn't copy."; }
  });
  sleepSel.addEventListener("change", () => { if (sleepSel.value) sendCmd(sleepSel.value); sleepSel.value = ""; });
  bStar.addEventListener("click", toggleStar);
  panelUi.star = toggleStar;
  panelUi.togglePanel = () => pill.click();
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
    if (Object.keys(ch).some((k) => k in LOOK_DEFAULTS)) loadLook();
    if (Object.keys(ch).some((k) => k in DEFAULTS)) loadSettings();
  });

  browser.storage.local.get({ panelOpen: true, panelPos: null, panelCollapsed: {} }).then((s) => {
    Object.assign(collapsed, s.panelCollapsed && typeof s.panelCollapsed === "object" ? s.panelCollapsed : {});
    sections.forEach((sync) => sync());
    panel.classList.toggle("hidden", !s.panelOpen);
    if (s.panelPos) setTimeout(() => place(s.panelPos.left, s.panelPos.bottom), 600);
  });
  loadSettings(); renderHistory(); renderStats(); renderModLog(); renderStatus(); loadLook();
  setInterval(renderTargets, 4000); // the page re-renders, so keep the "N found" counts fresh

  // Mount after the app has hydrated, and re-attach if the SPA removes it.
  const mount = () => { if (document.body && !host.isConnected) document.body.appendChild(host); };
  window.addEventListener("load", () => setTimeout(mount, 500));
  setInterval(mount, 2000);
})();
