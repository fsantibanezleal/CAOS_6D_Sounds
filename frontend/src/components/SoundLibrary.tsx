import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { Category, SoundClip } from "../lib/api";
import { useStore } from "../store/useStore";

function categoryLabel(c: Category, lang: string): string {
  return lang.startsWith("en") ? c.name_en : c.name_es;
}

function clipTitle(c: SoundClip, lang: string): string {
  return lang.startsWith("en") ? c.title_en : c.title_es;
}

export function SoundLibrary() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";

  const library = useStore((s) => s.library);
  const selectedCategory = useStore((s) => s.selectedCategory);
  const setSelectedCategory = useStore((s) => s.setSelectedCategory);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const selectedClip = useStore((s) => s.selectedClip);
  const setSelectedClip = useStore((s) => s.setSelectedClip);
  const comparisonClip = useStore((s) => s.comparisonClip);
  const setComparisonClip = useStore((s) => s.setComparisonClip);
  const swapWithComparison = useStore((s) => s.swapWithComparison);

  const filteredClips = useMemo(() => {
    if (!library) return [];
    const q = search.trim().toLowerCase();
    return library.clips.filter((c) => {
      if (selectedCategory && c.category !== selectedCategory) return false;
      if (!q) return true;
      const hay = [c.title_en, c.title_es, c.category, ...c.tags]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [library, selectedCategory, search]);

  return (
    <aside className="panel left">
      <h2>{t("library.title")}</h2>

      <input
        type="search"
        placeholder={t("library.search") ?? ""}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      {library && (
        <div className="cat-pills">
          <button
            className={selectedCategory === null ? "active" : ""}
            onClick={() => setSelectedCategory(null)}
          >
            {t("library.all")}
          </button>
          {library.categories.map((c) => (
            <button
              key={c.id}
              className={selectedCategory === c.id ? "active" : ""}
              onClick={() => setSelectedCategory(c.id)}
              title={lang.startsWith("en") ? c.description_en : c.description_es}
            >
              {categoryLabel(c, lang)}
            </button>
          ))}
        </div>
      )}

      {filteredClips.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {t("library.empty")}
        </p>
      )}

      <ul className="clip-list">
        {filteredClips.map((c) => {
          const isPrimary = selectedClip?.id === c.id;
          const isComparison = comparisonClip?.id === c.id;
          const cls = [
            isPrimary ? "active" : "",
            isComparison ? "comparison" : ""
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={c.id}
              className={cls}
              onClick={() => setSelectedClip(c)}
            >
              <div className="title">{clipTitle(c, lang)}</div>
              <div className="meta">
                <span>{c.category}</span>
                <span>{c.duration_seconds.toFixed(1)} s</span>
              </div>
              <button
                className="compare-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isPrimary) return; // can't compare with itself
                  setComparisonClip(isComparison ? null : c);
                }}
                disabled={isPrimary}
                title={
                  isPrimary
                    ? t("library.compare_self")
                    : isComparison
                      ? t("library.compare_remove")
                      : t("library.compare_add")
                }
              >
                {isComparison ? "+ active" : "+ compare"}
              </button>
            </li>
          );
        })}
      </ul>

      {comparisonClip && (
        <div className="compare-bar">
          <span>
            {t("library.comparing_with")}:{" "}
            <strong>{clipTitle(comparisonClip, lang)}</strong>
          </span>
          <button onClick={swapWithComparison} title={t("library.swap")}>
            ⇄
          </button>
          <button
            onClick={() => setComparisonClip(null)}
            title={t("library.compare_remove")}
          >
            ×
          </button>
        </div>
      )}

      {selectedClip && (
        <div className="attribution">
          <strong>{t("library.source")}:</strong> {selectedClip.source}
          <br />
          <strong>{t("library.license")}:</strong> {selectedClip.license}
          {selectedClip.attribution && (
            <>
              <br />
              <em>{selectedClip.attribution}</em>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
