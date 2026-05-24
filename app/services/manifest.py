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
        """Return the catalog, reloading from disk if the cache has expired.

        Cache-miss / staleness reads from disk synchronously — acceptable
        because the manifest is small (kilobytes), the TTL keeps reads
        rare, and an empty/corrupted manifest falls back to a stub.
        """
        if self._cache is None or self._is_stale():
            self._cache = self._load()
            self._loaded_at = time.time()
        return self._cache

    def get_clip(self, clip_id: str):
        """Return one clip's metadata or ``None`` if the id is unknown.

        Linear scan because the catalog is small (~100 clips) and the
        scan happens at most once per HTTP request — building a dict
        index here would add memory + maintenance cost without a
        measurable win.
        """
        for clip in self.get_library().clips:
            if clip.id == clip_id:
                return clip
        return None

    async def load_embedding(self, clip_id: str) -> dict[str, Any] | None:
        """Load one clip's per-frame embedding payload from disk.

        Returns ``None`` if the embedding file is missing — the route
        translates that to a 404. Embedding JSONs are 100s of KB; the
        read + JSON parse happens on a worker thread so the uvicorn
        event loop stays free for other requests while disk I/O is in
        flight. The manifest cache stays sync because it's small and
        hit at most once per TTL window.
        """
        path = self._settings.embeddings_path / f"{clip_id}.json"
        if not path.is_file():
            return None
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
    """Synchronous JSON read — called via ``asyncio.to_thread`` so it
    doesn't block the event loop. Caller is responsible for `is_file()`."""
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache
def get_manifest_service() -> ManifestService:
    """FastAPI dependency factory — returns the process-wide singleton.

    ``lru_cache`` makes this safe to call from every request handler
    without re-instantiating the service or re-reading settings.
    """
    return ManifestService(get_settings())
