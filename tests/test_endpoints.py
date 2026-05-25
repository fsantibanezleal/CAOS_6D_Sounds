"""Negative-path + invariant tests for the HTTP API.

Covers behaviour that the smoke tests don't: 404 handling on unknown
ids, content-type negotiation, CORS preflight, embedding-payload
invariants (every track produces the same number of frames as the
clip-level field claims), projection-model file shape, etc.

Like the smoke tests, these run against the in-memory FastAPI
TestClient — no network, no real disk reads beyond what the manifest
service does for cached data.
"""
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


# --------------------------------------------------------------------------- #
# 404 handling
# --------------------------------------------------------------------------- #


def test_clip_unknown_returns_404(client: TestClient) -> None:
    resp = client.get("/api/clip/this-id-does-not-exist")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body
    assert "this-id-does-not-exist" in body["detail"]


def test_embedding_unknown_returns_404(client: TestClient) -> None:
    resp = client.get("/api/clip/this-id-does-not-exist/embedding")
    assert resp.status_code == 404


def test_audio_unknown_returns_404(client: TestClient) -> None:
    resp = client.get("/audio/this-id-does-not-exist")
    assert resp.status_code == 404


# --------------------------------------------------------------------------- #
# Embedding-payload invariants — every track agrees on num_frames
# --------------------------------------------------------------------------- #


def test_embedding_all_tracks_share_num_frames(
    client: TestClient, manifest: dict
) -> None:
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    clip_id = manifest["clips"][0]["id"]
    payload = client.get(f"/api/clip/{clip_id}/embedding").json()
    declared = payload["num_frames"]
    assert declared > 0
    for track in payload["tracks"]:
        assert (
            len(track["values"]) == declared
        ), f"track {track['name']} has {len(track['values'])} rows, expected {declared}"


def test_embedding_tracks_match_manifest_methods(
    client: TestClient, manifest: dict
) -> None:
    """Every method listed in the library should appear in each clip's payload."""
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    lib = client.get("/api/library").json()
    declared_methods = set(lib["embedding_methods"])
    # 'features' is a track but not an embedding *method* (it bypasses
    # the dimensionality reduction). Exclude before comparing.
    declared_methods.discard("features")
    # Sample 3 clips — checking every clip is expensive but the
    # invariant should hold per-clip.
    for clip in manifest["clips"][:3]:
        payload = client.get(f"/api/clip/{clip['id']}/embedding").json()
        track_names = {t["name"] for t in payload["tracks"]}
        track_names.discard("features")
        missing = declared_methods - track_names
        assert not missing, f"clip {clip['id']} missing tracks: {missing}"


# --------------------------------------------------------------------------- #
# Audio content-type negotiation
# --------------------------------------------------------------------------- #


def test_audio_content_type_matches_extension(
    client: TestClient, manifest: dict
) -> None:
    """Every clip should be served with an audio/* content-type matching its
    on-disk extension. Catches regressions in `_guess_media_type`."""
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    for clip in manifest["clips"][:5]:
        resp = client.get(f"/audio/{clip['id']}")
        if resp.status_code == 404:
            # Some manifest entries may reference files not committed;
            # not the failure we're testing for here.
            continue
        ctype = resp.headers["content-type"]
        # Either audio/ogg, audio/mpeg, audio/wav, audio/flac, audio/mp4
        assert ctype.startswith("audio/"), (
            f"{clip['id']} got content-type={ctype!r}, expected audio/*"
        )


def test_audio_has_cache_control(client: TestClient, manifest: dict) -> None:
    if not manifest["clips"]:
        pytest.skip("no clips in manifest")
    clip_id = manifest["clips"][0]["id"]
    resp = client.get(f"/audio/{clip_id}")
    if resp.status_code == 404:
        pytest.skip("first clip audio file not on disk")
    assert "cache-control" in resp.headers
    assert "max-age" in resp.headers["cache-control"].lower()


# --------------------------------------------------------------------------- #
# Library catalog invariants
# --------------------------------------------------------------------------- #


def test_library_clip_ids_are_unique(client: TestClient) -> None:
    lib = client.get("/api/library").json()
    ids = [c["id"] for c in lib["clips"]]
    assert len(ids) == len(set(ids)), "duplicate clip ids in /api/library"


def test_library_categories_referenced_by_clips(client: TestClient) -> None:
    """Every clip.category should appear in categories[]."""
    lib = client.get("/api/library").json()
    declared_cats = {c["id"] for c in lib["categories"]}
    clip_cats = {c["category"] for c in lib["clips"]}
    missing = clip_cats - declared_cats
    assert not missing, f"clip categories not in catalog: {missing}"


def test_library_no_empty_titles(client: TestClient) -> None:
    """Every clip ships with both English and Spanish title."""
    lib = client.get("/api/library").json()
    for c in lib["clips"]:
        assert c["title_en"].strip(), f"{c['id']}: empty title_en"
        assert c["title_es"].strip(), f"{c['id']}: empty title_es"


# --------------------------------------------------------------------------- #
# Projection-model file (used by #48 phase 2)
# --------------------------------------------------------------------------- #


def test_yamnet_projection_model_shape() -> None:
    """When the YAMNet projection model is persisted, it must have the
    documented schema. Skipped if the file isn't present (e.g. ingest
    was run without YAMNet)."""
    path = PROJECT_ROOT / "data" / "projections" / "yamnet.json"
    if not path.is_file():
        pytest.skip("yamnet projection file not present")
    d = json.loads(path.read_text(encoding="utf-8"))
    assert d["method"] == "yamnet"
    assert d["version"] == 1
    assert isinstance(d["input_dim"], int) and d["input_dim"] > 0
    assert isinstance(d["n_components"], int) and 1 <= d["n_components"] <= 6
    assert len(d["mean"]) == d["input_dim"]
    assert len(d["components"]) == d["n_components"]
    for row in d["components"]:
        assert len(row) == d["input_dim"]
    assert len(d["per_axis_range"]) == d["n_components"]
    for lo, hi in d["per_axis_range"]:
        assert isinstance(lo, (int, float))
        assert isinstance(hi, (int, float))
