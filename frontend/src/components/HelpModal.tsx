import { useTranslation } from "react-i18next";

import { useStore } from "../store/useStore";

export function HelpModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.helpOpen);
  const setOpen = useStore((s) => s.setHelpOpen);

  if (!open) return null;

  const steps = (t("help.steps", { returnObjects: true }) as string[]) ?? [];

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)} role="dialog">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("help.title")}</h2>
        <p>{t("help.intro")}</p>
        <ol>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {s}
            </li>
          ))}
        </ol>

        <h3>{t("help.shortcuts")}</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 6 }}>
          <li>
            <span className="kbd">Space</span> — {t("help.shortcut_space")}
          </li>
          <li>
            <span className="kbd">1</span>..<span className="kbd">9</span> —{" "}
            {t("help.shortcut_1")}
          </li>
          <li>
            <span className="kbd">T</span> — {t("help.shortcut_t")}
          </li>
          <li>
            <span className="kbd">G</span> — {t("help.shortcut_g")}
          </li>
          <li>
            <span className="kbd">A</span> — {t("help.shortcut_a")}
          </li>
        </ul>

        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
          {t("license.audio_note")}
        </p>

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button className="primary" onClick={() => setOpen(false)}>
            {t("help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
