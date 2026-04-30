import { useTranslation } from "react-i18next";

import { useStore } from "../store/useStore";

/**
 * Read-only readout of the per-frame features that the data pipeline
 * stored in the embedding payload. The values are sampled at the current
 * audio time so they tick along with the visualization.
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

  return (
    <div className="aux-card">
      <h3>{t("panels.live_features")}</h3>
      <Row label={t("panels.feature_rms")} value={rms.toFixed(4)} />
      <Row
        label={t("panels.feature_centroid")}
        value={`${centroid.toFixed(0)} Hz`}
      />
      <Row
        label={t("panels.feature_pitch")}
        value={pitch > 0 ? `${pitch.toFixed(0)} Hz` : "—"}
      />
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
