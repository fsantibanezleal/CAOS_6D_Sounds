import { useTranslation } from "react-i18next";

import { SUPPORTED_LANGS } from "../i18n";
import { useStore } from "../store/useStore";

const REPO_URL = "https://github.com/fsantibanezleal/CAOS_6D_Sounds";

export function Header() {
  const { t, i18n } = useTranslation();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  return (
    <header className="app-header">
      <div className="brand">
        <svg className="logo" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="6" fill="url(#hg)" />
          <circle cx="20" cy="20" r="3" fill="url(#hg)" opacity="0.4" />
          <circle cx="46" cy="22" r="4" fill="url(#hg)" opacity="0.6" />
          <circle cx="48" cy="44" r="3" fill="url(#hg)" opacity="0.45" />
          <circle cx="22" cy="46" r="2.5" fill="url(#hg)" opacity="0.4" />
          <path
            d="M16 32 Q24 18, 32 32 T48 32"
            stroke="url(#hg)"
            strokeWidth="1.6"
            fill="none"
            opacity="0.6"
          />
        </svg>
        <span>{t("app.title")}</span>
        <span className="tagline">— {t("app.tagline")}</span>
      </div>

      <div className="actions">
        <select
          aria-label={t("header.language")}
          value={i18n.resolvedLanguage}
          onChange={(e) => void i18n.changeLanguage(e.target.value)}
          style={{ width: 80 }}
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>

        <button
          className="icon"
          onClick={toggleTheme}
          aria-label={t("header.theme")}
          title={theme === "dark" ? t("header.theme_light") : t("header.theme_dark")}
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>

        <button className="icon" onClick={() => setHelpOpen(true)}>
          {t("header.help")}
        </button>

        <a
          className="icon"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "4px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6
          }}
        >
          {t("header.github")}
        </a>
      </div>
    </header>
  );
}
