// Point-and-click picker (isolated world). The user clicks a part of the page and we work out a CSS selector
// for it. Nothing is changed on the page while picking; the click is swallowed so the site doesn't react to it.

function pickClassParts(el) {
  const parts = [];
  el.classList.forEach((c) => {
    // Skip classes that look generated (long digit runs, css-in-js prefixes).
    if (!c || c.length > 60 || /\d{4,}/.test(c) || /^(css|jsx|sc|emotion|svelte)-/i.test(c)) return;
    // CSS-module names like "Chat_message__a1B2c": match the stable prefix, the hash changes between releases.
    const m = /^([A-Za-z][\w-]*?__)[\w-]{4,8}$/.exec(c);
    parts.push({ s: m ? `[class*="${m[1]}"]` : "." + CSS.escape(c), w: (m ? 100 : 0) + c.length });
  });
  return [...new Set(parts.sort((a, b) => b.w - a.w).map((p) => p.s))].slice(0, 3);
}
function pickPart(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && !/\d{3,}/.test(el.id) &&
      document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id);
  return tag + pickClassParts(el).join("");
}
// multi=true: the selector should match many similar elements (messages). multi=false: exactly one (the chat panel).
function buildSelector(el, multi) {
  const count = (s) => { try { return document.querySelectorAll(s).length; } catch { return 0; } };
  const valid = (s) => { try { return safeSelector(s) && el.matches(s); } catch { return false; } };
  let chain = pickPart(el), p = el.parentElement, depth = 0;
  const tries = [chain];
  while (p && p !== document.documentElement && p !== document.body && depth < 4) {
    chain = pickPart(p) + " > " + chain; tries.push(chain); p = p.parentElement; depth++;
  }
  for (const s of tries) {
    if (!valid(s)) continue;
    const n = count(s);
    const hook = /[#.\[]/.test(s.split(" > ").pop());
    if (multi ? n >= 1 && hook : n === 1) return s;
  }
  if (multi) return null;
  const path = [];
  for (let e = el; e && e !== document.body && path.length < 8; e = e.parentElement) {
    const sibs = [...e.parentElement.children].filter((c) => c.tagName === e.tagName);
    path.unshift(e.tagName.toLowerCase() + (sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(e) + 1})` : ""));
  }
  const s = "body > " + path.join(" > ");
  return valid(s) && count(s) === 1 ? s : null;
}

// Resolves with a selector string, or null if cancelled.
function pickTarget(label, multi) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.id = "wavez-toolkit-picker";
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      .box { position:fixed; pointer-events:none; box-sizing:border-box; border:2px solid #9d8cff; background:rgba(157,140,255,.18); }
      .box.m { border:1px dashed #9d8cff; background:rgba(157,140,255,.08); }
      .bar { position:fixed; left:50%; top:12px; transform:translateX(-50%); pointer-events:auto; max-width:min(640px,92vw);
             background:#141414; color:#eee; border:1px solid #333; border-radius:10px; padding:10px 12px; font:13px system-ui,sans-serif;
             box-shadow:0 4px 18px rgba(0,0,0,.5); }
      .sel { font:12px ui-monospace,monospace; color:#9d8cff; word-break:break-all; margin:4px 0; }
      .hint { color:#999; margin:2px 0 6px; } .warn { color:#ffb454; }
      button { background:#2a2a2a; color:#eee; border:1px solid #444; border-radius:6px; padding:4px 10px; cursor:pointer; margin-right:6px; }
      button.go { background:#583cc8; border-color:#583cc8; } button:disabled { opacity:.4; cursor:default; }
    `;
    const hover = document.createElement("div"); hover.className = "box"; hover.style.display = "none";
    const matchLayer = document.createElement("div");
    const bar = document.createElement("div"); bar.className = "bar";
    const title = document.createElement("div");
    const selLine = document.createElement("div"); selLine.className = "sel";
    const hint = document.createElement("div"); hint.className = "hint";
    const btns = document.createElement("div");
    const mk = (t, cls) => { const b = document.createElement("button"); b.textContent = t; if (cls) b.className = cls; return b; };
    const bUp = mk("▲ Bigger"), bDown = mk("▼ Smaller"), bOk = mk("Use this", "go"), bNo = mk("Cancel");
    btns.append(bUp, bDown, bOk, bNo);
    bar.append(title, selLine, hint, btns);
    root.append(style, hover, matchLayer, bar);
    document.documentElement.appendChild(host);

    let cur = null, selector = null;
    const stack = []; // elements we came from when going bigger, so Smaller can go back
    const inOurUi = (n) => n === host || (n && n.closest && (n.closest("#wavez-toolkit-host") || n.closest("#wavez-toolkit-picker")));
    const place = (box, r) => { box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.width = r.width + "px"; box.style.height = r.height + "px"; };

    function render() {
      matchLayer.textContent = "";
      title.textContent = cur ? `Selected for: ${label}` : `Click ${label.toLowerCase()} on the page (Esc to cancel)`;
      bUp.disabled = bOk.disabled = !cur;
      bDown.disabled = !stack.length;
      if (!cur) { selLine.textContent = ""; hint.textContent = ""; hint.className = "hint"; return; }
      selector = buildSelector(cur, multi);
      let n = 0, all = [];
      if (selector) { try { all = [...document.querySelectorAll(selector)]; n = all.length; } catch {} }
      all.slice(0, 60).forEach((m) => {
        const box = document.createElement("div"); box.className = m === cur ? "box" : "box m";
        place(box, m.getBoundingClientRect()); matchLayer.append(box);
      });
      selLine.textContent = selector || "(couldn't build a reliable selector for this element)";
      if (!selector) { hint.textContent = "Try ▲ Bigger or click a different element."; hint.className = "hint warn"; bOk.disabled = true; return; }
      bOk.disabled = false;
      hint.className = "hint";
      hint.textContent = `${n} match${n === 1 ? "" : "es"}. ` +
        (multi && n === 1 ? "That's only one, but you want it to match every one: ▲ Bigger may help, or pick another." : "") +
        (!multi && n > 1 ? "You want exactly one: ▲ Bigger usually fixes this." : "");
      if ((multi && n === 1) || (!multi && n > 1)) hint.className = "hint warn";
    }

    const blockers = ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "touchstart", "touchend"];
    function finish(result) {
      blockers.forEach((t) => window.removeEventListener(t, onBlock, true));
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", render, true);
      host.remove();
      resolve(result);
    }
    function elementAt(x, y) {
      const e = document.elementFromPoint(x, y);
      return !e || inOurUi(e) || e === document.documentElement || e === document.body ? null : e;
    }
    function onMove(ev) {
      if (cur) return;
      const e = elementAt(ev.clientX, ev.clientY);
      if (!e) { hover.style.display = "none"; return; }
      hover.style.display = "block"; place(hover, e.getBoundingClientRect());
    }
    function onBlock(ev) {
      if (ev.composedPath().includes(host)) return; // our own bar
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (ev.type === "click") {
        const e = elementAt(ev.clientX, ev.clientY);
        if (e) { cur = e; stack.length = 0; hover.style.display = "none"; render(); }
      }
    }
    function onKey(ev) { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); finish(null); } }
    bUp.addEventListener("click", () => {
      if (cur && cur.parentElement && cur.parentElement !== document.body) { stack.push(cur); cur = cur.parentElement; render(); }
    });
    bDown.addEventListener("click", () => { if (stack.length) { cur = stack.pop(); render(); } });
    bOk.addEventListener("click", () => finish(selector && safeSelector(selector) ? selector : null));
    bNo.addEventListener("click", () => finish(null));

    blockers.forEach((t) => window.addEventListener(t, onBlock, true));
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", render, true);
    render();
  });
}
