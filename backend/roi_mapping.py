"""
Cortex-activity → emotion label.

TRIBE v2 returns predicted fMRI responses on the fsaverage5 cortical mesh,
shaped (n_timesteps, ~20484 vertices). We:

1. Pool vertices into Desikan-Killiany (aparc) ROIs using FreeSurfer's
   fsaverage5 .annot files (fetched via nilearn).
2. Reduce the time dimension to a single response-per-ROI by taking the
   mean of the top-K timesteps (peak response).
3. z-score across ROIs within the sample so different headlines are
   comparable, then score each emotion as Σ (z[roi] × weight) over its ROI
   profile from taxonomy.py.
4. Return argmax emotion, a confidence derived from the margin to 2nd place,
   and the top contributing regions for the hover tooltip.

This is intentionally a simple, explainable heuristic. Swap in a trained
probe in `score_emotions()` without touching the API or extension.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, List, Tuple

import numpy as np

from taxonomy import TAXONOMY, LABELS, all_rois

# --------------------------------------------------------------------------
# Atlas loading. fsaverage5 aparc is distributed with FreeSurfer; nilearn
# can fetch it via fetch_atlas_surf_destrieux (Destrieux 2009) or we can
# ship our own .annot. We use Destrieux because nilearn ships it directly
# and it covers the same cortex. The taxonomy uses Desikan-Killiany names,
# so we maintain a small alias map from DK → Destrieux region prefixes.
# --------------------------------------------------------------------------

# DK label → one or more Destrieux label substrings that overlap anatomically.
# This is approximate; precise atlas alignment is a follow-up.
DK_TO_DESTRIEUX = {
    "caudalanteriorcingulate":  ["G_and_S_cingul-Ant", "G_cingul-Post-ventral"],
    "rostralanteriorcingulate": ["G_and_S_cingul-Ant", "S_cingul-Marginalis"],
    "posteriorcingulate":       ["G_cingul-Post-dorsal", "G_cingul-Post-ventral"],
    "isthmuscingulate":         ["G_cingul-Post-ventral", "S_subparietal"],
    "insula":                   ["G_insular_short", "G_Ins_lg_and_S_cent_ins", "S_circular_insula_ant", "S_circular_insula_sup"],
    "lateralorbitofrontal":     ["G_orbital", "G_front_inf-Orbital", "S_orbital_lateral"],
    "medialorbitofrontal":      ["G_rectus", "G_subcallosal", "S_suborbital"],
    "superiorfrontal":          ["G_front_sup"],
    "rostralmiddlefrontal":     ["G_front_middle"],
    "frontalpole":              ["Pole_frontal"],
    "parsopercularis":          ["G_front_inf-Opercular"],
    "parstriangularis":         ["G_front_inf-Triangul"],
    "superiortemporal":         ["G_temp_sup-Lateral", "G_temp_sup-Plan_tempo", "S_temporal_sup"],
    "middletemporal":           ["G_temporal_middle"],
    "temporalpole":             ["Pole_temporal"],
    "entorhinal":               ["G_oc-temp_med-Parahip", "S_collat_transv_ant"],
    "parahippocampal":          ["G_oc-temp_med-Parahip"],
    "superiorparietal":         ["G_parietal_sup"],
    "inferiorparietal":         ["G_pariet_inf-Angular", "G_pariet_inf-Supramar"],
    "precuneus":                ["G_precuneus"],
}


def _destrieux_lookup(destrieux_labels: List[str]) -> Dict[str, List[int]]:
    """Map Destrieux label-name substring → set of numeric label codes."""
    out: Dict[str, List[int]] = {}
    for i, raw in enumerate(destrieux_labels):
        name = raw.decode() if isinstance(raw, bytes) else raw
        for key in DK_TO_DESTRIEUX.values():
            for token in key:
                if token in name:
                    out.setdefault(token, []).append(i)
    return out


@lru_cache(maxsize=1)
def load_fsaverage5_parcellation() -> Dict[str, np.ndarray]:
    """
    Returns a dict { dk_roi_name : boolean mask over fsaverage5 vertices }.
    Covers both hemispheres concatenated as [lh | rh] (10242 + 10242 = 20484).
    """
    from nilearn import datasets  # imported lazily — heavy dep

    destr = datasets.fetch_atlas_surf_destrieux()
    # destr keys: 'map_left', 'map_right', 'labels'
    lh = np.asarray(destr["map_left"])       # (10242,)
    rh = np.asarray(destr["map_right"])      # (10242,)
    both = np.concatenate([lh, rh])          # (20484,)
    labels = destr["labels"]                 # list of bytes, indexed by code
    code_to_tokens = _destrieux_lookup(labels)

    masks: Dict[str, np.ndarray] = {}
    for dk_name, destrieux_tokens in DK_TO_DESTRIEUX.items():
        codes: List[int] = []
        for tok in destrieux_tokens:
            codes.extend(code_to_tokens.get(tok, []))
        if not codes:
            continue
        mask = np.isin(both, codes)
        if mask.sum() == 0:
            continue
        masks[dk_name] = mask

    missing = set(all_rois()) - set(masks.keys())
    if missing:
        print(f"[roi_mapping] WARNING: no atlas mask found for ROIs: {sorted(missing)}")
    return masks


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------

def _peak_response(preds: np.ndarray, top_k: int = 3) -> np.ndarray:
    """
    preds: (n_timesteps, n_vertices). Return a (n_vertices,) vector holding
    the mean of the top_k absolute timesteps per vertex — a simple peak
    detector robust to which exact TR holds the response.
    """
    if preds.ndim != 2:
        raise ValueError(f"expected 2D preds, got shape {preds.shape}")
    if preds.shape[0] <= top_k:
        return preds.mean(axis=0)
    order = np.argsort(np.abs(preds), axis=0)     # ascending per vertex
    top = order[-top_k:, :]                        # (top_k, n_vertices)
    gathered = np.take_along_axis(preds, top, axis=0)
    return gathered.mean(axis=0)


def _roi_means(vertex_vec: np.ndarray, masks: Dict[str, np.ndarray]) -> Dict[str, float]:
    out = {}
    for name, mask in masks.items():
        if mask.shape[0] != vertex_vec.shape[0]:
            continue
        out[name] = float(vertex_vec[mask].mean())
    return out


def _zscore(d: Dict[str, float]) -> Dict[str, float]:
    if not d:
        return {}
    vals = np.array(list(d.values()), dtype=np.float64)
    mu = vals.mean()
    sd = vals.std()
    if sd < 1e-9:
        return {k: 0.0 for k in d}
    return {k: float((v - mu) / sd) for k, v in d.items()}


def score_emotions(preds: np.ndarray) -> Dict[str, Any]:
    """
    Main entrypoint. Given TRIBE predictions (n_timesteps, n_vertices),
    return { label, confidence, reasoning, top_regions, all_scores }.
    """
    masks = load_fsaverage5_parcellation()
    vertex_vec = _peak_response(preds)
    roi_raw = _roi_means(vertex_vec, masks)
    roi_z = _zscore(roi_raw)

    scores: Dict[str, float] = {}
    contribs: Dict[str, List[Tuple[str, float]]] = {}
    for label in LABELS:
        profile = TAXONOMY[label]["rois"]
        if not profile:
            scores[label] = 0.0  # neutral — handled below
            contribs[label] = []
            continue
        total = 0.0
        parts: List[Tuple[str, float]] = []
        for roi, weight in profile:
            z = roi_z.get(roi)
            if z is None:
                continue
            contribution = z * weight
            total += contribution
            parts.append((roi, contribution))
        scores[label] = total
        contribs[label] = sorted(parts, key=lambda p: abs(p[1]), reverse=True)

    # Neutral wins if no affect label is meaningfully positive.
    affect_scores = {k: v for k, v in scores.items() if k != "neutral"}
    best_affect = max(affect_scores, key=affect_scores.get)
    best_val = affect_scores[best_affect]

    NEUTRAL_THRESHOLD = 0.5  # z-weighted sum below this → neutral
    if best_val < NEUTRAL_THRESHOLD:
        chosen = "neutral"
    else:
        chosen = best_affect

    # Confidence = softmax margin between winner and runner-up, squashed to 0-1.
    sorted_scores = sorted(affect_scores.values(), reverse=True)
    margin = sorted_scores[0] - sorted_scores[1] if len(sorted_scores) > 1 else sorted_scores[0]
    confidence = float(1 / (1 + np.exp(-margin)))  # logistic

    top_regions = contribs.get(chosen, [])[:3]
    reasoning = _reasoning_text(chosen, top_regions) if chosen != "neutral" else "low affect across measured regions"

    return {
        "label": chosen,
        "emoji": TAXONOMY[chosen]["emoji"],
        "confidence": confidence,
        "reasoning": reasoning,
        "top_regions": [{"roi": r, "contribution": round(c, 3)} for r, c in top_regions],
        "all_scores": {k: round(v, 3) for k, v in scores.items()},
    }


def _reasoning_text(label: str, top_regions: List[Tuple[str, float]]) -> str:
    if not top_regions:
        return f"{label}: no strong regional contributors"
    names = ", ".join(r.replace("_", " ") for r, _ in top_regions)
    return f"{label} cued by {names}"
