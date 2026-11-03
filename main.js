// Runs in the page's own world so it can use the official window.WavezFM bridge.
// It never reads or clicks the DOM. Settings/commands come from bridge.js via postMessage.
(() => {
  if (window.__wtkMain) return;
  window.__wtkMain = true;

  const ORIGIN = location.origin;
  const send = (type, payload) =>
    window.postMessage({ __wtk: 1, dir: "toExt", type, payload }, ORIGIN);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Recent API failures, kept so Options > Diagnostics can show them (previously they were silently dropped).
  const errLog = [];
  let diagTimer = null;
  function noteErr(label, e) {
    const msg = String((e && e.message) || e || "error").replace(/\s+/g, " ").slice(0, 120);
    const last = errLog[errLog.length - 1];
    if (last && last.action === label && last.msg === msg) { last.n++; last.ts = Date.now(); }
    else { errLog.push({ ts: Date.now(), action: label, msg, n: 1 }); if (errLog.length > 20) errLog.shift(); }
    if (!diagTimer) diagTimer = setTimeout(() => { diagTimer = null; sendDiag(); }, 2000);
  }
  const call = (fn) => {
    const label = (/api\.(\w+\.\w+)/.exec(String(fn)) || [])[1] || "call";
    try {
      const r = fn();
      if (r && typeof r.then === "function") r.catch((e) => noteErr(label, e));
      return r;
    } catch (e) { noteErr(label, e); return null; }
  };

  const newCur = (key) => ({ key, seenAt: Date.now(), nextAt: 0, delay: 1000, mutedFrom: null, grabAt: 0, grabDelay: 2000, grabTries: 0, starSent: false });
  const CMDS = new Set(["woot", "meh", "toggleMute", "joinLeave", "grab", "sleep15", "sleep30", "sleep60", "sleepOff"]);
  const HK_DEFAULT = { woot: "W", meh: "M", mute: "S", queue: "Q", grab: "G", star: "F", panel: "P" };
  const HK_CMD = { woot: "woot", meh: "meh", mute: "toggleMute", queue: "joinLeave", grab: "grab" };
  const HK_UI = { star: "star", panel: "togglePanel" };

  let S = null;
  let api = null;
  let cur = newCur(null);
  let last = null;
  let lastStatus = "";
  let joinNext = 0;
  let joinDelay = 5000;
  let wasNext = false;
  let manualMuteFrom = null;
  let sleepAt = 0, sleepBase = 0;
  let titleBackup = null;
  let chatKeys = [], diagState = false;
  let fade = null;
  let afkLastAny = 0;
  const afkSeen = new Map();
  const modHist = new Map();
  const warnSeen = new Map();
  let warnAny = 0;
  let knownUsers = null, knownRoom = null, welcomeAny = 0;
  const welcomed = new Set();

  const getState = () => { try { return api ? api.room.getState() : null; } catch { return null; } };

  // ---------- grab (only through an action the official API actually provides) ----------
  let grabState = "idle"; // idle | ok | error | unsupported
  const GRAB_FNS = ["grab", "grabTrack", "grabCurrent"];
  const grabFn = () => {
    const a = api && api.actions;
    return a ? GRAB_FNS.find((k) => typeof a[k] === "function") || null : null;
  };
  function tryGrab() {
    const name = grabFn();
    if (!name) { grabState = "unsupported"; return; }
    try {
      const r = api.actions[name]();
      if (r && typeof r.then === "function") r.then(() => { grabState = "ok"; }, (e) => { grabState = "error"; noteErr("actions." + name, e); });
      else grabState = "ok";
    } catch (e) { grabState = "error"; noteErr("actions." + name, e); }
  }
  const favKey = (pb) => String(pb.title ?? "").trim().toLowerCase() + "|" + String(pb.artist ?? "").trim().toLowerCase();
  const isFav = (pb) => (S.favorites || []).some((f) => f && f.k === favKey(pb));

  // Per-room override ("on"/"off") for a few settings, falling back to the global value.
  function opt(k, st) {
    const ro = S.roomOverrides, slug = st && st.room && st.room.slug;
    const o = ro && slug && Object.prototype.hasOwnProperty.call(ro, slug) ? ro[slug] : null;
    const v = o && o[k];
    return v === "on" ? true : v === "off" ? false : !!S[k];
  }

  // Names only (never values) of what the site's API offers; shown on the Options page to help debugging.
  const apiKeys = (o) => {
    try {
      const out = new Set();
      for (let p = o, i = 0; p && p !== Object.prototype && i < 3; p = Object.getPrototypeOf(p), i++) {
        Object.getOwnPropertyNames(p).forEach((k) => { if (k !== "constructor") out.add(k); });
      }
      return [...out].slice(0, 80);
    } catch { return []; }
  };
  function sendDiag() {
    if (!api) return;
    send("diag", { version: String(api.version), api: apiKeys(api), actions: apiKeys(api.actions),
      room: apiKeys(api.room), state: apiKeys(getState()), chat: chatKeys, errors: errLog.slice() });
  }

  function cancelSleep() {
    if (sleepBase > 0) call(() => api.actions.setVolume(sleepBase));
    sleepAt = 0; sleepBase = 0;
  }
  // Fades the volume out over the last 20 seconds, then mutes (the mute key restores the old volume).
  function sleepStep(st) {
    if (!sleepAt || !st) return;
    const left = sleepAt - Date.now();
    if (left > 20000) return;
    stopFade();
    if (!sleepBase) sleepBase = manualMuteFrom == null && st.volume > 0 ? st.volume : -1;
    if (left > 0) {
      if (sleepBase > 0) call(() => api.actions.setVolume(Math.max(1, Math.round(sleepBase * left / 20000))));
    } else {
      if (sleepBase > 0) { call(() => api.actions.setVolume(0)); manualMuteFrom = sleepBase; }
      sleepAt = 0; sleepBase = 0;
    }
  }
  function titleStep(pb) {
    if (typeof document.title !== "string") return;
    if (S.tabTitle && pb) {
      const want = `▶ ${pb.title} - ${pb.artist}`;
      if (titleBackup == null) titleBackup = document.title;
      if (document.title !== want) document.title = want;
    } else if (titleBackup != null) { document.title = titleBackup; titleBackup = null; }
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__wtk !== 1 || d.dir !== "toPage") return;
    if (d.type === "settings" && d.payload && typeof d.payload === "object") { S = d.payload; tick(); }
    else if (d.type === "cmd" && d.payload && CMDS.has(d.payload.name)) command(d.payload.name);
  });
  send("ready");

  // ---------- helpers ----------
  function isBlocked(pb) {
    if (!S || S.blockAction === "off") return false;
    const hay = `${pb.title} ${pb.artist}`.toLowerCase();
    const dj = String(pb.djUsername || "").toLowerCase();
    return (S.blocklist || []).some((raw) => {
      const k = String(raw).trim().toLowerCase();
      if (!k) return false;
      return k.startsWith("dj:") ? dj === k.slice(3).trim() : hay.includes(k);
    });
  }

  const lc = (v) => String(v ?? "").trim().toLowerCase();
  function isModRole(r) {
    if (!r || !S) return false;
    return (S.modRoles || []).map(lc).includes(lc(r));
  }
  function isModNow(st) {
    const u = st.currentUser;
    return [st.room.viewerRole, u && u.roomRole, u && u.globalRole].some(isModRole);
  }
  const modActive = (st) => !!(S && S.modEnabled && isModNow(st) &&
    (!(S.modOnlyRooms || []).length || S.modOnlyRooms.map(lc).includes(lc(st.room.slug))));
  const reCache = new Map();
  function wordHit(raw, text, lower) {
    const k = String(raw || "").trim();
    if (!k) return false;
    if (k.slice(0, 3).toLowerCase() === "re:") {
      const src = k.slice(3).trim().slice(0, 80);
      if (!src) return false;
      let re = reCache.get(src);
      if (re === undefined) { try { re = new RegExp(src, "i"); } catch { re = null; } reCache.set(src, re); }
      return !!re && re.test(text.slice(0, 500));
    }
    return lower.includes(k.toLowerCase());
  }
  function findUser(st, name) {
    const n = lc(name);
    if (!n || !Array.isArray(st.users)) return null;
    return st.users.find((u) => [u.username, u.displayUsername, u.rawUsername, u.handle].some((x) => lc(x) === n)) || null;
  }
  function trackMatch(list, pb) {
    const hay = `${pb.title} ${pb.artist}`.toLowerCase();
    const dj = lc(pb.djUsername);
    for (const raw of list || []) {
      const k = lc(raw);
      if (!k) continue;
      if (k.startsWith("dj:") ? dj === k.slice(3).trim() : hay.includes(k)) return k;
    }
    return null;
  }
  function badLinkHost(lower) {
    const allowed = (S.modAllowedDomains || []).map(lc).filter(Boolean);
    const re = /\b(?:https?:\/\/|www\.)([a-z0-9.-]+\.[a-z]{2,})/g;
    let mm;
    while ((mm = re.exec(lower))) {
      const host = mm[1].replace(/^www\./, "");
      if (!allowed.some((d) => host === d || host.endsWith("." + d))) return host;
    }
    return null;
  }

  function queueInfo(st) {
    const q = st.queue, u = st.currentUser;
    if (!u || !q || !Array.isArray(q.entries)) return { pos: 0, eta: null };
    const sorted = q.entries
      .filter((e) => e.userId !== q.currentDjId)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
    const i = sorted.findIndex((e) => e.userId === u.id);
    if (i < 0) return { pos: 0, eta: null };
    const w = sorted[i].estimatedWaitMs;
    return { pos: i + 1, eta: typeof w === "number" ? Math.round(w / 15000) * 15000 : null };
  }

  function flushTrack() {
    if (last) send("track", last);
    last = null;
  }

  function restoreVolume(st) {
    if (cur.mutedFrom != null && st && st.volume === 0) {
      const v = cur.mutedFrom;
      call(() => api.actions.setVolume(v));
    }
    cur.mutedFrom = null;
  }

  function attempt(type) {
    const now = Date.now();
    if (now < cur.nextAt) return;
    cur.nextAt = now + cur.delay;
    cur.delay = Math.min(cur.delay * 2, 15000);
    call(() => api.actions.vote(type));
  }

  // ---------- fade-in ----------
  function setFadeVol(v) {
    fade.sets.push(v);
    if (fade.sets.length > 3) fade.sets.shift();
    call(() => api.actions.setVolume(v));
  }
  function stopFade() {
    if (fade && fade.timer) clearInterval(fade.timer);
    fade = null;
  }
  function fadeStep() {
    if (!fade || !api) return stopFade();
    if (cur.mutedFrom != null || manualMuteFrom != null) return stopFade();
    const st = getState();
    if (!st) return stopFade();
    // If the volume is nowhere near what we last set, the user took over.
    if (fade.sets.length >= 2 && !fade.sets.some((v) => Math.abs(v - st.volume) <= 3)) return stopFade();
    const p = Math.min(1, (Date.now() - fade.t0) / fade.dur);
    setFadeVol(Math.round(fade.target * (0.05 + 0.95 * p)));
    if (p >= 1) stopFade();
  }
  function startFade(base) {
    const dur = (Number(S.fadeInSec) || 0) * 1000;
    if (dur <= 0 || !base || (sleepAt && sleepAt - Date.now() <= 20000)) return;
    fade = { target: base, t0: Date.now(), dur, sets: [], timer: null };
    setFadeVol(Math.max(1, Math.round(base * 0.05)));
    fade.timer = setInterval(fadeStep, 400);
  }

  // ---------- commands (hotkeys + panel buttons) ----------
  function command(name) {
    const st = getState();
    if (!st) return;
    if (name === "woot" || name === "meh") {
      if (st.votes && st.votes.canVote && !st.queue.isCurrentDj) call(() => api.actions.vote(name));
    } else if (name === "sleepOff") {
      cancelSleep();
    } else if (name.startsWith("sleep")) {
      cancelSleep();
      sleepAt = Date.now() + Number(name.slice(5)) * 60000;
    } else if (name === "grab") {
      if (!st.votes.clientGrabbed && !st.queue.isCurrentDj) tryGrab();
    } else if (name === "toggleMute") {
      stopFade();
      if (manualMuteFrom != null) {
        const v = manualMuteFrom;
        manualMuteFrom = null;
        call(() => api.actions.setVolume(v));
      } else if (st.volume > 0) {
        manualMuteFrom = st.volume;
        call(() => api.actions.setVolume(0));
      }
    } else if (name === "joinLeave") {
      call(() => (st.queue.isJoined ? api.actions.leaveQueue() : api.actions.joinQueue()));
    }
  }

  window.addEventListener("keydown", (e) => {
    if (!S || !S.hotkeys || !api || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const keys = Object.assign({}, HK_DEFAULT, S.hotkeyKeys || {});
    const id = Object.keys(keys).find((k) => e.code === "Key" + String(keys[k]).toUpperCase());
    if (!id) return;
    e.preventDefault();
    if (HK_CMD[id]) command(HK_CMD[id]);
    else if (HK_UI[id]) send("ui", { name: HK_UI[id] });
  }, true);

  // ---------- track change ----------
  function onTrackChange(st) {
    flushTrack();
    restoreVolume(st);
    const pb = st.playback;
    const hadFade = fade;
    const base = hadFade ? hadFade.target : st.volume;
    stopFade();
    cur = newCur(pb.playbackKey);
    if (hadFade && !((Number(S.fadeInSec) || 0) > 0)) call(() => api.actions.setVolume(base));
    if (!(isBlocked(pb) && S.blockAction === "mute") && manualMuteFrom == null) startFade(base);
    if (modActive(st) && S.modTracks) {
      const k = trackMatch(S.modTrackWords, pb);
      if (k) send("modflag", { user: String(pb.djUsername || ""), reason: `track matches "${k}"`, text: `${pb.title} - ${pb.artist}` });
    }
    if (S.notifyFavorite && document.hidden && isFav(pb) && !S.notifyTrack) {
      send("notify", { id: "fav", title: "A favorite is playing", message: `${pb.title || ""} - ${pb.artist || ""}` });
    }
    if (S.notifyTrack && document.hidden) {
      send("notify", {
        id: "track",
        title: String(pb.title || "New track"),
        message: `${pb.artist || ""}${pb.djUsername ? " · DJ " + pb.djUsername : ""}`
      });
    }
  }

  function report(st, muted, qi) {
    let status = null;
    if (st && st.playback) {
      const pb = st.playback, v = st.votes;
      status = {
        room: st.room.name, slug: st.room.slug,
        title: pb.title, artist: pb.artist, dj: pb.djUsername,
        woots: v.woots, mehs: v.mehs, grabs: v.grabs,
        myVote: v.clientVote, grabbed: v.clientGrabbed, canVote: v.canVote,
        isDj: st.queue.isCurrentDj, queued: st.queue.isJoined,
        listeners: st.room.activeUsersCount, muted: !!muted,
        grab: grabFn() ? grabState : "unsupported",
        sleep: sleepAt ? Math.max(1, Math.ceil((sleepAt - Date.now()) / 60000)) : 0,
        queuePos: qi ? qi.pos : 0, etaMs: qi ? qi.eta : null,
        role: String(st.room.viewerRole || (st.currentUser && st.currentUser.roomRole) || ""), isMod: isModNow(st)
      };
    }
    const json = JSON.stringify(status);
    if (json !== lastStatus) { lastStatus = json; send("status", status); }
  }

  // ---------- main loop ----------
  function tick() {
    if (!S || !api) return;
    const st = getState();
    sleepStep(st);
    if (st && !diagState) { diagState = true; sendDiag(); }
    if (!st || !st.playback) { flushTrack(); titleStep(null); report(null); return; }
    titleStep(st.playback);

    const pb = st.playback, v = st.votes;
    if (pb.playbackKey !== cur.key) onTrackChange(st);
    if (v.trackId === pb.trackId) {
      last = {
        key: pb.playbackKey, title: pb.title, artist: pb.artist, dj: pb.djUsername,
        woots: v.woots, mehs: v.mehs, grabs: v.grabs,
        myVote: v.clientVote, grabbed: v.clientGrabbed, ts: Date.now(), source: pb.source,
        mine: !!(st.currentUser && pb.djId && pb.djId === st.currentUser.id)
      };
    }

    const blocked = isBlocked(pb);

    if (blocked && S.blockAction === "mute") {
      if (cur.mutedFrom == null && st.volume > 0) {
        cur.mutedFrom = fade ? fade.target : st.volume;
        stopFade();
        call(() => api.actions.setVolume(0));
      }
    } else if (cur.mutedFrom != null) {
      restoreVolume(st);
    }

    const vip = (S.wootDjs || []).map(lc).includes(lc(pb.djUsername));
    const canAct = v.trackId === pb.trackId && v.canVote && !st.queue.isCurrentDj && !v.clientVotePending;
    const waited = Date.now() - cur.seenAt >= (Number(S.voteAfterSec) || 0) * 1000;
    if (canAct && waited && !v.clientVote) {
      if (blocked && S.blockAction === "meh") attempt("meh");
      else if (!blocked && (vip || (opt("autoWoot", st) && v.woots >= (Number(S.crowdWoots) || 0) &&
        (S.wootScope === "following" ? !!(st.social && st.social.isFollowingCurrentDj)
          : S.wootScope === "starred" ? isFav(pb) : true)))) attempt("woot");
    }

    if (opt("autoGrab", st) && v.trackId === pb.trackId && !v.clientGrabbed && !st.queue.isCurrentDj && !blocked &&
        cur.grabTries < 4 && Date.now() >= cur.grabAt) {
      const m = S.grabMode;
      const ok = m === "voted" ? v.clientVote === "woot"
        : m === "starred" ? isFav(pb)
        : m === "minwoots" ? v.woots >= (Number(S.grabMinWoots) || 0) : true;
      if (ok) {
        cur.grabAt = Date.now() + cur.grabDelay;
        cur.grabDelay = Math.min(cur.grabDelay * 2, 15000);
        cur.grabTries++;
        tryGrab();
      }
    }

    if (opt("autoJoin", st)) {
      const q = st.queue;
      if (q.isJoined || q.isCurrentDj) joinDelay = 5000;
      else if (st.permissions.joinQueue && !q.isLocked && !q.isFull && Date.now() >= joinNext) {
        joinNext = Date.now() + joinDelay;
        joinDelay = Math.min(joinDelay * 2, 60000);
        call(() => api.actions.joinQueue());
      }
    }

    // Auto-star: save the track to the local starred list (the add-on's own list, no site action involved).
    if (S.autoStar && pb.title && v.trackId === pb.trackId && !cur.starSent && !st.queue.isCurrentDj && !blocked && !isFav(pb)) {
      const m = S.starMode;
      const ok = m === "all" || (m === "minwoots" ? v.woots >= (Number(S.starMinWoots) || 0) : v.clientVote === "woot");
      if (ok) {
        cur.starSent = true;
        send("autostar", { title: String(pb.title), artist: String(pb.artist || ""), source: String(pb.source || "") });
      }
    }

    // Welcome new arrivals (Mod Assist). Skips the first snapshot and big bursts (reconnects).
    const users = Array.isArray(st.users) ? st.users : [];
    if (knownRoom !== st.room.slug) { knownRoom = st.room.slug; knownUsers = null; welcomed.clear(); }
    if (knownUsers) {
      const me = st.currentUser;
      const fresh = users.filter((u) => !knownUsers.has(u.id) && !(me && u.id === me.id) && lc(u.platformRole) !== "bot");
      if (fresh.length && fresh.length <= 2 && modActive(st) && S.modWelcome && Date.now() - welcomeAny >= 20000) {
        const u = fresh.find((x) => !welcomed.has(x.id));
        if (u) {
          welcomed.add(u.id);
          welcomeAny = Date.now();
          const name = u.displayUsername || u.username;
          const text = String(S.modWelcomeMessage || "Welcome {user}!").replace("{user}", "@" + name).slice(0, 200);
          call(() => api.actions.sendChat(text));
        }
      }
    }
    knownUsers = new Set(users.map((u) => u.id));

    const qi = queueInfo(st);
    const spots = Math.min(20, Math.max(1, Number(S.upNextSpots) || 1));
    if (qi.pos >= 1 && qi.pos <= spots && !st.queue.isCurrentDj) {
      if (!wasNext && S.notifyUpNext) {
        send("notify", { id: "upnext", title: qi.pos === 1 ? "You're up next!" : `You're #${qi.pos} in the queue`,
          message: `${st.room.name}: get your track ready` });
      }
      wasNext = true;
    } else wasNext = false;

    report(st, cur.mutedFrom != null || manualMuteFrom != null, qi);
  }

  // ---------- chat ----------
  function afkReply(from) {
    const now = Date.now();
    if (now - afkLastAny < 30000) return;
    if (now - (afkSeen.get(from) || 0) < 300000) return;
    afkSeen.set(from, now);
    afkLastAny = now;
    const text = "[AFK] " + String(S.afkMessage || "I'm away right now, back soon.").slice(0, 200);
    call(() => api.actions.sendChat(text));
  }

  function warnUser(key, display, reason) {
    const now = Date.now();
    if (now - warnAny < 15000 || now - (warnSeen.get(key) || 0) < 120000) return;
    warnSeen.set(key, now);
    warnAny = now;
    const base = String(S.modWarnMessage || "{user} please follow the room rules.").replace("{user}", "@" + display);
    call(() => api.actions.sendChat(("[auto-mod] " + base).slice(0, 200)));
  }

  function modCheckChat(st, from, text, lower) {
    const f = lc(from);
    if (!f) return;
    const u = findUser(st, f);
    if (u && (isModRole(u.role) || isModRole(u.platformRole) || lc(u.platformRole) === "bot")) return;
    const reasons = [];
    if (S.modWatch) {
      const w = (S.modWords || []).find((k) => wordHit(k, text, lower));
      if (w) reasons.push(`watched word "${String(w).slice(0, 30)}"`);
    }
    if (S.modLinks) {
      const host = badLinkHost(lower);
      if (host) reasons.push(`link to ${host}`);
    }
    if (S.modFlood) {
      const now = Date.now();
      const hist = (modHist.get(f) || []).filter((e) => now - e.t < 30000);
      hist.push({ t: now, text: lower });
      modHist.set(f, hist);
      if (modHist.size > 200) modHist.delete(modHist.keys().next().value);
      const burst = hist.filter((e) => now - e.t < 10000).length;
      const repeats = hist.filter((e) => e.text === lower).length;
      if (burst >= 5) reasons.push(`flooding (${burst} messages in 10s)`);
      else if (repeats >= 3) reasons.push("repeating the same message");
    }
    if (!reasons.length) return;
    const note = (S.modNotes || []).map(String).find((l) => lc(l.split(":")[0]) === f);
    const reason = reasons.join("; ") + (note ? ` [note: ${note.slice(note.indexOf(":") + 1).trim().slice(0, 40)}]` : "");
    send("modflag", { user: from, reason, text: text.slice(0, 120) });
    if (S.modAutoWarn) warnUser(f, u ? (u.displayUsername || u.username) : from, reason);
  }

  // Chat payload shape is not documented, so read it defensively.
  function onChat(m) {
    if (!S || !m || typeof m !== "object") return;
    if (!chatKeys.length) { chatKeys = apiKeys(m).slice(0, 30); sendDiag(); }
    const st = getState();
    const me = st && st.currentUser;
    if (!me) return;
    const text = String(m.content ?? m.text ?? m.message ?? m.body ?? "");
    const from = String(m.username ?? m.user?.username ?? m.displayUsername ?? m.sender?.username ?? "");
    const names = [me.username, me.displayUsername].filter(Boolean).map((s) => String(s).toLowerCase());
    if (names.includes(from.toLowerCase())) return;
    const lower = text.toLowerCase();
    if (lower.startsWith("[afk]") || lower.startsWith("[auto-mod]")) return; // never react to automated messages
    if (modActive(st)) modCheckChat(st, from, text, lower);
    const mention = names.some((n) => lower.includes("@" + n));
    if (mention && S.afkEnabled) afkReply(from.toLowerCase());
    if (!document.hidden) return;
    if (!mention && (S.alertUsers || []).map(lc).includes(lc(from))) {
      send("notify", { id: "alertuser", title: `${from} said`, message: text.slice(0, 200) });
    } else if (mention && S.notifyMention) {
      send("notify", { id: "mention", title: `Mention from ${from || "someone"}`, message: text.slice(0, 200) });
    } else {
      const w = (S.alertWords || []).map((k) => String(k).trim().toLowerCase()).find((k) => k && lower.includes(k));
      if (w) send("notify", { id: "alert", title: `"${w}" in chat`, message: `${from || "someone"}: ${text.slice(0, 180)}` });
    }
  }

  (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const a = window.WavezFM;
      if (a && a.version === "1") { api = a; break; }
      await sleep(100);
    }
    if (!api) return;
    ["playback_changed", "votes_changed", "room_changed", "queue_changed"]
      .forEach((ev) => call(() => api.room.subscribe(ev, tick)));
    call(() => api.room.subscribe("chat_message", onChat));
    setInterval(tick, 1000);
    tick();
  })();
})();
