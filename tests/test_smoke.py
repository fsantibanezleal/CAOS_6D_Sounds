"""Smoke tests — boot the FastAPI app and hit every public endpoint."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


PROJECT_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def manifest() -> dict:
    path = PROJECT_ROOT / "data" / "manifest.json"
    if not path.is_file():
        pytest.skip("data/manifest.json missing — run the pipeline first")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def test_health(client: TestClient) -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.text == "ok"


def test_library_endpoint(client: TestClient) -> None:
    resp = client.get("/api/library")
    assert resp.status_code == 200
    payload = resp.json()
    assert "clips" in payload
    assert "categories" in payload
    assert "embedding_methods" in payload


def test_clip_metadata(client: TestClient, manifest: dict) -> None:
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    clip_id = manifest["clips"][0]["id"]
    resp = client.get(f"/api/clip/{clip_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == clip_id


def test_embedding_shape(client: TestClient, manifest: dict) -> None:
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    clip_id = manifest["clips"][0]["id"]
    resp = client.get(f"/api/clip/{clip_id}/embedding")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["num_frames"] > 0
    assert len(payload["tracks"]) >= 1
    for track in payload["tracks"]:
        for row in track["values"][:5]:
            assert len(row) == 6
            for v in row:
                assert 0.0 <= v <= 1.0


def test_audio_streamed(client: TestClient, manifest: dict) -> None:
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    clip_id = manifest["clips"][0]["id"]
    resp = client.get(f"/audio/{clip_id}")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/")
    assert len(resp.content) > 0
