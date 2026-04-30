"""Auralis — FastAPI application entrypoint.

Wires up middlewares, routers and the static SPA mount. The API surface is:

* ``GET /health``                          — liveness probe
* ``GET /api/library``                     — full catalog
* ``GET /api/clip/{id}``                   — single clip metadata
* ``GET /api/clip/{id}/embedding``         — per-frame 6D vectors
* ``GET /audio/{id}``                      — audio asset
* ``GET /``                                — built React SPA (when present)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.config import get_settings
from app.routers import audio, library


settings = get_settings()

app = FastAPI(
    title="Auralis",
    description="Real-time 6D visualization of audio in low-dimensional embedding space.",
    version=__version__,
    default_response_class=ORJSONResponse,
    docs_url="/api/docs",
    redoc_url=None,
)

# --------------------------------------------------------------------------- #
# Middleware
# --------------------------------------------------------------------------- #

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


@app.get("/health", response_class=PlainTextResponse)
def health() -> str:
    return "ok"


@app.get("/healthz", response_class=PlainTextResponse, include_in_schema=False)
def healthz() -> str:
    return "ok"


# --------------------------------------------------------------------------- #
# Routers
# --------------------------------------------------------------------------- #

app.include_router(library.router)
app.include_router(audio.router)


# --------------------------------------------------------------------------- #
# Static SPA mount (frontend/dist) — only when present
# --------------------------------------------------------------------------- #

_dist = settings.frontend_dist_path
if _dist.is_dir():
    # Mount Vite's hashed asset directory at /assets so the SPA loads
    # `/assets/*.js` and `/assets/*.css` as built.
    assets_dir = _dist / "assets"
    if assets_dir.is_dir():
        app.mount(
            "/assets",
            StaticFiles(directory=str(assets_dir)),
            name="assets",
        )

    @app.get("/", include_in_schema=False)
    def root() -> FileResponse:
        return FileResponse(_dist / "index.html")

    # SPA fallback — serve index.html for any non-API route the SPA owns.
    # The route is registered after all API routers so it never shadows them.
    @app.get("/{path:path}", include_in_schema=False)
    def spa_fallback(path: str) -> FileResponse:
        target = _dist / path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_dist / "index.html")
