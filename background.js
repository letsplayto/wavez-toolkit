let chain = Promise.resolve();
const enqueue = (fn) => { chain = chain.then(fn).catch(() => {}); };
const lastNotify = {};
// Notifications go through here so quiet hours apply to all of them.
function notify(title, message) {
  browser.storage.local.get({ quietEnabled: false, quietFrom: "23:00", quietTo: "07:00" }).then((q) => {
    if (q.quietEnabled && inTimeWindow(q.quietFrom, q.quietTo)) return;
    browser.notifications.create({
      type: "basic", iconUrl: browser.runtime.getURL("icon.png"), title, message: message || " "
    });
  }).catch(() => {});
}
const EMPTY_STATS = { tracks: 0, woots: 0, mehs: 0, grabs: 0, best: null };

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "openOptions") browser.runtime.openOptionsPage();

  if (msg.type === "testNotify") {
    browser.notifications.create({
      type: "basic", iconUrl: browser.runtime.getURL("icon.png"),
      title: "Wavez Toolkit", message: "Notifications are working."
    });
  }

  if (msg.type === "status") {
    browser.storage.session.set({ status: { ...msg.status, updated: Date.now() } });
    browser.action.setBadgeBackgroundColor({ color: "#2e9e5b" });
    browser.action.setBadgeText({ text: msg.status.inRoom ? String(msg.status.woots) : "" });
  }

  if (msg.type === "track") {
    enqueue(async () => {
      const { history, djStats } = await browser.storage.local.get({ history: [], djStats: EMPTY_STATS });
      const t = msg.track;
      if (history.some((h) => h.key === t.key)) return;
      history.unshift(t);
      const update = { history: history.slice(0, 500) };
      if (t.mine) {
        djStats.tracks += 1;
        djStats.woots += t.woots; djStats.mehs += t.mehs; djStats.grabs += t.grabs;
        if (!djStats.best || t.woots > djStats.best.woots) djStats.best = { title: t.title, artist: t.artist, woots: t.woots };
        update.djStats = djStats;
      }
      await browser.storage.local.set(update);
    });
  }

  if (msg.type === "autostar" && msg.track) {
    enqueue(async () => {
      const { favorites } = await browser.storage.local.get({ favorites: [] });
      const t = msg.track, k = trackKey(t.title, t.artist);
      if (favorites.some((f) => f.k === k)) return;
      favorites.unshift({ k, title: t.title, artist: t.artist, source: t.source, ts: Date.now() });
      await browser.storage.local.set({ favorites: favorites.slice(0, 500) });
    });
  }

  if (msg.type === "modflag") {
    enqueue(async () => {
      const { modLog } = await browser.storage.local.get({ modLog: [] });
      modLog.unshift({ ts: Date.now(), user: msg.user, reason: msg.reason, text: msg.text });
      await browser.storage.local.set({ modLog: modLog.slice(0, 50) });
    });
    const now = Date.now();
    if (now - (lastNotify.modflag || 0) >= 3000) {
      lastNotify.modflag = now;
      notify(`Mod flag: ${msg.user || "unknown"}`, msg.reason);
    }
  }

  if (msg.type === "notify") {
    const now = Date.now();
    if (now - (lastNotify[msg.id] || 0) < 3000) return;
    lastNotify[msg.id] = now;
    notify(msg.title, msg.message);
  }
});

browser.notifications.onClicked.addListener(async () => {
  try {
    const tabs = await browser.tabs.query({ url: ["https://wavez.fm/*", "https://www.wavez.fm/*"] });
    if (!tabs.length) return;
    tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    await browser.tabs.update(tabs[0].id, { active: true });
    await browser.windows.update(tabs[0].windowId, { focused: true });
  } catch {}
});
