const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(process.argv[2] || "main.js", "utf8");

function run(opts) {
  const posted = [], handlers = {}, subs = {}, calls = [];
  const state = JSON.parse(JSON.stringify(opts.state));
  const actions = {
    vote: (t) => calls.push("vote:" + t), setVolume: (v) => calls.push("vol:" + v),
    joinQueue: () => calls.push("join"), leaveQueue: () => calls.push("leave"), sendChat: (t) => calls.push("chat:" + t)
  };
  if (opts.grab) actions[opts.grab] = () => calls.push("grab");
  const win = {
    __x: 1, WavezFM: { version: "1", room: { getState: () => state, subscribe: (ev, fn) => { subs[ev] = fn; } }, actions },
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    postMessage: (m) => posted.push(m)
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: opts.doc || { hidden: !!opts.hidden }, location: { origin: "https://wavez.fm" },
    setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {}, Date: opts.clock ? { now: () => opts.clock.t } : Date, Promise, console });
  vm.runInContext(src, ctx);
  const deliver = (type, payload) => (handlers.message || []).forEach((h) => h({ source: win, data: { __wtk: 1, dir: "toPage", type, payload } }));
  return new Promise((res) => setTimeout(() => {
    deliver("settings", opts.settings);
    res({ posted, calls, state, subs, handlers, win, tick: () => subs.votes_changed && subs.votes_changed(), deliver });
  }, 250));
}

const base = () => ({
  room: { name: "R", slug: "room-a", activeUsersCount: 3, viewerRole: "user" },
  playback: { playbackKey: "k1", trackId: "t1", title: "Song", artist: "Artist", djUsername: "dj1", djId: "d1", source: "yt" },
  votes: { trackId: "t1", woots: 3, mehs: 0, grabs: 0, clientVote: null, clientGrabbed: false, canVote: true, clientVotePending: false },
  queue: { isCurrentDj: false, isJoined: false, isLocked: false, isFull: false, entries: [], currentDjId: "d1" },
  currentUser: { id: "me", username: "me", roomRole: "user", globalRole: "user" },
  volume: 50, users: [], permissions: { joinQueue: true }, social: { isFollowingCurrentDj: false }
});
const S = (o) => Object.assign({ hotkeys: true, hotkeyKeys: { woot: "W", meh: "M", mute: "S", queue: "Q", grab: "G", star: "F", panel: "P" },
  favorites: [], blocklist: [], blockAction: "off", wootScope: "all", crowdWoots: 0, voteAfterSec: 0, fadeInSec: 0, grabMode: "all", grabMinWoots: 5 }, o);

let fails = 0;
const ok = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fails++; };
const lastStatus = (r) => { const s = r.posted.filter((m) => m.type === "status").pop(); return s && s.payload; };

(async () => {
  let r = await run({ state: base(), grab: "grab", settings: S({ autoGrab: true }) });
  ok("auto-grab (all) calls grab when API has it", r.calls.includes("grab"));
  ok("status reports grab ok", lastStatus(r).grab === "ok");

  r = await run({ state: base(), grab: "grab", settings: S({ autoGrab: true, grabMode: "voted" }) });
  ok("grab mode 'voted' does not grab without a woot", !r.calls.includes("grab"));
  r.state.votes.clientVote = "woot"; r.tick();
  ok("grab mode 'voted' grabs after I woot", r.calls.includes("grab"));

  r = await run({ state: base(), grab: "grab", settings: S({ autoGrab: true, grabMode: "minwoots", grabMinWoots: 5 }) });
  ok("minwoots: 3 < 5, no grab", !r.calls.includes("grab"));
  r.state.votes.woots = 6; r.tick();
  ok("minwoots: 6 >= 5, grabs", r.calls.includes("grab"));

  r = await run({ state: base(), settings: S({ autoGrab: true }) });
  ok("no grab action in API -> status 'unsupported', nothing else clicked", lastStatus(r).grab === "unsupported" && !r.calls.some((c) => c.startsWith("grab")));

  r = await run({ state: base(), grab: "grab", settings: S({ autoGrab: true }) });
  r.state.votes.clientGrabbed = true; const n0 = r.calls.filter((c) => c === "grab").length; r.tick();
  ok("already grabbed -> no more grab calls", r.calls.filter((c) => c === "grab").length === n0);

  r = await run({ state: base(), settings: S({ autoWoot: true, crowdWoots: 5 }) });
  ok("crowd woot waits (3 < 5)", !r.calls.includes("vote:woot"));
  r.state.votes.woots = 5; r.state.playback.playbackKey = "k1"; r.tick();
  ok("crowd woot votes at 5", r.calls.includes("vote:woot"));

  r = await run({ state: base(), settings: S({ autoWoot: true, wootScope: "starred" }) });
  ok("starred scope: not starred -> no woot", !r.calls.includes("vote:woot"));
  r = await run({ state: base(), settings: S({ autoWoot: true, wootScope: "starred", favorites: [{ k: "song|artist", title: "Song", artist: "Artist" }] }) });
  ok("starred scope: starred -> woot", r.calls.includes("vote:woot"));

  r = await run({ state: base(), grab: "grab", settings: S({ hotkeyKeys: { woot: "W", meh: "M", mute: "S", queue: "Q", grab: "J", star: "F", panel: "P" } }) });
  const key = (code) => (r.handlers.keydown || []).forEach((h) => h({ altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, code, target: {}, preventDefault() {} }));
  key("KeyG"); ok("old grab key (G) does nothing after remap", !r.calls.includes("grab"));
  key("KeyJ"); ok("remapped grab key (J) grabs", r.calls.includes("grab"));
  key("KeyF"); ok("star hotkey posts a 'ui' message", r.posted.some((m) => m.type === "ui" && m.payload.name === "star"));
  key("KeyP"); ok("panel hotkey posts a 'ui' message", r.posted.some((m) => m.type === "ui" && m.payload.name === "togglePanel"));

  const modS = S({ modEnabled: true, modRoles: ["mod"], modWatch: true, modWords: ["re:fre+ \\w+ gift", "plain"], modNotes: ["Spammer1: warned twice"],
    modLinks: false, modFlood: false, modTracks: false });
  const mst = base(); mst.room.viewerRole = "mod"; mst.users = [{ id: "u9", username: "spammer1" }];
  r = await run({ state: mst, settings: modS });
  r.subs.chat_message({ content: "FREEE stuff gift here", username: "Spammer1" });
  const f1 = r.posted.find((m) => m.type === "modflag");
  ok("regex watched word flags + note attached", f1 && /watched word/.test(f1.payload.reason) && /note: warned twice/.test(f1.payload.reason));
  r = await run({ state: mst, settings: S({ ...modS, modOnlyRooms: ["other-room"] }) });
  r.subs.chat_message({ content: "plain text", username: "someone" });
  ok("modOnlyRooms blocks other rooms", !r.posted.some((m) => m.type === "modflag"));

  r = await run({ state: base(), hidden: true, settings: S({ alertUsers: ["bestfriend"] }) });
  r.subs.chat_message({ content: "hello", username: "BestFriend" });
  ok("alert-user notification when tab hidden", r.posted.some((m) => m.type === "notify" && m.payload.id === "alertuser"));

  // always-woot DJs work even with auto-woot off
  r = await run({ state: base(), settings: S({ autoWoot: false, wootDjs: ["DJ1"] }) });
  ok("always-woot DJ gets a woot with auto-woot off", r.calls.includes("vote:woot"));
  r = await run({ state: base(), settings: S({ autoWoot: false, wootDjs: ["someone-else"] }) });
  ok("other DJs are not auto-wooted", !r.calls.includes("vote:woot"));

  // per-room overrides
  r = await run({ state: base(), settings: S({ autoWoot: true, roomOverrides: { "room-a": { autoWoot: "off" } } }) });
  ok("room override 'off' beats global auto-woot", !r.calls.includes("vote:woot"));
  r = await run({ state: base(), settings: S({ autoWoot: false, roomOverrides: { "room-a": { autoWoot: "on" } } }) });
  ok("room override 'on' beats global off", r.calls.includes("vote:woot"));
  r = await run({ state: base(), settings: S({ autoWoot: true, roomOverrides: { "other": { autoWoot: "off" } } }) });
  ok("override for another room is ignored", r.calls.includes("vote:woot"));

  // queue alert distance
  const q = base(); q.queue.entries = [{ userId: "x", position: 1 }, { userId: "y", position: 2 }, { userId: "me", position: 3, estimatedWaitMs: 60000 }];
  r = await run({ state: q, settings: S({ notifyUpNext: true, upNextSpots: 3 }) });
  ok("queue alert at 3 spots when threshold is 3", r.posted.some((m) => m.type === "notify" && /#3/.test(m.payload.title)));
  r = await run({ state: q, settings: S({ notifyUpNext: true, upNextSpots: 1 }) });
  ok("no queue alert at 3 spots when threshold is 1", !r.posted.some((m) => m.type === "notify" && m.payload.id === "upnext"));

  // sleep timer: fade over last 20s, then mute; mute key restores
  const clock = { t: 1e12 };
  r = await run({ state: base(), clock, settings: S({}) });
  r.deliver("cmd", { name: "sleep15" }); r.tick();
  ok("sleep timer reported in status", lastStatus(r).sleep === 15);
  clock.t += 15 * 60000 - 15000; r.tick();
  ok("volume fading in the last 20s (50 * 15/20 = 38)", r.calls.includes("vol:38"));
  clock.t += 20000; r.tick();
  ok("volume goes to 0 at expiry", r.calls.includes("vol:0"));
  r.deliver("cmd", { name: "toggleMute" });
  ok("mute key restores the original volume", r.calls.includes("vol:50"));
  r = await run({ state: base(), clock, settings: S({}) });
  r.deliver("cmd", { name: "sleep15" }); r.deliver("cmd", { name: "sleepOff" }); r.tick();
  ok("sleep timer can be cancelled", lastStatus(r).sleep === 0);

  // tab title
  const doc = { hidden: false, title: "orig" };
  r = await run({ state: base(), doc, settings: S({ tabTitle: true }) });
  ok("tab title shows the track", doc.title === "▶ Song - Artist");
  r.deliver("settings", S({ tabTitle: false })); 
  ok("tab title restored when turned off", doc.title === "orig");

  // diagnostics: names only
  r = await run({ state: base(), grab: "grab", settings: S({}) });
  const dg = r.posted.find((m) => m.type === "diag");
  ok("diagnostics list API action names", dg && dg.payload.actions.includes("vote") && dg.payload.actions.includes("grab"));
  ok("diagnostics contain no values", dg && Object.values(dg.payload).every((v) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"))));

  // auto-star (local starred list, no site action needed)
  const stars = (r) => r.posted.filter((m) => m.type === "autostar");
  r = await run({ state: base(), settings: S({ autoStar: true, starMode: "voted" }) });
  ok("auto-star 'voted': nothing before I woot", stars(r).length === 0);
  r.state.votes.clientVote = "woot"; r.tick(); r.tick();
  ok("auto-star 'voted': sent once after I woot", stars(r).length === 1 && stars(r)[0].payload.title === "Song");
  r = await run({ state: base(), settings: S({ autoStar: true, starMode: "minwoots", starMinWoots: 5 }) });
  ok("auto-star 'minwoots': 3 < 5, nothing", stars(r).length === 0);
  r.state.votes.woots = 5; r.tick();
  ok("auto-star 'minwoots': sent at 5", stars(r).length === 1);
  r = await run({ state: base(), settings: S({ autoStar: true, starMode: "all" }) });
  ok("auto-star 'all': sent without any vote", stars(r).length === 1);
  r = await run({ state: base(), settings: S({ autoStar: true, starMode: "all", favorites: [{ k: "song|artist" }] }) });
  ok("auto-star skips tracks already starred", stars(r).length === 0);
  const own = base(); own.queue.isCurrentDj = true;
  r = await run({ state: own, settings: S({ autoStar: true, starMode: "all" }) });
  ok("auto-star skips my own track", stars(r).length === 0);
  r = await run({ state: base(), settings: S({ autoStar: false, starMode: "all" }) });
  ok("auto-star off sends nothing", stars(r).length === 0);

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
