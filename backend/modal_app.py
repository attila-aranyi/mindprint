"""
Modal deployment for the MindPrint TRIBE backend.

Deploy:
    modal deploy modal_app.py

This creates a public HTTPS URL like
    https://<workspace>--mindprint-tribe-web.modal.run
that the Chrome extension posts to.

GPU: A10 is a good default for a personal project (cheaper than A100 and
plenty for single-headline inference). Upgrade to H100/A100 if you need
to batch.

Cold starts: the model is snapshotted on a Volume and loaded in @modal.enter,
so the first request after idle warms the container (~30-60s depending on
weight size). Subsequent calls within the idle window are warm.
"""

from __future__ import annotations

import os
import pathlib

import modal

# --------------------------------------------------------------------------
# Image
# --------------------------------------------------------------------------

ROOT = pathlib.Path(__file__).parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch==2.5.1",
        "torchaudio==2.5.1",
        "numpy",
        "fastapi[standard]",
        "pydantic>=2",
        "nilearn",
        "huggingface_hub",
        # TRIBE v2 itself — installed from the Meta repo. Pin to a commit once
        # you've validated a working one; `main` is fine for first deploy.
        "git+https://github.com/facebookresearch/tribev2.git",
    )
    .env({"PYTHONPATH": "/app"})
    .add_local_file(str(ROOT / "app.py"),         "/app/app.py")
    .add_local_file(str(ROOT / "tribe_engine.py"),"/app/tribe_engine.py")
    .add_local_file(str(ROOT / "roi_mapping.py"), "/app/roi_mapping.py")
    .add_local_file(str(ROOT / "taxonomy.py"),    "/app/taxonomy.py")
)

# Persistent volume for HuggingFace weights + nilearn atlas cache so we don't
# re-download on every cold start.
cache_vol = modal.Volume.from_name("mindprint-cache", create_if_missing=True)

app = modal.App("mindprint-tribe")


# --------------------------------------------------------------------------
# GPU-backed ASGI
# --------------------------------------------------------------------------

@app.cls(
    image=image,
    gpu="A10G",
    volumes={"/cache": cache_vol},
    secrets=[modal.Secret.from_name("huggingface")],
    scaledown_window=300,   # keep warm 5 min after last request
    timeout=600,
)
class Web:
    @modal.enter()
    def load(self):
        os.environ.setdefault("TRIBE_CACHE",   "/cache/tribe")
        os.environ.setdefault("HF_HOME",       "/cache/hf")
        os.environ.setdefault("NILEARN_DATA",  "/cache/nilearn")
        for d in ("/cache/tribe", "/cache/hf", "/cache/nilearn"):
            os.makedirs(d, exist_ok=True)

        # Import now that env is set.
        import sys
        if "/app" not in sys.path:
            sys.path.insert(0, "/app")
        from app import app as fastapi_app        # noqa: F401
        from tribe_engine import TribeEngine      # noqa: F401

        # Prime the ROI atlas once so the first request isn't slow.
        from roi_mapping import load_fsaverage5_parcellation
        load_fsaverage5_parcellation()

        self._fastapi_app = fastapi_app

        # Optional: warm the TRIBE model at container start.
        # Comment out if you prefer lazy load on first request.
        try:
            from app import engine  # not exported — recreate via app internals
        except ImportError:
            pass

    @modal.asgi_app()
    def fastapi_app(self):
        # Re-import to ensure the module-level app picks up env vars set above.
        import sys
        if "/app" not in sys.path:
            sys.path.insert(0, "/app")
        from app import app as fastapi_app
        return fastapi_app


# --------------------------------------------------------------------------
# Local run (`modal run modal_app.py::ping`)
# --------------------------------------------------------------------------

@app.function(image=image)
def ping():
    return "pong"
