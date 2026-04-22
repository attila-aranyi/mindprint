"""
MindPrint FastAPI app.

Surface:

    GET  /health                  → {"ok": true, "model_loaded": bool}
    POST /classify                → { headlines: string[] }
                                  ← { results: { [headline]: {label, emoji, confidence, reasoning, top_regions} } }

The extension posts a batch; we loop headlines through TRIBE + ROI scoring
and in-process-cache each result by exact text.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from roi_mapping import score_emotions
from tribe_engine import TribeEngine

log = logging.getLogger("mindprint")
logging.basicConfig(level=logging.INFO)

# ---- models ----

class ClassifyRequest(BaseModel):
    headlines: List[str] = Field(..., max_length=64)


class ClassifyResponse(BaseModel):
    results: Dict[str, Dict]


# ---- app ----

def create_app() -> FastAPI:
    app = FastAPI(title="MindPrint TRIBE backend", version="0.1.0")

    # Chrome extensions call from origin chrome-extension://<id>. We allow any
    # origin because the extension ID isn't known at deploy time; the Anthropic
    # key / backend URL is BYOK and the payload is just text.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,
    )

    engine = TribeEngine(cache_folder=os.environ.get("TRIBE_CACHE", "/tmp/tribe-cache"))
    cache: Dict[str, Dict] = {}

    def _cache_key(h: str) -> str:
        return hashlib.sha256(h.strip().lower().encode("utf-8")).hexdigest()

    @app.get("/health")
    def health():
        return {"ok": True, "model_loaded": engine._model is not None or os.environ.get("MINDPRINT_FAKE_TRIBE") == "1"}

    @app.post("/warmup")
    def warmup():
        engine.warmup()
        return {"ok": True}

    @app.post("/classify", response_model=ClassifyResponse)
    def classify(req: ClassifyRequest):
        if not req.headlines:
            return ClassifyResponse(results={})

        results: Dict[str, Dict] = {}
        for raw in req.headlines:
            h = " ".join(raw.split()).strip()
            if len(h) < 6 or len(h) > 300:
                continue
            key = _cache_key(h)
            if key in cache:
                results[h] = cache[key]
                continue
            try:
                preds = engine.predict_text(h)
                scored = score_emotions(preds)
            except Exception as e:
                log.exception("classify failed for %r", h)
                continue  # skip this headline, don't abort the batch
            cache[key] = scored
            results[h] = scored
        return ClassifyResponse(results=results)

    return app


app = create_app()
