# Changelog

## 0.9.0
- Wallpapers: built-in gradients or your own https image (with optional dimming), as a default or per room.
- Chat settings: text size, compact mode, hide avatars/timestamps, custom chat background, @mention highlight, hidden words and ignored users.
- Point-and-click "Pick" tool in the in-page panel (Customize page) to tell the add-on which parts of wavez.fm to style; selectors can also be edited in Options.
- Auto-star: automatically save tracks (the ones you woot, ones with enough woots, or all) to your starred list inside the add-on. It works whether or not the site's API offers a grab action.
- Starred tracks manager in Options: search, remove, export as CSV, copy as a text list.
- "What's new" in Options: shows this update log, read from GitHub (one public text file, nothing about you is sent; can be turned off).
- The panel shows a plain-language "Auto-woot:" line (for example "Waiting for your delay" or "The site says voting isn't available"), and votes the site refuses are recorded in Diagnostics.
- Docs corrected: the official API has no grab action, so use Auto-star.
- Diagnostics now lists recent failed API calls (which action, what error) instead of dropping them silently, to make problems on the live site easy to report.
- In-page panel sections can be collapsed, and the panel remembers which are open.
- "Heard before" line in the panel when the current track is already in your history.
- Top DJs by average woots in the Options history section.
- "Send a test notification" and "Reset settings to defaults" buttons in Options.

## 0.8.0
- Diagnostics page in Options: shows which actions and fields the site's API offers (names only).
- Options now save automatically, field by field.
- Per-room rules for auto-woot, auto-grab and auto-join.
- "Always woot these DJs" list.
- Queue alert at a chosen distance from the front of the queue.
- Sleep timer (fades out, then mutes), copy-track button, optional now-playing tab title.
- Clicking a notification focuses the wavez.fm tab.
- Auto-grab toggle in the toolbar popup.

## 0.7.0
- Auto-grab (only if the site's API provides a grab action), starred tracks, crowd-woot, custom hotkeys.
- Quiet hours, alerts for chosen users, day/night theme schedule, theme import/export.
- Searchable track history, settings backup and restore, regex watch words, mod notes and per-room mod limits.

## 0.6.0
- Local room themes: presets, custom themes, per-room choice.

## 0.5.0
- Initial release: auto-woot, queue tools, blocklist, notifications, AFK reply, DJ stats, mod assist.
