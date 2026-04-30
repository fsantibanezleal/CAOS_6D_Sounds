"""End-to-end pipeline runner.

  python data-pipeline/ingest.py [--seed-synthetic]

Stages:
1. (optional) generate the synthetic seed clips
2. discover audio files under data/sounds/<category>/
3. extract per-frame features
4. fit PCA / t-SNE / UMAP across the corpus
5. write per-clip embedding JSON + the top-level manifest

The script is idempotent: re-running overwrites manifest.json and the
per-clip JSON files, but never touches the audio.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np  # noqa: F401  (re-exported via type hints in modules)

# Make sibling modules importable when invoked as `python data-pipeline/ingest.py`
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_manifest import write_clip_embedding, write_manifest
from compute_embeddings import available_methods, fit_all, fit_yamnet
from extract_features import discover_clips, extract_clip
from synthetic_seeds import write_seeds
from yamnet_embeddings import (
    YAMNET_SR,
    try_yamnet,
    upsample_to_hop,
    yamnet_embedding,
)


def main() -> int:
    ap = argparse.ArgumentParser(description="Auralis offline data pipeline")
    ap.add_argument(
        "--seed-synthetic",
        action="store_true",
        help="Regenerate the synthetic seed clips before ingestion",
    )
    args = ap.parse_args()

    if args.seed_synthetic:
        print("[1/5] Writing synthetic seed clips...")
        for path in write_seeds():
            print(f"  + {path.name}")
    else:
        print("[1/5] Skipping synthetic seed generation (use --seed-synthetic)")

    print("[2/5] Discovering audio clips...")
    clips = discover_clips()
    if not clips:
        print("No audio clips found under data/sounds/. Aborting.")
        return 1
    print(f"  found {len(clips)} clip(s)")

    print("[3/5] Extracting per-frame features...")
    feature_set = []
    for path, category in clips:
        feats = extract_clip(path, category)
        feature_set.append(feats)
        print(
            f"  [{category}] {feats.clip_id}  frames={feats.num_frames}  "
            f"duration={feats.duration_seconds:.1f}s"
        )

    print("[4/6] Fitting MFCC projections (PCA / t-SNE / UMAP)...")
    projections_by_method = fit_all([(f.clip_id, f.mfcc) for f in feature_set])

    print("[5/6] Computing YAMNet deep embeddings (optional)...")
    yamnet_model = try_yamnet()
    yamnet_per_clip: dict[str, np.ndarray] | None = None
    if yamnet_model is not None:
        yamnet_matrices: list[tuple[str, np.ndarray]] = []
        for f in feature_set:
            emb = yamnet_embedding(yamnet_model, f.raw_audio, f.sample_rate)
            upsampled = upsample_to_hop(emb, f.num_frames, f.hop_seconds)
            yamnet_matrices.append((f.clip_id, upsampled))
            print(f"  [{f.category}] {f.clip_id}  yamnet frames={emb.shape[0]} -> {upsampled.shape[0]}")
        yamnet_per_clip = fit_yamnet(yamnet_matrices)
        if yamnet_per_clip is not None:
            projections_by_method["yamnet"] = yamnet_per_clip
    else:
        print("  yamnet skipped (tensorflow_hub unavailable or model load failed)")

    methods = available_methods(projections_by_method)
    print(f"  methods produced: {', '.join(methods) if methods else '(none)'}")

    print("[6/6] Writing manifest + per-clip embedding JSONs...")
    for f in feature_set:
        per_clip = {m: projections_by_method[m][f.clip_id] for m in methods}
        target = write_clip_embedding(f, per_clip)
        size_kb = target.stat().st_size / 1024
        print(f"  -> {target.name}  ({size_kb:.1f} KB)")

    manifest_path = write_manifest(feature_set, methods)
    print(f"\nManifest written: {manifest_path}")
    print("Done.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
