"""Pydantic models for the Auralis public API.

These models describe the shape of the manifest and the per-clip embedding
files produced by the offline data pipeline. The frontend consumes the same
JSON directly without any post-processing on the server.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Library / catalog
# --------------------------------------------------------------------------- #


class Category(BaseModel):
    """A grouping of sound clips (birds, mammals, speeches, ...)."""

    id: str = Field(..., description="Stable kebab-case identifier")
    name_en: str
    name_es: str
    description_en: str = ""
    description_es: str = ""
    icon: str | None = Field(
        default=None,
        description="Optional emoji or short icon code for UI rendering",
    )


class SoundClip(BaseModel):
    """Catalog entry for a single audio clip.

    Embedding data is stored separately under ``data/embeddings/<id>.json``
    to keep the catalog response small.
    """

    id: str = Field(..., description="Stable kebab-case identifier")
    title_en: str
    title_es: str
    category: str
    duration_seconds: float
    sample_rate: int
    audio_path: str = Field(
        ...,
        description="Path served at /audio/<id> — relative to the data dir",
    )
    embedding_path: str = Field(
        ...,
        description="Path served at /embeddings/<id> — relative to the data dir",
    )
    source: str = Field(
        ...,
        description="Original source of the recording (e.g. 'Synthetic', "
        "'Wikimedia Commons', 'NASA')",
    )
    license: str = Field(
        ...,
        description="License identifier (CC0, CC-BY-4.0, Public Domain, ...)",
    )
    attribution: str = Field(default="", description="Required attribution string")
    tags: list[str] = Field(default_factory=list)


class SoundLibrary(BaseModel):
    """Top-level manifest served from /api/library."""

    version: str
    generated_at: str
    feature_names: list[str] = Field(
        ...,
        description="Names of the per-frame scalar features (one per dimension)",
    )
    embedding_methods: list[str] = Field(
        ...,
        description=(
            "Names of the available 6D non-linear projections "
            "('pca', 'tsne', 'umap', ...)"
        ),
    )
    categories: list[Category]
    clips: list[SoundClip]


# --------------------------------------------------------------------------- #
# Per-clip embedding payloads
# --------------------------------------------------------------------------- #


class EmbeddingTrack(BaseModel):
    """A single time-series of 6D-normalized vectors.

    The shape is ``(num_frames, 6)``. Values are unit-normalized to ``[0, 1]``
    on each axis so frontends can mix dimensions across clips without
    re-fitting scales.
    """

    name: Literal[
        "features",
        "pca",
        "tsne",
        "umap",
    ]
    description_en: str
    description_es: str
    dim_labels: list[str] = Field(
        ...,
        description=(
            "Human-readable label per dimension. For 'features' these are "
            "spectral feature names; for projections they are typically D1..D6."
        ),
    )
    values: list[list[float]] = Field(
        ...,
        description="Frame-major matrix, shape (num_frames, 6), normalized to [0,1]",
    )


class EmbeddingFrame(BaseModel):
    """Optional per-frame raw spectral metadata used by some side panels."""

    rms: list[float]
    spectral_centroid_hz: list[float]
    dominant_pitch_hz: list[float]


class ClipEmbedding(BaseModel):
    """Full embedding payload for a single clip — served at /embeddings/<id>."""

    id: str
    duration_seconds: float
    sample_rate: int
    hop_seconds: float = Field(
        ...,
        description="Time step between frames (s). frame_t = i * hop_seconds.",
    )
    num_frames: int
    tracks: list[EmbeddingTrack]
    raw: EmbeddingFrame | None = None
