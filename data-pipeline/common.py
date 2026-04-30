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
# 22 scalar features per analysis frame.
SCALAR_FEATURES: Final[tuple[str, ...]] = (
    # Core energy / time domain
    "rms",
    "zero_crossing_rate",
    "loudness_db",  # 20*log10(RMS), clamped to [-80, 0] dB
    # Spectral shape
    "spectral_centroid",
    "spectral_rolloff",
    "spectral_bandwidth",
    "spectral_flatness",
    "spectral_contrast_mean",
    "spectral_entropy",  # Shannon entropy of the normalized spectrum
    "spectral_skewness",  # 3rd standardized moment of the spectrum
    "spectral_kurtosis",  # 4th standardized moment, excess (Fisher) form
    # Spectral sub-band energies (4 octave-spaced bands)
    "energy_low",      # 0-250 Hz
    "energy_mid_low",  # 250-1000 Hz
    "energy_mid_high",  # 1-4 kHz
    "energy_high",     # 4-22 kHz
    # Pitch + harmonic content
    "dominant_pitch",
    "pitch_confidence",
    "chroma_dominant",  # index of the most active chroma bin (0..11) / 11
    "harmonic_ratio",  # share of energy in the harmonic component (HPSS)
    # Rhythm
    "tempo_proxy",     # rolling std-dev of onset strength (per-frame)
    "onset_strength",
    "onset_density",   # local onset rate (peaks per second, smoothed window)
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

# Static-per-clip metadata derived from the whole signal (not per-frame).
CLIP_LEVEL_FEATURES: Final[tuple[str, ...]] = (
    "tempo_bpm",        # estimated tempo in beats per minute
    "key_pitch_class",  # 0..11 (C..B)
    "key_mode",         # 0 = minor, 1 = major
)

EMBEDDING_METHODS: Final[tuple[str, ...]] = (
    "pca",
    "tsne",
    "umap",
    "tonnetz",  # 6D harmonic space (Chew 2002; librosa.feature.tonnetz)
    "yamnet",
)
