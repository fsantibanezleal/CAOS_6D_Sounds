"""Shared constants, paths and feature-name conventions for the pipeline.

Keeping these in a single module ensures that any change to the feature
roster (names, order) automatically propagates to feature extraction,
embedding computation, and manifest generation.
"""
from __future__ import annotations

from pathlib import Path
from typing import Final


# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parent.parent
DATA_DIR: Final[Path] = PROJECT_ROOT / "data"
SOUNDS_DIR: Final[Path] = DATA_DIR / "sounds"
EMBEDDINGS_DIR: Final[Path] = DATA_DIR / "embeddings"
MANIFEST_PATH: Final[Path] = DATA_DIR / "manifest.json"
CATEGORIES_PATH: Final[Path] = DATA_DIR / "categories.json"


# --------------------------------------------------------------------------- #
# Audio analysis parameters
# --------------------------------------------------------------------------- #

# 20 fps frame rate keeps the visualization fluid without bloating the JSON.
TARGET_SAMPLE_RATE: Final[int] = 22050
HOP_SECONDS: Final[float] = 0.05
WINDOW_SECONDS: Final[float] = 0.10

# Mel-frequency cepstral coefficients used both as raw "features" track
# components and as the input to PCA / t-SNE / UMAP.
N_MFCC: Final[int] = 13


# --------------------------------------------------------------------------- #
# Feature roster
# --------------------------------------------------------------------------- #

# Order matters: the frontend treats the same indices as the same feature.
SCALAR_FEATURES: Final[tuple[str, ...]] = (
    "rms",
    "zero_crossing_rate",
    "spectral_centroid",
    "spectral_rolloff",
    "spectral_bandwidth",
    "spectral_flatness",
    "spectral_contrast_mean",
    "dominant_pitch",
    "pitch_confidence",
    "tempo_proxy",  # local energy-flux variance — coarse rhythmic indicator
    "chroma_dominant",  # index of the most active chroma bin (0..11) / 11
    "onset_strength",
)

# The 6D 'features' track surfaces a curated subset of the scalar features so
# the frontend can drive the viz with interpretable axes out of the box.
DEFAULT_FEATURE_AXES: Final[tuple[str, ...]] = (
    "spectral_centroid",
    "spectral_rolloff",
    "spectral_bandwidth",
    "rms",
    "zero_crossing_rate",
    "spectral_flatness",
)

EMBEDDING_METHODS: Final[tuple[str, ...]] = ("pca", "tsne", "umap", "yamnet")
