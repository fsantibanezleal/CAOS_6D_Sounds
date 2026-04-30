import { useTranslation } from "react-i18next";

import { useStore } from "../store/useStore";

const PITCH_CLASS_LABELS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

/**
 * Read-only readout of the per-frame features that the data pipeline
 * stored in the embedding payload. The values are sampled at the current
 * audio time so they tick along with the visualization. Clip-level
 * scalars (tempo + key) are static for the whole clip.
 */
export function LiveFeatures() {
  const { t } = useTranslation();
  const embedding = useStore((s) => s.embedding);
  const currentTime = useStore((s) => s.currentTime);

  if (!embedding || !embedding.raw) {
    return (
      <div className="aux-card">
        <h3>{t("panels.live_features")}</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 12, margin: 0 }}>—</p>
      </div>
    );
  }

  const idx = Math.min(
    embedding.num_frames - 1,
    Math.floor(currentTime / embedding.hop_seconds)
  );

  const rms = embedding.raw.rms[idx] ?? 0;
  const centroid = embedding.raw.spectral_centroid_hz[idx] ?? 0;
  const pitch = embedding.raw.dominant_pitch_hz[idx] ?? 0;
  const loudness = embedding.raw.loudness_db?.[idx];
  const onsetDensity = embedding.raw.onset_density?.[idx];

  const cl = embedding.clip_level;
  const keyLabel = cl
    ? `${PITCH_CLASS_LABELS[cl.key_pitch_class] ?? "?"} ${cl.key_mode === 1 ? "maj" : "min"}`
    : "";
  const tempoLabel = cl && cl.tempo_bpm > 0 ? `${cl.tempo_bpm.toFixed(0)} BPM` : "";

  return (
    <div className="aux-card">
      <h3>{t("panels.live_features")}</h3>
      <Row label={t("panels.feature_rms")} value={rms.toFixed(4)} />
      {loudness !== undefined && (
        <Row
          label={t("panels.feature_loudness")}
          value={`${loudness.toFixed(1)} dB`}
        />
      )}
      <Row
        label={t("panels.feature_centroid")}
        value={`${centroid.toFixed(0)} Hz`}
      />
      <Row
        label={t("panels.feature_pitch")}
        value={pitch > 0 ? `${pitch.toFixed(0)} Hz` : "—"}
      />
      {onsetDensity !== undefined && (
        <Row
          label={t("panels.feature_onset_density")}
          value={`${onsetDensity.toFixed(1)} /s`}
        />
      )}
      {tempoLabel && <Row label={t("panels.feature_tempo")} value={tempoLabel} />}
      {keyLabel && <Row label={t("panels.feature_key")} value={keyLabel} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 4
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{label}</span>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: 12
        }}
      >
        {value}
      </span>
    </div>
  );
}
