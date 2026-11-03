const fs = require("fs"), vm = require("vm");
const read = (p) => fs.readFileSync(p, "utf8");
const ctx = vm.createContext({});
vm.runInContext(read("shared.js") + ";globalThis.cmpVersion=cmpVersion;globalThis.parseChangelog=parseChangelog;", ctx);
let fails = 0;
const ok = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };

ok("cmpVersion orders versions", ctx.cmpVersion("0.9.0", "0.8.0") === 1 && ctx.cmpVersion("0.8.0", "0.9.0") === -1 && ctx.cmpVersion("1.0.0", "1.0.0") === 0);
ok("cmpVersion compares numerically, not as text", ctx.cmpVersion("0.10.0", "0.9.0") === 1);

const p = ctx.parseChangelog("# Changelog\n\n## 1.2.0\n- **Bold** and `code`\n- second\n\n## v1.1.0\n* star bullet\nignored line\n");
ok("parses versions in order", p.length === 2 && p[0].version === "1.2.0" && p[1].version === "1.1.0");
ok("parses items and strips markdown marks", p[0].items.length === 2 && p[0].items[0] === "Bold and code" && p[1].items[0] === "star bullet");
ok("garbage input gives no versions", ctx.parseChangelog("<script>alert(1)</script>").length === 0);
ok("limits versions and items", ctx.parseChangelog(Array.from({ length: 50 }, (_, i) => `## 1.0.${i}\n- x`).join("\n")).length === 30 &&
  ctx.parseChangelog("## 1.0.0\n" + "- x\n".repeat(100))[0].items.length === 40);

// The real changelog must parse, and its newest entry must match the manifest version.
const log = ctx.parseChangelog(read("CHANGELOG.md"));
const ver = JSON.parse(read("manifest.json")).version;
ok("CHANGELOG.md parses", log.length > 0 && log.every((e) => e.items.length > 0));
ok(`newest CHANGELOG entry (${log[0] && log[0].version}) matches manifest version (${ver})`, log[0] && log[0].version === ver);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
