// Applies the chosen theme to the wavez.fm page (isolated world). Local only: nothing is sent anywhere.
let themeSlug = "";
let themeSettings = { ...THEME_DEFAULTS };
function themeSetRoom(slug) {
  slug = String(slug || "");
  if (slug !== themeSlug) { themeSlug = slug; themeApply(); }
}

const themeStyle = document.createElement("style");
themeStyle.id = "wavez-toolkit-theme";

function themeMount() {
  const parent = document.head || document.documentElement;
  if (parent && themeStyle.parentNode !== parent) parent.appendChild(themeStyle);
}

function themePick(s) {
  if (Object.prototype.hasOwnProperty.call(s.roomThemes || {}, themeSlug)) return s.roomThemes[themeSlug];
  if (s.themeSchedule === "system") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? s.themeNight : s.themeDay;
  }
  if (s.themeSchedule === "time") return inTimeWindow(s.themeNightFrom, s.themeNightTo) ? s.themeNight : s.themeDay;
  return s.activeTheme;
}

function themeApply() {
  const s = themeSettings;
  const id = themePick(s);
  const t = s.themeEnabled && id && id !== "off" ? findTheme(s, id) : null;
  themeStyle.textContent = t ? buildThemeCss(t) : "";
  themeMount();
}

async function themeLoad() {
  themeSettings = await browser.storage.local.get(THEME_DEFAULTS);
  themeApply();
}

browser.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && Object.keys(ch).some((k) => k in THEME_DEFAULTS)) themeLoad();
});
setInterval(themeMount, 2000);
setInterval(themeApply, 60000); // re-check the day/night schedule
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", themeApply);
}
themeLoad();
