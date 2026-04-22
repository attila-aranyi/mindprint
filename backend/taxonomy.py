"""
MindPrint taxonomy + ROI-to-emotion mapping.

The 9 labels are the same as the Chrome extension's. For each label we list
Desikan-Killiany (aparc) cortical regions whose activation/deactivation tends
to track that affect dimension in the neuroscience literature, with a weight
(+1 = activation aligns with the label, -1 = deactivation aligns).

This is a first-pass heuristic, not a validated mapping — the point is to make
the cortex→emotion seam explicit and easy to iterate on. Swap in a trained
probe later without touching the extension.

References the mapping is loosely based on:
- Lindquist et al. (2012) — neural basis of emotion, meta-analysis
- Saarimäki et al. (2016) — discrete emotions in the brain
- Kragel & LaBar (2016) — decoding emotion categories from fMRI
- Wager et al. (2015) — affect meta-analysis, insula/ACC

ROI names use FreeSurfer's Desikan-Killiany labels. Side-agnostic here; the
mapping module pools left+right hemispheres.
"""

TAXONOMY = {
    "outrage": {
        "emoji": "😡",
        "hint": "anger at a group, person, or policy",
        "rois": [
            # Anger / hostility: dACC, anterior insula, lateral OFC
            ("caudalanteriorcingulate", +1.0),
            ("rostralanteriorcingulate", +0.5),
            ("insula", +1.0),
            ("lateralorbitofrontal", +0.7),
            ("superiorfrontal", +0.3),
        ],
    },
    "fear": {
        "emoji": "😨",
        "hint": "worry about a threat or danger",
        "rois": [
            # Fear: temporal pole (proxy for amygdala reach), anterior insula,
            # parahippocampal, dACC. Amygdala itself is subcortical and not
            # on the fsaverage5 cortical mesh.
            ("temporalpole", +1.0),
            ("entorhinal", +0.8),
            ("parahippocampal", +0.8),
            ("insula", +0.7),
            ("caudalanteriorcingulate", +0.5),
        ],
    },
    "curiosity": {
        "emoji": "🤔",
        "hint": "intrigue, clickbait mystery, novelty",
        "rois": [
            # Curiosity / uncertainty / novelty: dACC, lateral PFC, IPS,
            # ventromedial PFC (reward anticipation of info).
            ("caudalanteriorcingulate", +0.8),
            ("rostralmiddlefrontal", +0.8),
            ("superiorparietal", +0.6),
            ("medialorbitofrontal", +0.6),
            ("frontalpole", +0.4),
        ],
    },
    "hope": {
        "emoji": "🌱",
        "hint": "optimism, positive change, reward anticipation",
        "rois": [
            # Positive valence / reward: vmPFC / mOFC, rostral ACC.
            ("medialorbitofrontal", +1.0),
            ("rostralanteriorcingulate", +0.8),
            ("superiorfrontal", +0.3),
            # Deactivation of threat regions supports a positive read.
            ("insula", -0.4),
        ],
    },
    "sadness": {
        "emoji": "😢",
        "hint": "empathy, grief, loss",
        "rois": [
            # Sadness: subgenual ACC (proxy: rostral ACC), mPFC, PCC.
            ("rostralanteriorcingulate", +1.0),
            ("medialorbitofrontal", +0.5),
            ("posteriorcingulate", +0.7),
            ("isthmuscingulate", +0.5),
            # Reduced lateral PFC (ruminative disengagement).
            ("rostralmiddlefrontal", -0.3),
        ],
    },
    "pride": {
        "emoji": "🦚",
        "hint": "in-group affirmation, accomplishment, self-reference",
        "rois": [
            # Self-referential / social reward: mPFC, PCC, TPJ.
            ("medialorbitofrontal", +0.8),
            ("superiorfrontal", +0.6),
            ("posteriorcingulate", +0.8),
            ("inferiorparietal", +0.6),
            ("precuneus", +0.5),
        ],
    },
    "amusement": {
        "emoji": "😄",
        "hint": "humor, lightness, entertainment",
        "rois": [
            # Humor: temporo-parietal integration + reward.
            ("superiortemporal", +0.7),
            ("middletemporal", +0.6),
            ("inferiorparietal", +0.5),
            ("medialorbitofrontal", +0.5),
            ("rostralanteriorcingulate", +0.3),
        ],
    },
    "disgust": {
        "emoji": "🤢",
        "hint": "moral or physical revulsion",
        "rois": [
            # Disgust: strongly anterior insula, frontal operculum, OFC.
            ("insula", +1.0),
            ("parsopercularis", +0.7),
            ("parstriangularis", +0.4),
            ("lateralorbitofrontal", +0.6),
        ],
    },
    "neutral": {
        "emoji": "◽",
        "hint": "informational, low emotional valence",
        # Neutral is the baseline: it wins when no other label has a clearly
        # above-baseline score. No ROI profile needed; see roi_mapping.py.
        "rois": [],
    },
}

LABELS = list(TAXONOMY.keys())

# All unique ROI names referenced across the taxonomy.
def all_rois():
    seen = set()
    for entry in TAXONOMY.values():
        for roi, _ in entry["rois"]:
            seen.add(roi)
    return sorted(seen)
