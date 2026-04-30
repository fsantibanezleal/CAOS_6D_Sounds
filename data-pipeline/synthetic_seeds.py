"""Generate a small bank of fully-synthetic, redistributable seed sounds.

These exist so a fresh clone can run the whole pipeline + frontend without
relying on any external network call or third-party copyright. The sounds
are generated with numpy, written as 16-bit OGG-Vorbis clips at 22050 Hz
into ``data/sounds/synthetic/``.

Run directly:

    python data-pipeline/synthetic_seeds.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

try:
    import soundfile as sf
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "soundfile is required. Install pipeline deps:\n"
        "  pip install -r data-pipeline/requirements.txt"
    ) from exc

from common import SOUNDS_DIR, TARGET_SAMPLE_RATE


SR = TARGET_SAMPLE_RATE
DURATION = 6.0  # seconds


def _t(duration: float = DURATION) -> np.ndarray:
    return np.linspace(0.0, duration, int(SR * duration), endpoint=False)


def _envelope(t: np.ndarray, attack: float = 0.05, release: float = 0.5) -> np.ndarray:
    env = np.ones_like(t)
    n_attack = int(attack * SR)
    n_release = int(release * SR)
    if n_attack > 0:
        env[:n_attack] = np.linspace(0.0, 1.0, n_attack)
    if n_release > 0:
        env[-n_release:] = np.linspace(1.0, 0.0, n_release)
    return env


def pure_tone(freq: float = 440.0) -> np.ndarray:
    t = _t()
    return 0.4 * np.sin(2 * np.pi * freq * t) * _envelope(t)


def chirp(f0: float = 200.0, f1: float = 4000.0) -> np.ndarray:
    t = _t()
    k = (f1 - f0) / DURATION
    phase = 2 * np.pi * (f0 * t + 0.5 * k * t**2)
    return 0.4 * np.sin(phase) * _envelope(t)


def fm_drone(carrier: float = 220.0, modulator: float = 5.0) -> np.ndarray:
    t = _t()
    mod = np.sin(2 * np.pi * modulator * t) * 80.0
    return 0.35 * np.sin(2 * np.pi * carrier * t + mod) * _envelope(t, attack=0.5)


def pink_noise() -> np.ndarray:
    """Pink noise via 1/f shaping in the frequency domain."""
    n = int(SR * DURATION)
    white = np.random.RandomState(0).randn(n)
    spec = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    freqs[0] = 1.0
    spec /= np.sqrt(freqs)
    pink = np.fft.irfft(spec, n=n)
    pink /= np.max(np.abs(pink))
    return 0.4 * pink * _envelope(_t())


def harmonic_arpeggio() -> np.ndarray:
    """A C-major arpeggio with overtones — provides clear pitch dynamics."""
    notes = [261.63, 329.63, 392.00, 523.25, 659.25, 523.25, 392.00, 329.63]
    seg_len = int(SR * (DURATION / len(notes)))
    out = np.zeros(seg_len * len(notes), dtype=np.float32)
    for i, f in enumerate(notes):
        t = np.arange(seg_len) / SR
        seg = (
            0.45 * np.sin(2 * np.pi * f * t)
            + 0.20 * np.sin(2 * np.pi * 2 * f * t)
            + 0.10 * np.sin(2 * np.pi * 3 * f * t)
        )
        env = _envelope(t, attack=0.01, release=0.05)
        out[i * seg_len : (i + 1) * seg_len] = seg * env
    return 0.6 * out / np.max(np.abs(out))


def amplitude_modulated_noise() -> np.ndarray:
    """White noise gated by a 4 Hz tremolo — mimics a rhythmic insect call."""
    t = _t()
    noise = np.random.RandomState(1).randn(t.size)
    tremolo = 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    return 0.5 * (noise / np.abs(noise).max()) * tremolo * _envelope(t)


def organ_chord() -> np.ndarray:
    """A dense additive-synthesis chord — high spectral flatness, low ZCR."""
    t = _t()
    fundamentals = [130.81, 164.81, 196.00, 261.63]
    sig = np.zeros_like(t)
    for f in fundamentals:
        for h in range(1, 6):
            sig += (1.0 / h) * np.sin(2 * np.pi * f * h * t)
    sig /= np.max(np.abs(sig))
    return 0.5 * sig * _envelope(t, attack=0.5, release=0.8)


SEEDS: dict[str, tuple[str, str, np.ndarray]] = {
    # id -> (title_en, title_es, generator)
    "synth-pure-tone-440": (
        "Pure tone (A4, 440 Hz)",
        "Tono puro (La4, 440 Hz)",
        pure_tone(440.0),
    ),
    "synth-chirp-rising": (
        "Rising chirp (200 Hz to 4 kHz)",
        "Barrido ascendente (200 Hz a 4 kHz)",
        chirp(200.0, 4000.0),
    ),
    "synth-chirp-falling": (
        "Falling chirp (4 kHz to 200 Hz)",
        "Barrido descendente (4 kHz a 200 Hz)",
        chirp(4000.0, 200.0),
    ),
    "synth-fm-drone": (
        "FM drone (220 Hz, mod 5 Hz)",
        "Drone FM (220 Hz, mod 5 Hz)",
        fm_drone(220.0, 5.0),
    ),
    "synth-pink-noise": (
        "Pink noise",
        "Ruido rosa",
        pink_noise(),
    ),
    "synth-harmonic-arpeggio": (
        "Harmonic arpeggio (C major)",
        "Arpegio armónico (Do mayor)",
        harmonic_arpeggio(),
    ),
    "synth-am-noise": (
        "Amplitude-modulated noise (4 Hz tremolo)",
        "Ruido modulado en amplitud (trémolo 4 Hz)",
        amplitude_modulated_noise(),
    ),
    "synth-organ-chord": (
        "Organ chord (additive synthesis)",
        "Acorde de órgano (síntesis aditiva)",
        organ_chord(),
    ),
}


def write_seeds() -> list[Path]:
    out_dir = SOUNDS_DIR / "synthetic"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for clip_id, (_title_en, _title_es, signal) in SEEDS.items():
        target = out_dir / f"{clip_id}.ogg"
        sf.write(target, signal.astype(np.float32), SR, format="OGG", subtype="VORBIS")
        written.append(target)
    return written


def main() -> int:
    paths = write_seeds()
    for p in paths:
        size_kb = p.stat().st_size / 1024
        print(f"  wrote {p.relative_to(p.parent.parent.parent)}  ({size_kb:.1f} KB)")
    print(f"Total: {len(paths)} seed clip(s) under data/sounds/synthetic/.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
