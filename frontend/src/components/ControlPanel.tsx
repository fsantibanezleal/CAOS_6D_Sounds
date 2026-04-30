import { useTranslation } from "react-i18next";

import {
  COLORMAP_NAMES,
  type ColormapName,
  colormapCss
} from "../lib/colormaps";
import { useStore, type AxisRole } from "../store/useStore";

export function ControlPanel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";
  const viz = useStore((s) => s.viz);
  const setViz = useStore((s) => s.setViz);
  const setAxis = useStore((s) => s.setAxis);
  const embedding = useStore((s) => s.embedding);
  const library = useStore((s) => s.library);

  const tracks = embedding?.tracks ?? [];
  const activeTrack = tracks.find((tr) => tr.name === viz.trackName) ?? tracks[0];
  const dimLabels = activeTrack?.dim_labels ?? [];

  const axisRoles: { role: AxisRole; label: string }[] = [
    { role: "x", label: t("viz.axis_x") },
    { role: "y", label: t("viz.axis_y") },
    { role: "z", label: t("viz.axis_z") },
    { role: "color", label: t("viz.axis_color") },
    { role: "size", label: t("viz.axis_size") }
  ];

  return (
    <aside className="panel right">
      <h2>{t("viz.title")}</h2>

      <section>
        <div className="row">
          <label>{t("viz.track")}</label>
          <select
            value={viz.trackName}
            onChange={(e) => setViz({ trackName: e.target.value })}
          >
            {tracks.map((tr) => (
              <option key={tr.name} value={tr.name}>
                {tr.name.toUpperCase()}
              </option>
            ))}
            {tracks.length === 0 && <option value="features">FEATURES</option>}
          </select>
        </div>
        {activeTrack && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            {lang.startsWith("en")
              ? activeTrack.description_en
              : activeTrack.description_es}
          </p>
        )}
      </section>

      <section>
        {axisRoles.map(({ role, label }) => (
          <div key={role} className="row">
            <label>{label}</label>
            <select
              value={viz.axes[role]}
              onChange={(e) => setAxis(role, Number(e.target.value))}
            >
              {dimLabels.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
              {dimLabels.length === 0 && <option value={0}>D1</option>}
            </select>
          </div>
        ))}
      </section>

      <section>
        <div className="row">
          <label>{t("viz.colormap")}</label>
          <select
            value={viz.colormap}
            onChange={(e) =>
              setViz({ colormap: e.target.value as ColormapName })
            }
          >
            {COLORMAP_NAMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            height: 14,
            borderRadius: 4,
            border: "1px solid var(--border)",
            background: colormapCss(viz.colormap, 16),
            marginTop: 4
          }}
          aria-hidden
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
            textTransform: "none",
            letterSpacing: 0
          }}
        >
          <input
            type="checkbox"
            checked={viz.reverseColormap}
            onChange={(e) => setViz({ reverseColormap: e.target.checked })}
          />
          Reverse
        </label>
      </section>

      <section>
        <div className="row">
          <label>{t("viz.size_min")}</label>
          <input
            type="range"
            min="0.01"
            max="0.4"
            step="0.005"
            value={viz.sphereMin}
            onChange={(e) => setViz({ sphereMin: Number(e.target.value) })}
          />
          <span className="value-readout">{viz.sphereMin.toFixed(3)}</span>
        </div>
        <div className="row">
          <label>{t("viz.size_max")}</label>
          <input
            type="range"
            min="0.05"
            max="0.6"
            step="0.005"
            value={viz.sphereMax}
            onChange={(e) =>
              setViz({
                sphereMax: Math.max(Number(e.target.value), viz.sphereMin + 0.01)
              })
            }
          />
          <span className="value-readout">{viz.sphereMax.toFixed(3)}</span>
        </div>
      </section>

      <section>
        <div className="row">
          <label>{t("viz.trail_length")}</label>
          <input
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            value={viz.trailSeconds}
            onChange={(e) => setViz({ trailSeconds: Number(e.target.value) })}
          />
          <span className="value-readout">
            {t("viz.trail_seconds", { n: viz.trailSeconds.toFixed(1) })}
          </span>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
            textTransform: "none",
            letterSpacing: 0
          }}
        >
          <input
            type="checkbox"
            checked={viz.showTrailLine}
            onChange={(e) => setViz({ showTrailLine: e.target.checked })}
          />
          {t("viz.show_trail_line")}
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            textTransform: "none",
            letterSpacing: 0
          }}
        >
          <input
            type="checkbox"
            checked={viz.showAxes}
            onChange={(e) => setViz({ showAxes: e.target.checked })}
          />
          {t("viz.show_axes")}
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
            textTransform: "none",
            letterSpacing: 0
          }}
        >
          <input
            type="checkbox"
            checked={viz.showGrid}
            onChange={(e) => setViz({ showGrid: e.target.checked })}
          />
          {t("viz.show_grid")}
        </label>

        <button
          style={{ marginTop: 12, width: "100%" }}
          onClick={() =>
            window.dispatchEvent(new CustomEvent("auralis:reset-camera"))
          }
        >
          {t("viz.reset_camera")}
        </button>
      </section>

      {library && (
        <section>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              margin: 0,
              lineHeight: 1.5
            }}
          >
            <strong>Library:</strong> {library.clips.length} clips ·{" "}
            {library.embedding_methods.join(" / ").toUpperCase() || "PCA"}
            <br />
            v{library.version} — {library.generated_at}
          </p>
        </section>
      )}
    </aside>
  );
}
