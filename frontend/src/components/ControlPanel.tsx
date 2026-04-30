import { useTranslation } from "react-i18next";

import {
  COLORMAP_NAMES,
  type ColormapName,
  colormapCss
} from "../lib/colormaps";
import { snapshotCanvas } from "../lib/snapshot";
import { useStore, type AxisRole } from "../store/useStore";
import { RecordButton } from "./RecordButton";

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
        <label>{t("viz.render_mode")}</label>
        <div className="mode-toggle three">
          <button
            className={viz.renderMode === "spheres" ? "active" : ""}
            onClick={() => setViz({ renderMode: "spheres" })}
            title={t("viz.mode_spheres_help")}
          >
            {t("viz.mode_spheres")}
          </button>
          <button
            className={viz.renderMode === "smoke" ? "active" : ""}
            onClick={() => setViz({ renderMode: "smoke" })}
            title={t("viz.mode_smoke_help")}
          >
            {t("viz.mode_smoke")}
          </button>
          <button
            className={viz.renderMode === "bursts" ? "active" : ""}
            onClick={() => setViz({ renderMode: "bursts" })}
            title={t("viz.mode_bursts_help")}
          >
            {t("viz.mode_bursts")}
          </button>
        </div>
        <div className="mode-toggle three" style={{ marginTop: 4 }}>
          <button
            className={viz.renderMode === "constellation" ? "active" : ""}
            onClick={() => setViz({ renderMode: "constellation" })}
            title={t("viz.mode_constellation_help")}
          >
            {t("viz.mode_constellation")}
          </button>
          <button
            className={viz.renderMode === "aurora" ? "active" : ""}
            onClick={() => setViz({ renderMode: "aurora" })}
            title={t("viz.mode_aurora_help")}
          >
            {t("viz.mode_aurora")}
          </button>
          <button
            className={viz.renderMode === "comet" ? "active" : ""}
            onClick={() => setViz({ renderMode: "comet" })}
            title={t("viz.mode_comet_help")}
          >
            {t("viz.mode_comet")}
          </button>
        </div>
        <div className="mode-toggle two" style={{ marginTop: 4 }}>
          <button
            className={viz.renderMode === "tube" ? "active" : ""}
            onClick={() => setViz({ renderMode: "tube" })}
            title={t("viz.mode_tube_help")}
          >
            {t("viz.mode_tube")}
          </button>
          <button
            className={viz.renderMode === "galaxy" ? "active" : ""}
            onClick={() => setViz({ renderMode: "galaxy" })}
            title={t("viz.mode_galaxy_help")}
          >
            {t("viz.mode_galaxy")}
          </button>
        </div>

        {viz.renderMode === "smoke" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.smoke_density")}</label>
              <input
                type="range"
                min={2}
                max={16}
                step={1}
                value={viz.smokeDensity}
                onChange={(e) =>
                  setViz({ smokeDensity: Number(e.target.value) })
                }
              />
              <span className="value-readout">{viz.smokeDensity}</span>
            </div>
            <div className="row">
              <label>{t("viz.smoke_spread")}</label>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.005}
                value={viz.smokeSpread}
                onChange={(e) =>
                  setViz({ smokeSpread: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.smokeSpread.toFixed(2)}
              </span>
            </div>
            <div className="row">
              <label>{t("viz.smoke_drift")}</label>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.005}
                value={viz.smokeDrift}
                onChange={(e) =>
                  setViz({ smokeDrift: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.smokeDrift.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "bursts" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.burst_rays")}</label>
              <input
                type="range"
                min={4}
                max={32}
                step={1}
                value={viz.burstRays}
                onChange={(e) =>
                  setViz({ burstRays: Number(e.target.value) })
                }
              />
              <span className="value-readout">{viz.burstRays}</span>
            </div>
            <div className="row">
              <label>{t("viz.burst_size")}</label>
              <input
                type="range"
                min={0.2}
                max={2.0}
                step={0.05}
                value={viz.burstSize}
                onChange={(e) =>
                  setViz({ burstSize: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.burstSize.toFixed(2)}×
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "constellation" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.constellation_node")}</label>
              <input
                type="range"
                min={0.2}
                max={2.0}
                step={0.05}
                value={viz.constellationNodeScale}
                onChange={(e) =>
                  setViz({ constellationNodeScale: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.constellationNodeScale.toFixed(2)}×
              </span>
            </div>
            <div className="row">
              <label>{t("viz.constellation_edges")}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={viz.constellationEdgeAlpha}
                onChange={(e) =>
                  setViz({ constellationEdgeAlpha: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.constellationEdgeAlpha.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "aurora" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.aurora_height")}</label>
              <input
                type="range"
                min={0.1}
                max={3.0}
                step={0.05}
                value={viz.auroraHeight}
                onChange={(e) =>
                  setViz({ auroraHeight: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.auroraHeight.toFixed(2)}×
              </span>
            </div>
            <div className="row">
              <label>{t("viz.aurora_wobble")}</label>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.005}
                value={viz.auroraWobble}
                onChange={(e) =>
                  setViz({ auroraWobble: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.auroraWobble.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "comet" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.comet_head")}</label>
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={viz.cometHeadScale}
                onChange={(e) =>
                  setViz({ cometHeadScale: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.cometHeadScale.toFixed(1)}×
              </span>
            </div>
            <div className="row">
              <label>{t("viz.comet_tail")}</label>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={viz.cometTailDecay}
                onChange={(e) =>
                  setViz({ cometTailDecay: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.cometTailDecay.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "tube" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.tube_width")}</label>
              <input
                type="range"
                min={0.2}
                max={3.0}
                step={0.05}
                value={viz.tubeWidth}
                onChange={(e) =>
                  setViz({ tubeWidth: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.tubeWidth.toFixed(2)}×
              </span>
            </div>
          </div>
        )}

        {viz.renderMode === "galaxy" && (
          <div style={{ marginTop: 8 }}>
            <div className="row">
              <label>{t("viz.galaxy_density")}</label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={viz.galaxyDensity}
                onChange={(e) =>
                  setViz({ galaxyDensity: Number(e.target.value) })
                }
              />
              <span className="value-readout">{viz.galaxyDensity}</span>
            </div>
            <div className="row">
              <label>{t("viz.galaxy_spread")}</label>
              <input
                type="range"
                min={0}
                max={0.4}
                step={0.005}
                value={viz.galaxySpread}
                onChange={(e) =>
                  setViz({ galaxySpread: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.galaxySpread.toFixed(2)}
              </span>
            </div>
            <div className="row">
              <label>{t("viz.galaxy_twinkle")}</label>
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.05}
                value={viz.galaxyTwinkle}
                onChange={(e) =>
                  setViz({ galaxyTwinkle: Number(e.target.value) })
                }
              />
              <span className="value-readout">
                {viz.galaxyTwinkle.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </section>

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

        <button
          style={{ marginTop: 6, width: "100%" }}
          onClick={() => snapshotCanvas()}
        >
          {t("viz.snapshot")}
        </button>

        <RecordButton />
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
