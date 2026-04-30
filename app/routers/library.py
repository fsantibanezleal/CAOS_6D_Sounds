"""HTTP endpoints exposing the sound library + per-clip embeddings."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import SoundClip, SoundLibrary
from app.services import get_manifest_service


router = APIRouter(prefix="/api", tags=["library"])


@router.get("/library", response_model=SoundLibrary)
def get_library() -> SoundLibrary:
    """Return the full catalog of categories and clips.

    The payload is small (kilobytes) and cached client-side; the heavier
    per-frame embedding tracks are fetched lazily via /api/clip/{id}/embedding.
    """
    return get_manifest_service().get_library()


@router.get("/clip/{clip_id}", response_model=SoundClip)
def get_clip(clip_id: str) -> SoundClip:
    clip = get_manifest_service().get_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail=f"clip '{clip_id}' not found")
    return clip


@router.get("/clip/{clip_id}/embedding")
def get_clip_embedding(clip_id: str):
    """Per-clip embedding payload — frame-major, normalized to [0, 1]."""
    payload = get_manifest_service().load_embedding(clip_id)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail=f"embedding for clip '{clip_id}' not found",
        )
    return payload
