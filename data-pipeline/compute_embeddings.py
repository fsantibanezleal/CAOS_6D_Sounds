"""Project each clip's MFCC sequence into 6 dimensions.

Three projections are produced when the corresponding library is installed:

* **PCA** — linear, deterministic. Always available.
* **t-SNE** — non-linear, focuses on local structure (van der Maaten & Hinton).
* **UMAP** — non-linear, faster than t-SNE, often better global topology
  (McInnes et al., 2018). Optional dependency; skipped if missing.

Each projection is fitted on the *concatenated* per-frame matrix across the
whole library so frames from different clips live in the same space and can
be compared visually. After fitting, every clip is split back into its own
6D track and min-max normalized per dimension to ``[0, 1]``.
"""
from __future__ import annotations

import warnings
from typing import Iterable

import numpy as np

from common import EMBEDDING_METHODS

try:
    from sklearn.decomposition import PCA
    from sklearn.manifold import TSNE
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "scikit-learn is required. Install pipeline deps:\n"
        "  pip install -r data-pipeline/requirements.txt"
    ) from exc


def _try_import_umap():
    try:
        import umap  # type: ignore
        return umap
    except ImportError:
        return None


# --------------------------------------------------------------------------- #
# Per-axis normalization
# --------------------------------------------------------------------------- #


def normalize01(matrix: np.ndarray) -> np.ndarray:
    """Min-max normalize each column to [0, 1].

    Constant columns collapse to 0.5 (centered) instead of producing NaNs.
    """
    out = matrix.astype(np.float32, copy=True)
    for j in range(out.shape[1]):
        col = out[:, j]
        lo, hi = float(col.min()), float(col.max())
        if hi - lo < 1e-9:
            out[:, j] = 0.5
        else:
            out[:, j] = (col - lo) / (hi - lo)
    return out


# --------------------------------------------------------------------------- #
# Per-method projection
# --------------------------------------------------------------------------- #


def project_pca(matrix: np.ndarray, n_components: int = 6) -> np.ndarray:
    n_components = min(n_components, matrix.shape[1], matrix.shape[0])
    proj = PCA(n_components=n_components, svd_solver="auto", random_state=42)
    out = proj.fit_transform(matrix)
    return _pad_to_6(out)


def project_tsne(matrix: np.ndarray) -> np.ndarray:
    """t-SNE in **3 dimensions** doubled to 6 (D1..D3 + D4..D6 = re-mapped).

    Rationale: scikit-learn's t-SNE supports up to 3 components when the
    method is 'barnes_hut' (the default). For 6D output we run t-SNE twice
    with different perplexities and stack the results — this keeps the
    projection deterministic and avoids the slower 'exact' method, while
    still giving the frontend six independent axes to map.
    """
    n = matrix.shape[0]
    perplex_a = max(5.0, min(30.0, n / 8.0))
    perplex_b = max(5.0, min(50.0, n / 4.0))

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        a = TSNE(
            n_components=3,
            perplexity=perplex_a,
            init="pca",
            learning_rate="auto",
            random_state=42,
        ).fit_transform(matrix)
        b = TSNE(
            n_components=3,
            perplexity=perplex_b,
            init="pca",
            learning_rate="auto",
            random_state=43,
        ).fit_transform(matrix)
    return np.hstack([a, b])


def project_umap(matrix: np.ndarray, n_components: int = 6) -> np.ndarray | None:
    umap = _try_import_umap()
    if umap is None:
        return None
    n_components = min(n_components, matrix.shape[1])
    n_neighbors = max(5, min(30, matrix.shape[0] // 10))
    proj = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        random_state=42,
    )
    return proj.fit_transform(matrix)


def _pad_to_6(matrix: np.ndarray) -> np.ndarray:
    if matrix.shape[1] >= 6:
        return matrix[:, :6]
    pad = np.zeros((matrix.shape[0], 6 - matrix.shape[1]), dtype=matrix.dtype)
    return np.hstack([matrix, pad])


# --------------------------------------------------------------------------- #
# Library-level projection
# --------------------------------------------------------------------------- #


def fit_all(
    mfcc_matrices: Iterable[tuple[str, np.ndarray]],
) -> dict[str, dict[str, np.ndarray]]:
    """Fit each method on the concatenated corpus and split back per clip.

    Returns a nested mapping ``{method_name: {clip_id: 6D matrix}}``.

    Skips methods that fail or whose dependency is missing — the calling
    code reports the resulting ``embedding_methods`` list to the manifest.
    """
    items = list(mfcc_matrices)
    if not items:
        return {}

    big = np.vstack([m for _, m in items])
    boundaries: list[tuple[str, int, int]] = []
    cursor = 0
    for clip_id, m in items:
        boundaries.append((clip_id, cursor, cursor + m.shape[0]))
        cursor += m.shape[0]

    out: dict[str, dict[str, np.ndarray]] = {}

    # PCA — always available
    pca_full = project_pca(big)
    out["pca"] = {
        cid: normalize01(pca_full[a:b]) for cid, a, b in boundaries
    }

    # t-SNE — bail out gracefully if the corpus is tiny
    if big.shape[0] >= 12:
        try:
            tsne_full = project_tsne(big)
            out["tsne"] = {
                cid: normalize01(tsne_full[a:b]) for cid, a, b in boundaries
            }
        except Exception as exc:  # noqa: BLE001
            print(f"  tsne skipped: {exc}")

    # UMAP — optional dependency
    umap_full = project_umap(big)
    if umap_full is not None:
        out["umap"] = {
            cid: normalize01(umap_full[a:b]) for cid, a, b in boundaries
        }

    return out


def available_methods(produced: dict[str, dict[str, np.ndarray]]) -> list[str]:
    """Return the methods actually produced, in the canonical UI order."""
    return [m for m in EMBEDDING_METHODS if m in produced]
