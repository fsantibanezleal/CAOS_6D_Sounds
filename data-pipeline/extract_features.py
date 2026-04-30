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
    # Allow skipping CREPE via environment variable for faster batch runs.
    import os
    if os.environ.get("AURALIS_SKIP_CREPE"):
        return None
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
    mfcc: np.ndarray  # shape (num_frames, N_MFCC) — input to MFCC projections
    tonnetz: np.ndarray  # shape (num_frames, 6) — already 6D harmonic space
    raw_audio: np.ndarray  # shape (samples,) — kept around for YAMNet
    # Whole-clip scalars derived from the full signal.
    tempo_bpm: float
    key_pitch_class: int  # 0..11 (C..B)
    key_mode: int  # 0 = minor, 1 = major


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

    # Onset density — number of detected peaks in a sliding window,
    # normalized to peaks per second.
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length, units="frames"
    )
    onset_density = _onset_density_per_frame(
        onset_frames, total_frames=onset_env.shape[0], hop_seconds=HOP_SECONDS
    )

    # Loudness in dB (perceptual proxy: 20*log10(RMS) clamped to [-80, 0]).
    loudness_db = 20.0 * np.log10(np.maximum(rms, 1e-5))
    loudness_db = np.clip(loudness_db, -80.0, 0.0).astype(np.float32)

    # Spectral skewness + kurtosis (3rd and 4th standardised moments of the
    # per-frame normalized magnitude spectrum). Distinguish symmetric vs.
    # peaky spectra.
    spec_skew, spec_kurt = _spectral_moments(stft)

    # Spectral irregularity (Krimphoff 1994) — sum of squared
    # differences between consecutive bin amplitudes, normalised by
    # the total energy in the frame. Higher = noisier amplitude
    # distribution; lower = smooth spectral envelope.
    spec_irreg = _spectral_irregularity(stft)

    # Mel-band energies — 4 perceptually-spaced bands across the full
    # 0..Nyquist range. Complements the linear `energy_*` bands above.
    mel_bands = _mel_band_energies(stft, sr, n_mel_bands=4)

    # Chroma — pick the strongest bin per frame as a 0..1 scalar.
    chroma = librosa.feature.chroma_stft(
        S=stft, sr=sr, n_fft=n_fft, hop_length=hop_length
    )
    chroma_dominant = chroma.argmax(axis=0).astype(np.float32) / 11.0

    # Tonnetz — 6D harmonic space coordinates from chroma. We need the
    # harmonic-only component for stability (HPSS already done above
    # inside _harmonic_ratio, but redoing on y is cheap and gives us the
    # time-domain harmonic signal librosa.tonnetz expects).
    y_harm = librosa.effects.harmonic(y)
    tonnetz = librosa.feature.tonnetz(
        y=y_harm, sr=sr, chroma=chroma, hop_length=hop_length
    ).T  # shape (num_frames, 6)

    # Spectral entropy — Shannon entropy over the per-frame normalized spectrum.
    # Distinguishes tonal (low entropy) from noisy (high entropy) frames.
    spec_entropy = _spectral_entropy(stft)

    # Sub-band energies — RMS energy in 4 octave-spaced bands.
    energies = _sub_band_energies(stft, sr)

    # Harmonic-percussive ratio — share of frame RMS in the harmonic component
    # of an HPSS decomposition. High for tonal/musical content, low for
    # transients/noise.
    harmonic_ratio = _harmonic_ratio(stft, n_fft, hop_length)

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
        len(spec_entropy), len(harmonic_ratio),
        len(loudness_db), len(spec_skew), len(spec_kurt),
        len(onset_density), len(spec_irreg),
        energies["energy_low"].shape[0],
        mel_bands["mel_band_0"].shape[0],
        mfcc.shape[0],
        tonnetz.shape[0],
    )

    scalar = {
        "rms": rms[:n],
        "zero_crossing_rate": zcr[:n],
        "loudness_db": loudness_db[:n],
        "spectral_centroid": centroid[:n],
        "spectral_rolloff": rolloff[:n],
        "spectral_bandwidth": bandwidth[:n],
        "spectral_flatness": flatness[:n],
        "spectral_contrast_mean": contrast[:n],
        "spectral_entropy": spec_entropy[:n],
        "spectral_skewness": spec_skew[:n],
        "spectral_kurtosis": spec_kurt[:n],
        "spectral_irregularity": spec_irreg[:n],
        "energy_low": energies["energy_low"][:n],
        "energy_mid_low": energies["energy_mid_low"][:n],
        "energy_mid_high": energies["energy_mid_high"][:n],
        "energy_high": energies["energy_high"][:n],
        "mel_band_0": mel_bands["mel_band_0"][:n],
        "mel_band_1": mel_bands["mel_band_1"][:n],
        "mel_band_2": mel_bands["mel_band_2"][:n],
        "mel_band_3": mel_bands["mel_band_3"][:n],
        "dominant_pitch": dominant_pitch[:n],
        "pitch_confidence": pitch_confidence[:n],
        "chroma_dominant": chroma_dominant[:n],
        "harmonic_ratio": harmonic_ratio[:n],
        "tempo_proxy": tempo_proxy[:n],
        "onset_strength": onset_env[:n],
        "onset_density": onset_density[:n],
    }

    # Whole-clip scalars.
    tempo_bpm = _estimate_tempo(onset_env, sr, hop_length)
    key_pitch_class, key_mode = _estimate_key(chroma)

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
        tonnetz=tonnetz[:n].astype(np.float32),
        raw_audio=y.astype(np.float32),
        tempo_bpm=float(tempo_bpm),
        key_pitch_class=int(key_pitch_class),
        key_mode=int(key_mode),
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


def _spectral_entropy(stft: np.ndarray) -> np.ndarray:
    """Shannon entropy of the per-frame normalized magnitude spectrum.

    Returns shape ``(num_frames,)``. Values close to 1 indicate noise-like
    spectra (uniform distribution); values close to 0 indicate tonal /
    sparse spectra (energy concentrated in a few bins).
    """
    eps = 1e-12
    psd = stft**2
    psd = psd / (psd.sum(axis=0, keepdims=True) + eps)
    h = -(psd * np.log2(psd + eps)).sum(axis=0)
    h_max = float(np.log2(psd.shape[0]))
    return (h / max(h_max, eps)).astype(np.float32)


def _spectral_irregularity(stft: np.ndarray) -> np.ndarray:
    """Per-frame Krimphoff (1994) spectral irregularity.

    Sum of squared differences between consecutive bin amplitudes,
    normalised by total spectral energy. Reads as "how jagged is the
    amplitude envelope between adjacent bins" — high for noisy /
    inharmonic content, low for smooth tonal envelopes.

    Returns shape ``(num_frames,)`` in roughly ``[0, 1]``.
    """
    eps = 1e-12
    diffs = np.diff(stft, axis=0)
    num = (diffs**2).sum(axis=0)
    denom = (stft**2).sum(axis=0) + eps
    return (num / denom).astype(np.float32)


def _mel_band_energies(
    stft: np.ndarray, sr: int, n_mel_bands: int = 4
) -> dict[str, np.ndarray]:
    """Per-frame energy in `n_mel_bands` perceptually-spaced bands.

    Uses librosa's mel filterbank, then groups the (typically 80) mel
    bins into `n_mel_bands` consecutive bands of equal mel width and
    sums the energy per group. This is the perceptual counterpart to
    the linear octave bands in `_sub_band_energies`.
    """
    # Project the magnitude STFT onto a mel scale (80 bins).
    mel_filters = librosa.filters.mel(sr=sr, n_fft=(stft.shape[0] - 1) * 2)
    mel_spec = mel_filters @ (stft**2)  # shape (80, num_frames)
    n_mel = mel_spec.shape[0]
    out: dict[str, np.ndarray] = {}
    bin_size = max(1, n_mel // n_mel_bands)
    for k in range(n_mel_bands):
        lo = k * bin_size
        hi = (k + 1) * bin_size if k < n_mel_bands - 1 else n_mel
        out[f"mel_band_{k}"] = np.sqrt(
            mel_spec[lo:hi].mean(axis=0)
        ).astype(np.float32)
    return out


def _sub_band_energies(stft: np.ndarray, sr: int) -> dict[str, np.ndarray]:
    """Per-frame RMS energy in four octave-spaced sub-bands.

    Bands (Hz): low 0-250 · mid_low 250-1000 · mid_high 1000-4000 ·
    high 4000-Nyquist.
    """
    n_bins = stft.shape[0]
    bin_hz = (sr / 2) / max(1, n_bins - 1)
    bands = {
        "energy_low": (0.0, 250.0),
        "energy_mid_low": (250.0, 1000.0),
        "energy_mid_high": (1000.0, 4000.0),
        "energy_high": (4000.0, sr / 2),
    }
    out: dict[str, np.ndarray] = {}
    for name, (lo, hi) in bands.items():
        i0 = max(0, int(lo / bin_hz))
        i1 = min(n_bins, max(i0 + 1, int(hi / bin_hz)))
        out[name] = np.sqrt((stft[i0:i1] ** 2).mean(axis=0)).astype(np.float32)
    return out


def _spectral_moments(stft: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-frame spectral skewness + (excess) kurtosis.

    Treats the bin index as the random variable weighted by the
    normalized magnitude spectrum. Returns ``(skew, kurt)``, each shape
    ``(num_frames,)``. Excess (Fisher) kurtosis: 0 for a Gaussian shape,
    positive for peaky distributions.
    """
    eps = 1e-12
    n_bins = stft.shape[0]
    bin_idx = np.arange(n_bins, dtype=np.float64).reshape(-1, 1)
    weights = stft.astype(np.float64) ** 2
    total = weights.sum(axis=0, keepdims=True) + eps
    p = weights / total
    mu = (p * bin_idx).sum(axis=0)
    var = (p * (bin_idx - mu) ** 2).sum(axis=0) + eps
    sigma = np.sqrt(var)
    m3 = (p * (bin_idx - mu) ** 3).sum(axis=0)
    m4 = (p * (bin_idx - mu) ** 4).sum(axis=0)
    skew = m3 / (sigma**3)
    kurt = m4 / (sigma**4) - 3.0
    return skew.astype(np.float32), kurt.astype(np.float32)


def _onset_density_per_frame(
    onset_frames: np.ndarray, total_frames: int, hop_seconds: float
) -> np.ndarray:
    """Smoothed per-frame onset rate (peaks per second).

    Marks each detected onset frame as 1, then convolves with a one-second
    rectangular window so the result reads as "onsets per second" at each
    frame. Useful as a rhythmic-density proxy.
    """
    out = np.zeros(total_frames, dtype=np.float32)
    if onset_frames.size == 0:
        return out
    out[onset_frames[onset_frames < total_frames]] = 1.0
    win = max(1, int(round(1.0 / hop_seconds)))
    kernel = np.ones(win, dtype=np.float32)
    smoothed = np.convolve(out, kernel, mode="same")
    return smoothed.astype(np.float32)


def _harmonic_ratio(
    stft: np.ndarray, n_fft: int, hop_length: int
) -> np.ndarray:
    """Per-frame share of energy in the harmonic component of HPSS.

    Returns shape ``(num_frames,)`` with values in [0, 1]. Tonal music
    sits near 1; transient / noisy content near 0.
    """
    eps = 1e-9
    h, p = librosa.decompose.hpss(stft)
    h_e = (h**2).sum(axis=0)
    p_e = (p**2).sum(axis=0)
    return (h_e / (h_e + p_e + eps)).astype(np.float32)


def _estimate_tempo(onset_env: np.ndarray, sr: int, hop_length: int) -> float:
    """Estimate clip-level tempo (BPM) from the onset envelope."""
    try:
        tempo = librosa.feature.tempo(
            onset_envelope=onset_env, sr=sr, hop_length=hop_length
        )
        return float(np.atleast_1d(tempo)[0])
    except Exception:
        return 0.0


# Krumhansl-Schmuckler key profiles (major + minor). Used to estimate the
# overall musical key of a clip from its mean chroma vector.
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def _estimate_key(chroma: np.ndarray) -> tuple[int, int]:
    """Estimate (pitch_class, mode) using Krumhansl-Schmuckler correlation.

    pitch_class: 0..11 (C..B). mode: 0 = minor, 1 = major.
    Falls back to (0, 1) if the chroma matrix is empty.
    """
    if chroma.size == 0:
        return 0, 1
    mean = chroma.mean(axis=1)
    if mean.sum() <= 0:
        return 0, 1
    mean = mean / mean.sum()
    best_corr = -np.inf
    best_pc = 0
    best_mode = 1
    for shift in range(12):
        rolled_major = np.roll(_KS_MAJOR, shift)
        rolled_minor = np.roll(_KS_MINOR, shift)
        c_major = np.corrcoef(mean, rolled_major)[0, 1]
        c_minor = np.corrcoef(mean, rolled_minor)[0, 1]
        if c_major > best_corr:
            best_corr = c_major
            best_pc, best_mode = shift, 1
        if c_minor > best_corr:
            best_corr = c_minor
            best_pc, best_mode = shift, 0
    return int(best_pc), int(best_mode)


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
