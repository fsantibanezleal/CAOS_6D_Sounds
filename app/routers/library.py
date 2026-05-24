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
    """Return metadata for a single clip — same shape as one entry in
    ``/api/library``'s ``clips`` array.

    Useful when the caller already has a clip id (deep link, shared URL,
    library cache miss) and wants the full record without re-fetching the
    whole catalog. Returns 404 if the id is unknown.
    """
    clip = get_manifest_service().get_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail=f"clip '{clip_id}' not found")
    return clip


@router.get("/clip/{clip_id}/embedding")
async def get_clip_embedding(clip_id: str):
    """Per-clip embedding payload — frame-major, normalized to [0, 1].

    Async-def + asyncio.to_thread inside the service: the JSON file is
    100s of KB, and reading it on a worker thread keeps the uvicorn
    event loop free for other requests while the disk is busy.
    """
    payload = await get_manifest_service().load_embedding(clip_id)
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail=f"embedding for clip '{clip_id}' not found",
        )
    return payload
