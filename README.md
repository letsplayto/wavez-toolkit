# Wavez Toolkit

A powerful Firefox WebExtension that adds practical automation, moderation assistance, personalization, and listening-history tools to [wavez.fm](https://wavez.fm/).

Wavez Toolkit is designed for listeners, DJs, and room moderators who want more control over their WavezFM experience without changing the service for anyone else. It is built around the official WavezFM Extension API and stores its settings and history locally in the browser.

## Highlights

- **Smarter listening:** optionally auto-woot tracks, wait before voting, limit auto-woots to DJs you follow, fade in each new track, and use keyboard shortcuts.
- **DJ queue tools:** automatically join the DJ queue when enabled and receive a notification when you are next.
- **Blocklist controls:** match artists, track titles, or DJs and either meh or temporarily mute matching tracks.
- **Notifications:** get alerts for new tracks, mentions, custom alert words, and queue changes while the tab is hidden.
- **Away mode:** send a configurable, rate-limited reply to @mentions while you are away.
- **Mod Assist:** flag watched words, unapproved links, flooding, and matching tracks; review notifications and export a moderation log as CSV.
- **Room customization:** apply preset or custom themes per room, including colors, optional background images, and extra CSS.
- **Listening history and DJ stats:** keep a local history of up to 100 tracks, track DJ statistics, and export history as CSV.
- **Convenient popup:** view the current room and track, toggle common controls, block the current artist, and review recent tracks from the extension popup.

## Installation

Wavez Toolkit is currently distributed as an unpacked extension for testing and personal use.

1. Download or clone this repository.
2. Open `about:debugging` in Firefox.
3. Select **This Firefox** (or the relevant Firefox Android extension workflow).
4. Choose **Load Temporary Add-on...**.
5. Select `manifest.json` from the repository directory.
6. Open a room on `wavez.fm` and use the extension popup or Options page to configure it.

The extension manifest targets Firefox and declares Firefox-specific settings, including Firefox for Android compatibility requirements. Browser support depends on the WebExtension APIs exposed by the target browser.

## Configuration

Open the extension popup for quick controls, or open **Options** for full configuration. Settings include voting behavior, queue behavior, blocklist entries, notification preferences, AFK replies, moderation rules, themes, audio fade-in, hotkeys, and local data management.

Mod Assist is intentionally advisory. It can detect, notify, log, and optionally post configurable chat warnings, but it cannot kick, ban, mute, or skip users because those actions are not exposed by the official WavezFM extension API.

## Permissions and privacy

The extension requests:

- `storage` to save settings, local track history, DJ statistics, themes, and moderation logs.
- `notifications` to show desktop alerts.
- Access to `https://wavez.fm/*` and `https://www.wavez.fm/*` so the toolkit can integrate with WavezFM rooms.

Data is kept in the browser's extension storage. The extension does not declare external data-collection permissions in its Firefox manifest. Custom theme background images are loaded only when you configure an HTTPS image URL.

## Project structure

- `manifest.json` — Firefox WebExtension metadata, permissions, scripts, and entry points.
- `main.js` — integration with the WavezFM page and official extension API.
- `panel.js` — in-page toolkit panel and user-facing controls.
- `shared.js` — defaults, theme presets, and shared helpers.
- `background.js` — notifications, local history, DJ statistics, and moderation-log storage.
- `popup.html` / `popup.js` / `popup.css` — browser-action popup.
- `options.html` / `options.js` — full settings interface.
- `bridge.js` / `theme.js` — page integration and room-theme behavior.

## Development notes

This repository contains a dependency-free WebExtension. There is no build step: edit the source files, reload the temporary add-on in Firefox, and test on wavez.fm.

When testing moderation features, use a room where you have the appropriate role and clearly communicate any automated warning behavior to participants. Review and customize the default settings before enabling automation.

## Status

Version `0.6.1`. This is an independently maintained toolkit for WavezFM and is not presented as an official WavezFM product.

## License

No license has been specified yet. Until a license is added, the repository should be treated as source-available for inspection and personal testing rather than granting broad reuse rights.
