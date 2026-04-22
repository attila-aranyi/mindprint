# MindPrint TRIBE backend

A FastAPI service that loads Meta's [TRIBE v2](https://github.com/facebookresearch/tribev2) and turns its predicted cortical activity into an emotion label for each headline the Chrome extension sends.

**License note.** TRIBE v2 weights are released under [CC BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/). This backend is intended for personal, research, and open-source use only. Don't host it commercially without Meta's explicit permission.

## Pipeline

```
 POST /classify { headlines: [...] }
        │
        ▼
 tribe_engine.predict_text(text)
   ├── writes temp .txt
   ├── model.get_events_dataframe(text_path=...)  (TTS + word-level timing)
   └── model.predict(events=df)  →  (n_timesteps, ~20484 vertices)
        │
        ▼
 roi_mapping.score_emotions(preds)
   ├── pool vertices by Desikan-Killiany ROIs (via Destrieux atlas on fsaverage5)
   ├── peak-response reduction across time
   ├── z-score ROIs within sample
   └── weighted sum per emotion from taxonomy.TAXONOMY
        │
        ▼
 { label, emoji, confidence, reasoning, top_regions }
```

The cortex→emotion mapping lives entirely in `taxonomy.py` and `roi_mapping.py`. Swapping the heuristic for a trained probe later is a one-file change.

## API

```
GET  /health                          → {"ok": true, "model_loaded": bool}
POST /warmup                          → {"ok": true}         (triggers model load)
POST /classify                        → see below
       body:     { "headlines": ["headline 1", "headline 2"] }
       response: { "results": { "headline 1": {
                     "label": "fear",
                     "emoji": "😨",
                     "confidence": 0.78,
                     "reasoning": "fear cued by insula, temporalpole",
                     "top_regions": [{"roi":"insula","contribution":0.71}, ...],
                     "all_scores": {"outrage":0.4,"fear":1.2,...}
                   }, ... } }
```

Batch limit 64 headlines per request. Per-headline inference is dominated by TRIBE's TTS step (~a few seconds on A10G per headline).

## Deploy to Modal

You'll need a [Modal](https://modal.com) account with GPU access.

```bash
cd backend
pip install modal
modal token new                       # one-time
modal deploy modal_app.py
```

Modal prints a URL like `https://<workspace>--mindprint-tribe-web.modal.run`. Paste that into the Chrome extension popup (**Backend URL**) and you're done.

First request after idle triggers a cold start (~30–60s to load weights from the mounted Volume). The `@modal.enter` hook pre-loads the ROI atlas, so once the model is warm responses take seconds, not minutes.

Default GPU is `A10G`. To upgrade, change `gpu="A10G"` in `modal_app.py` to `"A100"`, `"H100"`, etc.

## Local dev (no GPU, no TRIBE)

```bash
cd backend
pip install -r requirements.txt
MINDPRINT_FAKE_TRIBE=1 uvicorn app:app --reload --port 8000
```

In fake mode, `tribe_engine.predict_text` returns a deterministic synthetic `(4, 20484)` response keyed on the headline text. The ROI atlas and scoring path run for real — useful for iterating on the taxonomy. Same headline always gets the same label in fake mode.

Then in the extension popup, set **Backend URL** to `http://localhost:8000`.

## Cost sketch (Modal, A10G)

- Idle: ~$0 (scale-to-zero after 5 minutes).
- Warm inference: ~$1.10/hr billed per second. A batch of 10 headlines in ~15s ≈ $0.005 per batch.
- Cold start: ~45s of GPU time per wake, ≈ $0.014.
- HF weight download is one-time and cached on the Modal Volume (free at this scale).

## Tuning knobs

- `taxonomy.TAXONOMY` — ROIs and weights per emotion. This is the thing to tune when labels feel wrong.
- `roi_mapping.NEUTRAL_THRESHOLD` (0.5) — how much affect signal is needed to avoid "neutral."
- `tribe_engine.TribeEngine.predict_text` — if the TRIBE repo API changes, this is the only place touched.
- `modal_app.Web.scaledown_window` (300s) — longer = fewer cold starts, higher idle cost. On a free tier, lower this.

## Files

```
app.py           FastAPI surface + in-process cache
tribe_engine.py  TRIBE model loader + text→(timesteps,vertices) adapter
roi_mapping.py   fsaverage5 Destrieux parcellation + cortex→emotion scoring
taxonomy.py      9-label taxonomy + per-label ROI profiles
modal_app.py     Modal deployment (GPU, Volume, ASGI)
requirements.txt  deps for local/fake mode
```
