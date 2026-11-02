let chain = Promise.resolve();
const enqueue = (fn) => { chain = chain.then(fn).catch(() => {}); };
const lastNotify = {};
const EMPTY_STATS = { tracks: 0, woots: 0, mehs: 0, grabs: 0, best: null };

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "openOptions") browser.runtime.openOptionsPage();

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
      const update = { history: history.slice(0, 100) };
      if (t.mine) {
        djStats.tracks += 1;
        djStats.woots += t.woots; djStats.mehs += t.mehs; djStats.grabs += t.grabs;
        if (!djStats.best || t.woots > djStats.best.woots) djStats.best = { title: t.title, artist: t.artist, woots: t.woots };
        update.djStats = djStats;
      }
      await browser.storage.local.set(update);
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
      browser.notifications.create({
        type: "basic", iconUrl: browser.runtime.getURL("icon.png"),
        title: `Mod flag: ${msg.user || "unknown"}`, message: msg.reason || " "
      });
    }
  }

  if (msg.type === "notify") {
    const now = Date.now();
    if (now - (lastNotify[msg.id] || 0) < 3000) return;
    lastNotify[msg.id] = now;
    browser.notifications.create({
      type: "basic", iconUrl: browser.runtime.getURL("icon.png"),
      title: msg.title, message: msg.message || " "
    });
  }
});
