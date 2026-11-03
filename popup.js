const $ = (id) => document.getElementById(id);
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
$("opts").addEventListener("click", (e) => { e.preventDefault(); browser.runtime.openOptionsPage(); window.close(); });

let status = null;

function renderStatus() {
  const box = $("status");
  box.textContent = "";
  if (!status || !status.inRoom) {
    box.append(el("div", "Open a room on wavez.fm and start listening.", "muted"));
    $("blockArtist").disabled = true;
    return;
  }
  box.append(el("div", status.room, "muted"));
  box.append(el("div", status.title, "title"));
  box.append(el("div", `${status.artist} · DJ ${status.dj}`, "muted"));
  const v = el("div", undefined, "votes");
  v.append(
    el("span", `👍 ${status.woots}`, status.myVote === "woot" ? "mine" : ""),
    el("span", `👎 ${status.mehs}`, status.myVote === "meh" ? "mine" : ""),
    el("span", `❤ ${status.grabs}`, status.grabbed ? "mine" : "")
  );
  box.append(v);
  const notes = [];
  if (status.isDj) notes.push("You're DJing");
  else if (status.queued) notes.push("In queue");
  if (status.muted) notes.push("Muted by blocklist");
  if (notes.length) box.append(el("div", notes.join(" · "), "muted"));
  $("blockArtist").disabled = !status.artist;
}

function bind(id, key, isCheckbox) {
  const n = $(id);
  browser.storage.local.get(DEFAULTS).then((s) => {
    if (isCheckbox) n.checked = !!s[key]; else n.value = s[key];
  });
  n.addEventListener("change", () =>
    browser.storage.local.set({ [key]: isCheckbox ? n.checked : n.value }));
}
bind("autoWoot", "autoWoot", true);
bind("autoGrab", "autoGrab", true);
bind("autoJoin", "autoJoin", true);
bind("blockAction", "blockAction", false);

$("blockArtist").addEventListener("click", async () => {
  if (!status || !status.artist) return;
  const s = await browser.storage.local.get(DEFAULTS);
  const k = status.artist.toLowerCase();
  if (!s.blocklist.includes(k)) s.blocklist.push(k);
  await browser.storage.local.set({ blocklist: s.blocklist });
  $("msg").textContent = s.blockAction === "off"
    ? `Added "${status.artist}". Set the blocklist action to Meh or Mute to use it.`
    : `Added "${status.artist}" to the blocklist.`;
});

async function renderHistory() {
  const { history } = await browser.storage.local.get({ history: [] });
  const box = $("history");
  box.textContent = "";
  if (!history.length) { box.append(el("div", "Tracks you hear will be logged here.", "muted")); return; }
  history.slice(0, 15).forEach((t) => {
    const r = el("div", undefined, "track");
    r.append(el("div", t.title, "title"));
    const mark = (flag, s) => (flag ? s + "*" : s);
    r.append(el("small",
      `${t.artist} · ${mark(t.myVote === "woot", "👍" + t.woots)} ${mark(t.myVote === "meh", "👎" + t.mehs)} ${mark(t.grabbed, "❤" + t.grabs)}`));
    box.append(r);
  });
}

browser.storage.session.get("status").then((r) => { status = r.status || null; renderStatus(); });
browser.storage.onChanged.addListener((ch, area) => {
  if (area === "session" && ch.status) { status = ch.status.newValue || null; renderStatus(); }
  if (area === "local" && ch.history) renderHistory();
});
renderHistory();
