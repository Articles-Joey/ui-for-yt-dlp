# UI for yt-dlp

Install (Developer mode):

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this `extension/` folder.

Files:

- `manifest.json` — extension manifest, matches playlist URL.
- `content-script.js` — injects the placeholder button.
- `background.js` — listens for extension icon clicks and manually triggers button injection.

Usage:

- Open a supported YouTube or YouTube Music page.
- Click the extension icon to manually inject the download buttons.
