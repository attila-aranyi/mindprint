# MindPrint — Headline Reaction Detector

A Chrome extension that reads the news titles on the page and shows the *intended emotional reaction* each headline is engineered to provoke — outrage, fear, curiosity, hope, sadness, pride, amusement, disgust, or neutral.

Inspired by and built on [TRIBE v2](https://github.com/facebookresearch/tribev2), Meta's brain-predictive foundation model (CC BY-NC-4.0).

## Architecture

Two engines, selectable in the popup:

1. **TRIBE v2 (self-hosted)** — a Python FastAPI service in `backend/` deployed to Modal, loads `facebook/tribev2`, runs the text path, maps the predicted cortical activity to an emotion via an explainable ROI heuristic. This is the primary engine.
2. **Claude (BYOK)** — direct Anthropic Messages API call with your own key. Useful as a fallback when the TRIBE backend is cold/unreachable, or as a standalone option if you don't want to host TRIBE.

```
 news site ──►  content.js ──► background.js ──► TRIBE backend (Modal)  ─►  cortex map ─►  emotion label
                                               └► (optional fallback)
                                                  Claude Messages API  ─►  emotion label
```

## Install & run

1. **Deploy the backend.** See `backend/README.md` for the full recipe; in short: `cd backend && modal deploy modal_app.py`, copy the URL it prints.
2. **Load the extension.** `chrome://extensions` → Developer mode → Load unpacked → pick this folder.
3. **Configure.** Click the MindPrint toolbar icon:
   - Pick **Engine: TRIBE v2**, paste the Modal URL into **Backend URL**, click **Save** (grants host permission), then **Test /health** to confirm.
   - (Optional) check **Fall back to Claude on error** and paste an `sk-ant-…` key.
4. Visit bbc.com, reuters.com, theguardian.com, or news.ycombinator.com. Each detected headline gets a pill like `😡 outrage` — hover for the top contributing brain regions and confidence.

Prefer to skip the backend for a first taste? Pick **Engine: Claude**, paste an Anthropic key, done. The Claude path approximates what TRIBE is doing and ships today; swap to TRIBE when you've deployed.

## Taxonomy

| label      | emoji | hint                                         |
|------------|-------|----------------------------------------------|
| outrage    | 😡    | anger at a group, person, or policy          |
| fear       | 😨    | worry about a threat or danger               |
| curiosity  | 🤔    | intrigue, clickbait mystery                  |
| hope       | 🌱    | optimism, positive change                    |
| sadness    | 😢    | empathy, grief, loss                         |
| pride      | 🦚    | in-group affirmation, accomplishment         |
| amusement  | 😄    | humor, lightness, entertainment              |
| disgust    | 🤢    | moral or physical revulsion                  |
| neutral    | ◽    | informational, low emotional valence         |

## Privacy

- Settings, cache, and your API key / backend URL live in `chrome.storage.local` on your device only.
- The extension sends headline text (not article bodies, not URLs) to the engine you chose. Nothing else leaves the browser. No analytics, no telemetry.
- Cache is per-engine and per-taxonomy-version (bump `CACHE_VERSION` in `background.js` to invalidate).

## Repo layout

```
manifest.json          MV3 manifest
background.js          Service worker: engine dispatch, cache, message router
content.js             Headline detection + badge injection per supported site
content.css            Badge styles (light + dark)
popup.html/js/css      Settings UI: engine picker, backend URL, API key, sites
backend/               FastAPI + Modal deployment of TRIBE v2
  ├─ app.py            FastAPI surface
  ├─ tribe_engine.py   TRIBE model wrapper (text → cortex preds)
  ├─ roi_mapping.py    Cortex preds → emotion via Destrieux atlas + ROI heuristic
  ├─ taxonomy.py       9-label taxonomy + per-label ROI profile
  ├─ modal_app.py      GPU Modal app, Volume-cached weights, ASGI
  ├─ requirements.txt
  └─ README.md
```

## Known limitations

- News sites redesign often. If badges stop appearing, update `SITE_SELECTORS` in `content.js`.
- TRIBE output is cortical vertex activity, not emotion labels. The ROI heuristic in `backend/roi_mapping.py` is a best-effort first pass — contributions welcome. Tunable knobs: `NEUTRAL_THRESHOLD`, per-label ROI weights, and the peak-response window.
- TRIBE inference is seconds per headline on A10G (it internally does TTS + word-level alignment). Cache matters.
- Classification is text-only; article body, images, and layout context are ignored. Real TRIBE is multimodal — extending to images/video is a natural follow-up.
- **License:** TRIBE weights are CC BY-NC-4.0. This extension + backend are appropriate for personal / research / open-source use. Commercial deployment requires Meta's explicit permission.
