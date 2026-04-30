"""YAMNet-based deep audio embeddings.

YAMNet (Hershey et al. 2017, https://research.google/pubs/pub45611/) is a
pretrained CNN trained on AudioSet that classifies audio into 521 sound
classes. Its penultimate layer produces 1024-dimensional embeddings every
~480 ms — a high-level, semantically rich representation of audio,
qualitatively similar to OpenL3 / PANNs but well-maintained and
compatible with current TensorFlow.

We expose YAMNet as an *additional* embedding method alongside PCA /
t-SNE / UMAP. Conceptually:

* PCA / t-SNE / UMAP fit a 6D space over MFCC vectors *of this corpus*.
  The space is corpus-relative — same recording in a different library
  yields a different projection.
* YAMNet emits a fixed, pretrained 1024-D vector per ~480 ms frame.
  We then PCA-project to 6D, but the input vectors are absolute
  (the same clip always gives the same embedding regardless of corpus).

Both are useful — the user can switch between them in the UI.

The dependency stays optional. When ``tensorflow_hub`` is missing or
the model can't be downloaded, the YAMNet track is silently skipped
and ``available_methods()`` reports only the methods that succeeded.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

import numpy as np

# Reduce TF chatter to errors only.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

if TYPE_CHECKING:
    pass


# YAMNet is hardwired to 16 kHz mono.
YAMNET_SR = 16000

# YAMNet frame hop (s). The model returns one embedding every ~480 ms.
YAMNET_FRAME_HOP_S = 0.48


def try_yamnet():
    """Lazy-load the YAMNet model. Returns None if the dependency is missing."""
    try:
        import tensorflow_hub as hub  # type: ignore
    except ImportError:
        return None
    try:
        # Pin to v1 of the published module.
        return hub.load("https://tfhub.dev/google/yamnet/1")
    except Exception as exc:  # noqa: BLE001
        print(f"  yamnet skipped: {exc}")
        return None


def yamnet_embedding(model, y: np.ndarray, sr: int) -> np.ndarray:
    """Run YAMNet on a single waveform.

    Returns an ``(num_yamnet_frames, 1024)`` float32 matrix.
    """
    if sr != YAMNET_SR:
        # YAMNet hardwires 16 kHz. resample with librosa for fidelity.
        import librosa

        y = librosa.resample(y, orig_sr=sr, target_sr=YAMNET_SR)
    waveform = y.astype(np.float32)
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    _, embeddings, _ = model(waveform)
    return embeddings.numpy().astype(np.float32)


def upsample_to_hop(
    yamnet_emb: np.ndarray,
    target_n: int,
    target_hop_s: float,
) -> np.ndarray:
    """Repeat YAMNet's coarse 480 ms frames to match the target frame rate.

    YAMNet emits one vector every 480 ms; the rest of the pipeline runs
    at 50 ms (20 fps). We use nearest-neighbour upsampling so each
    50 ms slot sees the YAMNet embedding active at that moment — this
    keeps the 6D trail smooth while preserving YAMNet's coarser
    temporal granularity.

    Returns ``(target_n, 1024)``.
    """
    if yamnet_emb.shape[0] == 0:
        return np.zeros((target_n, yamnet_emb.shape[1] if yamnet_emb.ndim > 1 else 1024),
                        dtype=np.float32)
    # Map each fine frame index to the closest YAMNet frame.
    fine_times = np.arange(target_n) * target_hop_s
    yamnet_times = np.arange(yamnet_emb.shape[0]) * YAMNET_FRAME_HOP_S
    idx = np.clip(
        np.searchsorted(yamnet_times, fine_times),
        0,
        yamnet_emb.shape[0] - 1,
    )
    return yamnet_emb[idx]
