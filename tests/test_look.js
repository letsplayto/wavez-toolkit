// Runs look.js in real Chromium against a fixture chat page. Skips if Playwright/Chromium is unavailable.
const fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("test_look: playwright not available, skipped"); process.exit(0); }
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let fails = 0;
const check = (name, ok) => { console.log((ok ? "ok   " : "FAIL ") + name); if (!ok) fails++; };

const FIXTURE = `<!doctype html><html><body>
<div id="scene" style="width:400px;height:200px">scene</div>
<div id="chat"><div class="msg"><img class="av" width=10 height=10><b>Alice</b> <span class="t">10:01</span> hello there</div>
<div class="msg"><img class="av" width=10 height=10><b>Spammer</b> <span class="t">10:02</span> buy now</div>
<div class="msg"><img class="av" width=10 height=10><b>Bob</b> <span class="t">10:03</span> hey @Hunter nice</div>
<div class="msg"><img class="av" width=10 height=10><b>Cara</b> <span class="t">10:04</span> badword inside</div></div></body></html>`;
const STUB = `window.__store = {}; window.__listeners = [];
window.browser = { storage: { local: { get: async (d) => ({ ...d, ...window.__store }) },
  onChanged: { addListener: (f) => window.__listeners.push(f) } } };`;

(async () => {
  let browser;
  try { browser = await chromium.launch(); } catch (e) { console.log("test_look: chromium not available, skipped"); process.exit(0); }
  const page = await browser.newPage();
  await page.setContent(FIXTURE);
  await page.addScriptTag({ content: STUB });
  await page.addScriptTag({ content: read("shared.js") });
  // Scripts are classic and share globals, like content scripts do.
  await page.addScriptTag({ content: read("look.js") });
  const set = async (obj) => { await page.evaluate((o) => { Object.assign(window.__store, o); window.__listeners.forEach((f) => f(Object.fromEntries(Object.keys(o).map((k) => [k, {}])), "local")); }, obj); await page.waitForTimeout(350); };
  const vis = (sel) => page.$$eval(sel, (els) => els.map((e) => getComputedStyle(e).display !== "none"));

  await set({ pageTargets: { scene: "#scene", chat: "#chat", message: ".msg", avatar: ".av", time: ".t" }, wallpaper: "aurora" });
  check("preset wallpaper applied to picked scene", (await page.$eval("#scene", (e) => getComputedStyle(e).backgroundImage)).includes("linear-gradient"));
  await set({ roomWallpapers: { r1: "none" } });
  await page.evaluate(() => lookSetRoom("r1", "Hunter")); await page.waitForTimeout(100);
  check("per-room 'none' overrides default", (await page.$eval("#scene", (e) => getComputedStyle(e).backgroundImage)) === "none");
  await page.evaluate(() => lookSetRoom("other", "Hunter"));
  await set({ customWallpapers: [{ id: "c1", name: "C", image: "https://example.com/a.jpg", dim: 30 }], wallpaper: "c1" });
  check("custom image wallpaper uses url()", (await page.$eval("#scene", (e) => getComputedStyle(e).backgroundImage)).includes("example.com/a.jpg"));
  await set({ customWallpapers: [{ id: "c1", name: "C", image: "http://evil/a.jpg\"};x{", dim: 30 }], wallpaper: "c1" });
  check("non-https/injected image rejected", !(await page.$eval("#scene", (e) => getComputedStyle(e).backgroundImage)).includes("evil"));

  await set({ chatHideAvatars: true, chatHideTimes: true });
  check("avatars hidden", (await vis(".av")).every((v) => !v));
  check("timestamps hidden", (await vis(".t")).every((v) => !v));
  await set({ chatFontPct: 150 });
  check("font size scaled", (await page.$eval(".msg", (e) => parseFloat(getComputedStyle(e).fontSize))) > 18);
  await set({ chatBgOn: true, chatBg: "#ff0000", chatBgAlpha: 50 });
  check("chat background colour", (await page.$eval("#chat", (e) => getComputedStyle(e).backgroundColor)) === "rgba(255, 0, 0, 0.5)");

  await set({ chatIgnoredUsers: ["spammer"], chatMutedWords: ["badword"], chatMentionHighlight: true });
  check("ignored user + muted word hidden", JSON.stringify(await vis(".msg")) === "[true,false,true,false]");
  check("@mention marked", await page.$eval(".msg:nth-child(3)", (e) => e.hasAttribute("data-wtk-mention")));
  await page.evaluate(() => { const d = document.createElement("div"); d.className = "msg"; d.innerHTML = "<b>Spammer</b> again"; document.getElementById("chat").append(d); });
  await page.waitForTimeout(400);
  check("new messages filtered live", (await vis(".msg"))[4] === false);

  await set({ chatIgnoredUsers: [], chatMutedWords: [], chatMentionHighlight: false });
  check("clearing rules unhides", (await vis(".msg")).every(Boolean));
  await set({ pageTargets: { scene: "#scene{}body{display:none", message: ".msg" } });
  check("unsafe selector ignored", (await page.$eval("body", (e) => getComputedStyle(e).display)) !== "none");
  await browser.close();
  console.log(fails ? `${fails} failed` : "all passed");
  process.exit(fails ? 1 : 0);
})();
