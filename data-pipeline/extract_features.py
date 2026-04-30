"""Extract per-frame spectral features from every audio clip in data/sounds/.

The output is an in-memory dictionary keyed by clip id. The companion
``compute_embeddings.py`` consumes the same dictionary; the orchestrator
``ingest.py`` calls them in sequence so we avoid a slow-to-load on-disk
intermediate cache.

Features are deliberately well-known and cheap to compute (librosa
defaults). They are documented in detail in
``docs/audio_embedding_theory.md``.
"""
from __future__ import annotations

import sys
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from common import (
    DEFAULT_FEATURE_AXES,
    HOP_SECONDS,
    N_MFCC,
    SCALAR_FEATURES,
    SOUNDS_DIR,
    TARGET_SAMPLE_RATE,
    WINDOW_SECONDS,
)

try:
    import librosa  # noqa: F401  (heavy import — raise a friendly error)
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "librosa is required for the data pipeline. Install pipeline deps:\n"
        "  pip install -r data-pipeline/requirements.txt"
    ) from exc


# Optional pitch tracker. When the `crepe` package is installed, we use it
# in place of librosa's piptrack — it is dramatically more accurate on
# voiced / harmonic content and gives a calibrated 0..1 confidence per
# frame. The dependency is heavy (tensorflow), so it stays optional.
def _try_crepe():
    try:
        import crepe  # type: ignore
        return crepe
    except ImportError:
        return None


_CREPE = _try_crepe()


SUPPORTED_EXTS = {".ogg", ".oga", ".opus", ".mp3", ".wav", ".flac", ".m4a"}


@dataclass
class ClipFeatures:
    """Result of feature extraction for a single clip."""

    clip_id: str
    category: str
    audio_path: Path
    sample_rate: int
    duration_seconds: float
    hop_seconds: float
    num_frames: int
    scalar_features: dict[str, np.ndarray]  # name -> shape (num_frames,)
    mfcc: np.ndarray  # shape (num_frames, N_MFCC) — input to embeddings
    raw_audio: np.ndarray  # shape (samples,) — kept around for YAMNet


# --------------------------------------------------------------------------- #
# Main extraction
# --------------------------------------------------------------------------- #


def extract_clip(audio_path: Path, category: str) -> ClipFeatures:
    """Run the full feature stack on a single clip.

    Returns one row per analysis frame (50 ms hop by default).
    """
    clip_id = audio_path.stem.lower().replace("_", "-")

    with warnings.catch_warnings():
        # librosa emits noisy deprecation chatter on some recent numpy combos.
        warnings.simplefilter("ignore", category=UserWarning)
        warnings.simplefilter("ignore", category=FutureWarning)

        y, sr = librosa.load(audio_path, sr=TARGET_SAMPLE_RATE, mono=True)

    n_fft = int(WINDOW_SECONDS * sr)
    hop_length = int(HOP_SECONDS * sr)

    # Spectrogram once, reused everywhere.
    stft = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))

    # Scalar features (one value per frame).
    rms = librosa.feature.rms(y=y, frame_length=n_fft, hop_length=hop_length)[0]
    zcr = librosa.feature.zero_crossing_rate(
        y=y, frame_length=n_fft, hop_length=hop_length
    )[0]
    centroid = librosa.feature.spectral_centroid(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
    )[0]
    rolloff = librosa.feature.spectral_rolloff(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length, roll_percent=0.85
    )[0]
    bandwidth = librosa.feature.spectral_bandwidth(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
    )[0]
    flatness = librosa.feature.spectral_flatness(
        S=stft, n_fft=n_fft, hop_length=hop_length
    )[0]
    contrast = librosa.feature.spectral_contrast(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
    ).mean(axis=0)

    # Pitch tracking. Prefer CREPE (deep model, much better on voiced /
    # harmonic content); fall back to librosa.piptrack when CREPE is not
    # installed.
    if _CREPE is not None:
        dominant_pitch, pitch_confidence = _crepe_pitch(
            y=y, sr=sr, hop_seconds=HOP_SECONDS, target_n=stft.shape[1]
        )
    else:
        pitches, magnitudes = librosa.piptrack(
            S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
        )
        dominant_pitch, pitch_confidence = _track_dominant_pitch(pitches, magnitudes)

    # Coarse "tempo proxy": rolling std-dev of onset strength.
    onset_env = librosa.onset.onset_strength(
        y=y, sr=sr, n_fft=n_fft, hop_length=hop_length
    )
    tempo_proxy = _rolling_std(onset_env, window=8)

    # Chroma — pick the strongest bin per frame as a 0..1 scalar.
    chroma = librosa.feature.chroma_stft(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
    )
    chroma_dominant = chroma.argmax(axis=0).astype(np.float32) / 11.0

    # MFCCs as input to the linear/non-linear projections.
    mfcc = librosa.feature.mfcc(
        S=librosa.power_to_db(stft**2),
        sr=sr,
        n_mfcc=N_MFCC,
        n_fft=n_fft,
        hop_length=hop_length,
    ).T

    n = min(
        len(rms), len(zcr), len(centroid), len(rolloff),
        len(bandwidth), len(flatness), len(contrast),
        len(dominant_pitch), len(pitch_confidence),
        len(tempo_proxy), len(chroma_dominant), len(onset_env),
        mfcc.shape[0],
    )

    scalar = {
        "rms": rms[:n],
        "zero_crossing_rate": zcr[:n],
        "spectral_centroid": centroid[:n],
        "spectral_rolloff": rolloff[:n],
        "spectral_bandwidth": bandwidth[:n],
        "spectral_flatness": flatness[:n],
        "spectral_contrast_mean": contrast[:n],
        "dominant_pitch": dominant_pitch[:n],
        "pitch_confidence": pitch_confidence[:n],
        "tempo_proxy": tempo_proxy[:n],
        "chroma_dominant": chroma_dominant[:n],
        "onset_strength": onset_env[:n],
    }

    # Feature roster sanity check.
    missing = set(SCALAR_FEATURES) - set(scalar)
    if missing:
        raise RuntimeError(f"Missing features in extraction: {missing}")

    return ClipFeatures(
        clip_id=clip_id,
        category=category,
        audio_path=audio_path,
        sample_rate=sr,
        duration_seconds=float(len(y)) / sr,
        hop_seconds=HOP_SECONDS,
        num_frames=n,
        scalar_features={k: scalar[k].astype(np.float32) for k in SCALAR_FEATURES},
        mfcc=mfcc[:n].astype(np.float32),
        raw_audio=y.astype(np.float32),
    )


def _track_dominant_pitch(
    pitches: np.ndarray, magnitudes: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Return (dominant_pitch_hz, normalized_confidence) per frame.

    Picks the bin with the largest magnitude in each frame; if no energy is
    present, both arrays return zero for that frame.
    """
    n_frames = pitches.shape[1]
    pitch = np.zeros(n_frames, dtype=np.float32)
    conf = np.zeros(n_frames, dtype=np.float32)
    for i in range(n_frames):
        idx = magnitudes[:, i].argmax()
        if magnitudes[idx, i] > 0:
            pitch[i] = pitches[idx, i]
            conf[i] = magnitudes[idx, i]
    if conf.max() > 0:
        conf /= conf.max()
    return pitch, conf


def _crepe_pitch(
    y: np.ndarray, sr: int, hop_seconds: float, target_n: int
) -> tuple[np.ndarray, np.ndarray]:
    """Return (pitch_hz, confidence) per frame using CREPE.

    CREPE provides a calibrated 0..1 confidence per frame and is far more
    accurate than ``librosa.piptrack`` on voiced / harmonic content.

    The model is invoked at ``hop_seconds`` directly via its ``step_size``
    argument (in milliseconds). The output is then trimmed / padded to
    ``target_n`` frames so it lines up with the rest of the feature stack.

    Frames where confidence is below 0.3 are silenced (pitch set to 0)
    to avoid noisy contour glitches dominating the visualization.
    """
    crepe = _CREPE  # captured for type-checkers
    assert crepe is not None
    step_ms = max(1, int(round(hop_seconds * 1000)))
    # CREPE works at 16 kHz internally; pass the workstation's audio
    # at any sample rate, the model resamples for us.
    _, frequency, confidence, _ = crepe.predict(
        y, sr, viterbi=True, step_size=step_ms, model_capacity="tiny",
        verbose=0,
    )
    # Silence noisy contour frames
    silenced = frequency.copy()
    silenced[confidence < 0.3] = 0.0

    pitch = np.zeros(target_n, dtype=np.float32)
    conf = np.zeros(target_n, dtype=np.float32)
    n = min(target_n, silenced.shape[0])
    pitch[:n] = silenced[:n]
    conf[:n] = confidence[:n]
    return pitch, conf


def _rolling_std(x: np.ndarray, window: int) -> np.ndarray:
    if x.size == 0:
        return x
    pad = window // 2
    padded = np.pad(x, (pad, pad), mode="edge")
    out = np.empty_like(x)
    for i in range(x.size):
        out[i] = padded[i : i + window].std()
    return out


def discover_clips() -> list[tuple[Path, str]]:
    """Walk SOUNDS_DIR and return [(audio_path, category_id), ...]."""
    if not SOUNDS_DIR.is_dir():
        return []
    found: list[tuple[Path, str]] = []
    for category_dir in sorted(SOUNDS_DIR.iterdir()):
        if not category_dir.is_dir():
            continue
        for audio in sorted(category_dir.iterdir()):
            if audio.suffix.lower() in SUPPORTED_EXTS:
                found.append((audio, category_dir.name))
    return found


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def main() -> int:
    clips = discover_clips()
    if not clips:
        print("No audio clips found under data/sounds/.")
        return 1
    print(f"Found {len(clips)} clip(s). Extracting features...")
    for path, category in clips:
        feats = extract_clip(path, category)
        print(
            f"  [{category}] {feats.clip_id}  "
            f"frames={feats.num_frames}  duration={feats.duration_seconds:.1f}s"
        )
    print("Extraction complete (in-memory). Run ingest.py for the full pipeline.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
