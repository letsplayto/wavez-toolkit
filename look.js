// Applies wallpapers and chat settings to the wavez.fm page (isolated world), using selectors the user picked.
// Everything here is local; the page's own scripts are never touched, only styled and (for hiding) marked.
let lookSlug = "", lookMe = "";
let lookSettings = { ...LOOK_DEFAULTS };
const lookStyle = document.createElement("style");
lookStyle.id = "wavez-toolkit-look";
const lookOwn = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

function lookMount() {
  const parent = document.head || document.documentElement;
  if (parent && lookStyle.parentNode !== parent) parent.appendChild(lookStyle);
}

function lookWallpaper() {
  const s = lookSettings;
  const id = lookOwn(s.roomWallpapers, lookSlug) ? s.roomWallpapers[lookSlug] : s.wallpaper;
  return id && id !== "none" && id !== "off" ? findWallpaper(s, id) : null;
}

// ---- message filtering (muted words, ignored users, @mention highlight) ----
const lookEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lookLc = (v) => String(v ?? "").trim().toLowerCase();
function lookRules() {
  const s = lookSettings;
  return {
    users: (s.chatIgnoredUsers || []).map(lookLc).filter(Boolean).map((u) => new RegExp("^" + lookEsc(u) + "(?![\\w])")),
    words: (s.chatMutedWords || []).map(lookLc).filter(Boolean),
    mention: s.chatMentionHighlight && lookMe ? "@" + lookLc(lookMe) : ""
  };
}
const lookActive = (r) => !!(r.users.length || r.words.length || r.mention);
function lookMessageSel() {
  const sel = (lookSettings.pageTargets || {}).message;
  return safeSelector(sel) ? sel : "";
}
function lookProcess(el, rules) {
  const text = lookLc((el.innerText || el.textContent || "").slice(0, 2000));
  const hide = rules.users.some((re) => re.test(text)) || rules.words.some((w) => text.includes(w));
  el.toggleAttribute("data-wtk-hide", hide);
  el.toggleAttribute("data-wtk-mention", !hide && !!rules.mention && text.includes(rules.mention));
}
function lookClear() {
  document.querySelectorAll("[data-wtk-hide],[data-wtk-mention]").forEach((n) => {
    n.removeAttribute("data-wtk-hide"); n.removeAttribute("data-wtk-mention");
  });
}
function lookRescan() {
  const rules = lookRules(), sel = lookMessageSel();
  if (!sel || !lookActive(rules)) { lookClear(); return; }
  try { document.querySelectorAll(sel).forEach((el) => lookProcess(el, rules)); } catch {}
}

let lookObserver = null, lookPending = new Set(), lookTimer = null;
function lookFlush() {
  lookTimer = null;
  const rules = lookRules(), sel = lookMessageSel();
  const nodes = [...lookPending]; lookPending.clear();
  if (!sel || !lookActive(rules)) return;
  try {
    nodes.forEach((n) => {
      if (!n.isConnected) return;
      if (n.matches(sel)) lookProcess(n, rules);
      n.querySelectorAll(sel).forEach((el) => lookProcess(el, rules));
      const up = n.closest && n.closest(sel); // text appended inside an existing message
      if (up && up !== n) lookProcess(up, rules);
    });
  } catch {}
}
function lookSyncObserver() {
  const want = !!lookMessageSel() && lookActive(lookRules());
  if (want && !lookObserver) {
    lookObserver = new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) lookPending.add(n); });
        if (m.type === "characterData" && m.target.parentElement) lookPending.add(m.target.parentElement);
      });
      if (!lookTimer) lookTimer = setTimeout(lookFlush, 120);
    });
    lookObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } else if (!want && lookObserver) { lookObserver.disconnect(); lookObserver = null; lookPending.clear(); }
}

function lookApply() {
  lookStyle.textContent = buildLookCss(lookSettings, lookWallpaper());
  lookMount();
  lookSyncObserver();
  lookRescan();
}
function lookSetRoom(slug, me) {
  slug = String(slug || ""); me = String(me || "");
  if (slug !== lookSlug || me !== lookMe) { lookSlug = slug; lookMe = me; lookApply(); }
}
async function lookLoad() {
  lookSettings = await browser.storage.local.get(LOOK_DEFAULTS);
  lookApply();
}
browser.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && Object.keys(ch).some((k) => k in LOOK_DEFAULTS)) lookLoad();
});
setInterval(lookMount, 2000);
lookLoad();
