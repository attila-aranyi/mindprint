"""
TRIBE v2 inference wrapper.

Loads facebook/tribev2 from HuggingFace once, then runs the text-only pipeline
on each input. TRIBE's published API (from the facebookresearch/tribev2 repo):

    from tribev2 import TribeModel
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder=...)
    df = model.get_events_dataframe(text_path="path.txt")
    preds, segments = model.predict(events=df)
    # preds: np.ndarray (n_timesteps, n_vertices ~= 20484)

Because text is internally converted to speech + aligned with word-level
timings, a single short headline still returns a small time dimension.

If the TRIBE API shifts between releases, the adapter layer here is the only
place we need to change — the FastAPI surface and the ROI mapping remain
stable.
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import Any

import numpy as np

# Optional — only used if TRIBE isn't available (local dev / CI / unit tests).
USE_FAKE = os.environ.get("MINDPRINT_FAKE_TRIBE") == "1"


class TribeEngine:
    def __init__(self, cache_folder: str = "/tmp/tribe-cache"):
        self.cache_folder = cache_folder
        self._model = None
        self._loaded_at: float | None = None

    # Lazy load so the FastAPI process starts fast; real load happens on
    # first /classify call or via warmup().
    def _ensure_loaded(self) -> None:
        if self._model is not None or USE_FAKE:
            return
        os.makedirs(self.cache_folder, exist_ok=True)
        t0 = time.time()
        from tribev2 import TribeModel  # heavy import — deferred
        self._model = TribeModel.from_pretrained(
            "facebook/tribev2",
            cache_folder=self.cache_folder,
        )
        self._loaded_at = time.time()
        print(f"[tribe_engine] loaded in {self._loaded_at - t0:.1f}s")

    def warmup(self) -> None:
        self._ensure_loaded()

    def predict_text(self, text: str) -> np.ndarray:
        """
        Run the TRIBE text pipeline on a single string. Returns
        (n_timesteps, n_vertices) float32 array.
        """
        if USE_FAKE:
            return _fake_preds(text)

        self._ensure_loaded()
        assert self._model is not None

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, encoding="utf-8"
        ) as f:
            f.write(text.strip() + "\n")
            path = f.name
        try:
            events = self._model.get_events_dataframe(text_path=path)
            preds, _segments = self._model.predict(events=events)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

        arr = np.asarray(preds, dtype=np.float32)
        if arr.ndim != 2:
            raise RuntimeError(f"unexpected preds shape {arr.shape}")
        return arr


def _fake_preds(text: str) -> np.ndarray:
    """
    Deterministic synthetic cortical response for tests / offline dev.
    Seeded on the text so the same headline always scores the same label.
    Shape: (4, 20484) to mimic fsaverage5.
    """
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    return rng.standard_normal((4, 20484)).astype(np.float32)
