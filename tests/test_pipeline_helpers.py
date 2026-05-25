"""Unit tests for the pipeline helpers that don't need any audio
backend or ML deps to exercise.

Covers the normalization + PCA-persistence functions added in PR #140
for issue #48 phase 2 prep, and the OGG/FLAC detection helper added
in PR #130 for the ffmpeg-transcoding path.

These tests run with `tests/` on the path and `data-pipeline/` added
ad-hoc — the pipeline isn't installed as a package, just a folder.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# These tests exercise the data-pipeline helpers, which need numpy +
# scikit-learn (only available in the pipeline venv, not the lean
# backend venv used for the smoke + endpoint tests). Skip the whole
# module if either is missing rather than failing collection.
np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")

PIPELINE_DIR = Path(__file__).resolve().parent.parent / "data-pipeline"
sys.path.insert(0, str(PIPELINE_DIR))


def test_normalize01_with_range_known_input() -> None:
    from compute_embeddings import normalize01_with_range  # type: ignore

    # Two rows × three cols with known min/max per column.
    m = np.array([[0.0, 10.0, 100.0], [4.0, 20.0, 200.0]], dtype=np.float32)
    out, ranges = normalize01_with_range(m)

    # Per-column ranges land as expected.
    assert ranges == [(0.0, 4.0), (10.0, 20.0), (100.0, 200.0)]
    # Output is normalized to [0, 1] (min → 0, max → 1).
    np.testing.assert_allclose(out, [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]])


def test_normalize01_with_range_constant_column_collapses_to_half() -> None:
    """A column with identical values should collapse to 0.5 (no division
    by zero, the caller can reproduce the snap at runtime via the stored
    (lo, lo) range)."""
    from compute_embeddings import normalize01_with_range  # type: ignore

    m = np.array([[5.0, 0.0], [5.0, 10.0], [5.0, 5.0]], dtype=np.float32)
    out, ranges = normalize01_with_range(m)

    assert ranges[0] == (5.0, 5.0)
    assert ranges[1] == (0.0, 10.0)
    np.testing.assert_allclose(out[:, 0], [0.5, 0.5, 0.5])
    np.testing.assert_allclose(out[:, 1], [0.0, 1.0, 0.5])


def test_project_pca_with_model_returns_fitted_pca() -> None:
    """The returned model must carry the mean and components used to
    transform — exactly what a runtime text-prompt projection needs."""
    from compute_embeddings import project_pca_with_model  # type: ignore

    rng = np.random.default_rng(42)
    # 100 samples × 32 dims, structured around a low-dim manifold.
    base = rng.normal(size=(100, 6)).astype(np.float32)
    mix = rng.normal(size=(6, 32)).astype(np.float32)
    m = base @ mix

    out, pca = project_pca_with_model(m, n_components=6)
    assert out.shape == (100, 6)
    assert pca.mean_.shape == (32,)
    assert pca.components_.shape == (6, 32)

    # Re-projecting a fresh sample through the saved PCA must give a
    # vector close to what fit_transform would have returned. We
    # validate by projecting an existing sample (which was part of fit)
    # and comparing.
    fresh = m[0:1]
    projected = (fresh - pca.mean_) @ pca.components_.T
    np.testing.assert_allclose(projected[0], out[0, :6], atol=1e-4)


def test_save_projection_model_round_trips(tmp_path: Path) -> None:
    """The JSON dumped by save_projection_model must round-trip back to
    a usable projection."""
    from compute_embeddings import (  # type: ignore
        project_pca_with_model,
        normalize01_with_range,
        save_projection_model,
    )

    rng = np.random.default_rng(7)
    m = rng.normal(size=(80, 16)).astype(np.float32)
    padded, pca = project_pca_with_model(m, n_components=6)
    _normalized, ranges = normalize01_with_range(padded)

    target = tmp_path / "test.json"
    save_projection_model(
        path=target,
        method="test-method",
        pca=pca,
        per_axis_range=ranges,
        input_dim=16,
    )

    assert target.is_file()
    payload = json.loads(target.read_text(encoding="utf-8"))

    assert payload["method"] == "test-method"
    assert payload["version"] == 1
    assert payload["input_dim"] == 16
    assert payload["n_components"] == 6
    assert len(payload["mean"]) == 16
    assert len(payload["components"]) == 6
    assert all(len(row) == 16 for row in payload["components"])
    assert len(payload["per_axis_range"]) == 6

    # The mean must match what the fitted PCA carries.
    np.testing.assert_allclose(payload["mean"], pca.mean_.tolist(), atol=1e-6)


def test_needs_transcoding_detects_vorbis_ok() -> None:
    """A real Vorbis OGG from the corpus should NOT need transcoding."""
    from curated_downloads import needs_transcoding  # type: ignore

    # Pick the smallest stable PD clip we know is plain OGG/Vorbis.
    candidate = (
        Path(__file__).resolve().parent.parent
        / "data" / "sounds" / "space" / "space-cassini-jupiter.ogg"
    )
    if not candidate.is_file():
        pytest.skip("space-cassini-jupiter.ogg not present locally")
    assert needs_transcoding(candidate) is False


def test_needs_transcoding_detects_garbage() -> None:
    """A file that isn't decodable audio should return True (would be
    transcoded by the pipeline)."""
    from curated_downloads import needs_transcoding  # type: ignore

    import tempfile

    with tempfile.NamedTemporaryFile(
        suffix=".ogg", delete=False, prefix="garbage-"
    ) as fh:
        fh.write(b"this is definitely not an audio container")
        garbage_path = Path(fh.name)
    try:
        assert needs_transcoding(garbage_path) is True
    finally:
        garbage_path.unlink(missing_ok=True)
