"""Streaming endpoint for audio assets.

Audio files are served by FastAPI directly during local development (so the
backend works in isolation). In production, nginx serves the same path with
``alias`` for better throughput; the route stays as a fallback for resilience.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services import get_manifest_service


router = APIRouter(tags=["audio"])


@router.get("/audio/{clip_id}")
def stream_audio(clip_id: str) -> FileResponse:
    service = get_manifest_service()
    clip = service.get_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail=f"clip '{clip_id}' not found")

    audio_file = service._settings.data_path / clip.audio_path
    if not audio_file.is_file():
        raise HTTPException(status_code=404, detail=f"audio file missing for '{clip_id}'")

    media_type = _guess_media_type(audio_file.suffix.lower())
    return FileResponse(
        path=audio_file,
        media_type=media_type,
        filename=audio_file.name,
        headers={"Cache-Control": "public, max-age=86400"},
    )


def _guess_media_type(suffix: str) -> str:
    return {
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".opus": "audio/ogg; codecs=opus",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
    }.get(suffix, "application/octet-stream")
