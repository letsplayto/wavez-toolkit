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

function themeApply() {
  const s = themeSettings;
  const own = Object.prototype.hasOwnProperty.call(s.roomThemes || {}, themeSlug);
  const id = own ? s.roomThemes[themeSlug] : s.activeTheme;
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
themeLoad();
