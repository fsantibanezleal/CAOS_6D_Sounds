"""CLAP (Contrastive Language-Audio Pretraining) embeddings.

LAION's open implementation of the original Microsoft CLAP paper (Wu
et al. 2023). Maps audio AND text into the *same* 512-D embedding
space, so a sound and a text description can be compared directly.

We use CLAP as an additional embedding method alongside PCA / t-SNE /
UMAP / Tonnetz / YAMNet. The audio side emits one 512-D vector per
clip (CLAP is a global, not per-frame, embedding) which we then PCA-
project to 6D using the same library-wide fit.

Conceptually:

* MFCC-based methods (PCA / t-SNE / UMAP) capture acoustic similarity.
* Tonnetz captures harmonic structure (music-oriented).
* YAMNet captures AudioSet semantics (sounds-by-category).
* CLAP captures language-grounded semantics (sounds-by-description).
  This is the path that, in a future PR, will let a user type a
  prompt ("ocean waves") and see it as a marker in the same 6D space.

The dependency stays optional. When `transformers` or `torch` are
missing, or the model cannot be downloaded, the CLAP track is
silently skipped — exactly like YAMNet.

## Model

We use `laion/clap-htsat-unfused` (~600 MB on disk, Apache-2.0).
CPU inference runs in ~1-2 seconds per 10-second clip.

## Per-frame vs per-clip

CLAP is a *global* embedding model — one vector per audio clip, not
one per frame. To keep the Auralis convention (per-frame trail), we
emit the same global 512-D vector for every frame of the clip. The
resulting 6D trail is a single point in CLAP space; the visualization
mode reveals time variation only through the *other* axes (rms,
loudness, etc.) when CLAP is the active track. This is intentional —
it gives the user a way to compare clips' positions in semantic space
even though every individual clip is a degenerate single point in
that space.
"""
from __future__ import annotations

import os
from typing import TYPE_CHECKING

import numpy as np

# Reduce HF transformers chatter.
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")

if TYPE_CHECKING:
    pass


# CLAP processes audio at 48 kHz mono. Resample if needed.
CLAP_SR = 48000

# Embedding dimension produced by the CLAP audio branch.
CLAP_DIM = 512

# HuggingFace repo for the LAION checkpoint we ship against.
CLAP_MODEL_ID = "laion/clap-htsat-unfused"


def try_clap():
    """Lazy-load the CLAP model + processor. Returns ``(model, processor)``
    or ``None`` if the dependencies are missing or the model cannot be
    downloaded.
    """
    try:
        import torch  # noqa: F401  (used for inference but imported lazily here too)
        from transformers import ClapModel, ClapProcessor  # type: ignore
    except ImportError:
        return None
    try:
        model = ClapModel.from_pretrained(CLAP_MODEL_ID)
        processor = ClapProcessor.from_pretrained(CLAP_MODEL_ID)
        model.eval()
        return model, processor
    except Exception as exc:  # noqa: BLE001
        print(f"  clap skipped: {exc}")
        return None


def clap_audio_embedding(model_and_proc, y: np.ndarray, sr: int) -> np.ndarray:
    """Compute the CLAP audio embedding for a single waveform.

    Returns a flat ``(512,)`` float32 vector. The whole-clip vector is
    emitted; callers that want a per-frame matrix should broadcast it.
    """
    import torch  # imported lazily so callers without torch can still import
                  # the module just to check try_clap() returns None.

    model, processor = model_and_proc
    waveform = y.astype(np.float32)
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)

    if sr != CLAP_SR:
        import librosa
        waveform = librosa.resample(waveform, orig_sr=sr, target_sr=CLAP_SR)

    # `audios=` was the keyword in transformers 4.x; renamed to `audio=`
    # in 5.x and the old name was removed (not just deprecated). Try the
    # new name first, fall back to the old one for 4.x compat.
    try:
        inputs = processor(audio=waveform, sampling_rate=CLAP_SR, return_tensors="pt")
    except TypeError:
        inputs = processor(audios=waveform, sampling_rate=CLAP_SR, return_tensors="pt")
    with torch.no_grad():
        audio_out = model.get_audio_features(**inputs)
    # transformers 4.x returned a (1, 512) tensor directly;
    # transformers 5.x returns a BaseModelOutputWithPooling whose
    # `pooler_output` holds the same vector. Handle both.
    audio_embed = (
        audio_out.pooler_output if hasattr(audio_out, "pooler_output") else audio_out
    )
    return audio_embed.squeeze(0).cpu().numpy().astype(np.float32)


def clap_text_embedding(model_and_proc, prompt: str) -> np.ndarray:
    """Compute the CLAP text embedding for a single prompt.

    Returns a flat ``(512,)`` float32 vector. Useful in a future PR
    where the frontend lets users type a query and project it into
    the same 6D space as the clips.
    """
    import torch

    model, processor = model_and_proc
    inputs = processor(text=[prompt], return_tensors="pt", padding=True)
    with torch.no_grad():
        text_out = model.get_text_features(**inputs)
    text_embed = (
        text_out.pooler_output if hasattr(text_out, "pooler_output") else text_out
    )
    return text_embed.squeeze(0).cpu().numpy().astype(np.float32)


def broadcast_to_frames(clip_embed: np.ndarray, num_frames: int) -> np.ndarray:
    """Repeat a single CLAP clip embedding to ``num_frames`` rows.

    The result has shape ``(num_frames, 512)`` — the same vector at
    every frame index. This keeps the manifest schema consistent with
    the other per-frame tracks while honestly representing that CLAP
    is a global embedding.
    """
    if num_frames <= 0:
        return np.zeros((0, CLAP_DIM), dtype=np.float32)
    return np.tile(clip_embed[None, :], (num_frames, 1))
