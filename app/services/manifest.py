"""Manifest and embedding loaders backed by the on-disk JSON files.

The data pipeline writes:

* ``data/manifest.json``       — the top-level library catalog
* ``data/embeddings/<id>.json`` — one file per clip, larger payload

Both are served as static JSON to the frontend. This service layer just
provides cached, typed access for the API routers and a graceful fallback
manifest when no clips are present yet (so the app can boot on a fresh
clone).
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from app.config import Settings, get_settings
from app.models.schemas import Category, SoundLibrary


_FALLBACK_CATEGORIES = [
    Category(
        id="synthetic",
        name_en="Synthetic",
        name_es="Sintéticos",
        description_en="Algorithmically generated calibration sounds",
        description_es="Sonidos de calibración generados por algoritmo",
        icon="WAVE",
    ),
]


def _empty_library() -> SoundLibrary:
    return SoundLibrary(
        version="0.0.0",
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        feature_names=[
            "rms",
            "zero_crossing_rate",
            "spectral_centroid",
            "spectral_rolloff",
            "spectral_bandwidth",
            "spectral_flatness",
        ],
        embedding_methods=["pca"],
        categories=_FALLBACK_CATEGORIES,
        clips=[],
    )


class ManifestService:
    """Loads and caches the manifest with a TTL.

    The TTL exists so the developer can regenerate ``data/manifest.json`` and
    see the change without restarting the server.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._cache: SoundLibrary | None = None
        self._loaded_at: float = 0.0

    # ------------------------------------------------------------------ #

    def get_library(self) -> SoundLibrary:
        if self._cache is None or self._is_stale():
            self._cache = self._load()
            self._loaded_at = time.time()
        return self._cache

    def get_clip(self, clip_id: str):
        for clip in self.get_library().clips:
            if clip.id == clip_id:
                return clip
        return None

    async def load_embedding(self, clip_id: str) -> dict[str, Any] | None:
        path = self._settings.embeddings_path / f"{clip_id}.json"
        if not path.is_file():
            return None
        # Embedding JSONs are 100s of KB; run the read+parse on a worker
        # thread so async-def callers (the API route) don't stall the
        # event loop while the disk is slow or another request is in
        # flight. The cache for the manifest itself stays sync because
        # it's hit at most once per TTL window.
        return await asyncio.to_thread(_read_json, path)

    # ------------------------------------------------------------------ #

    def _is_stale(self) -> bool:
        return (time.time() - self._loaded_at) > self._settings.cache_ttl_manifest

    def _load(self) -> SoundLibrary:
        path: Path = self._settings.manifest_path
        if not path.is_file():
            return _empty_library()
        try:
            with path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            return SoundLibrary.model_validate(payload)
        except (json.JSONDecodeError, ValueError) as exc:
            # Corrupted manifest: behave like an empty library so the API
            # stays up, but log loudly — the pipeline owner needs to see
            # this at next regen, not silently get an empty catalogue.
            logger.exception("Manifest at %s is corrupted: %s", path, exc)
            return _empty_library()


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache
def get_manifest_service() -> ManifestService:
    return ManifestService(get_settings())
