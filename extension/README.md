# UI for yt-dlp

Install (Developer mode):

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.

Files:

- `manifest.json` — extension manifest, matches playlist URL.
- `content-script.js` — injects buttons and coordinates download actions.
- `utils/page-metadata.js` — shared YouTube and YouTube Music metadata extraction helpers.
- `utils/path-query.js` — builds shared existing-path request parameters.
- `background.js` — listens for extension icon clicks and manually triggers button injection.

Usage:

- Open a supported YouTube or YouTube Music page.
- Click the extension icon to manually inject the download buttons.
- Use the advanced options button to correct the artist, title, or album, or provide an exact save location for that request. The current title is prefilled as the title override.
