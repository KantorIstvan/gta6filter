# GTA 6 spoiler filter (Brave)

Blurs GTA 6 videos, posts and comments. Everything runs locally; nothing is sent anywhere.

## Install

1. Run `npm install`. It copies the runtime files into `extension/vendor`.
2. In Brave, open `brave://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension` folder.
4. Pin it from the puzzle icon so the settings are one click away.

## Usage

- GTA content is greyed out and blurred. One click reveals it (without opening it). Navigating to a new page hides it again.
- Hidden videos don't play, and neither does the hover preview.
- Popup: on/off toggle, image recognition, image threshold, custom keywords and channel names (one per line, e.g. GTA YouTubers).

## Sharing keyword lists

- **Export:** in the popup, click **Copy all** next to the custom keywords. The whole list goes to the clipboard, one per line.
- **Import:** paste a list into the keyword box; every line becomes a keyword and duplicates are skipped.
- **Find one:** typing in the keyword box filters the list, so you can find a specific keyword and remove it with its ×.

## What it filters

- **Text:** one strong match (GTA 6, GTA VI, #gta6, Grand Theft Auto VI, Jason Duval, Port Gellhorn…) or two different weak ones (GTA, Vice City, Jason, Lucia, Leonida, Rockstar…) within the same card. Alt text counts too (Instagram often describes the image there).
- **Images:** a local CLIP model plus a classifier trained on top of it. The first run downloads about 85 MB from Hugging Face; after that it runs from cache. Only images near the viewport and at least thumbnail-sized are checked.
- Card-level rules: YouTube, Reddit, X, TikTok, Google, Facebook. On every other site it filters at the `article`/`li`/paragraph level.

## Development

- `npm test`: self-check of the keyword rules.
- `node tools/train-probe.mjs`: retrains `extension/probe.json` (YouTube thumbnails and Bing images, CLIP embeddings, logistic regression, CV report per threshold and per source).
- Image recognizer log: `brave://extensions`, then on the extension click "Inspect views: offscreen.html".

## Limitations

- On Instagram Reels only the caption is blurred, not the video itself.
- The Reddit, X, Instagram and Facebook card rules couldn't be tested live (bot protection or login required). If something slips through, add a selector to the `SITE` list in `content.js`.
- Image recognition at a 0.5 threshold catches about 66% of GTA 6 YouTube thumbnails and about 82% of other GTA 6 images (posters, artwork, news cards), and flags about 4% of non-GTA images. False positives are mostly other open-world games and Miami/Florida photos.
- It can't see small captions or logos (the model downscales to 224×224). If a site's own template only marks the topic with a "GRAND THEFT AUTO VI" label (e.g. Hungarian Rockstar Club), add the site's name to the channel names in the popup. If a topic keeps getting flagged, add a few such searches to the `neg` list in `tools/train-probe.mjs` and retrain.
