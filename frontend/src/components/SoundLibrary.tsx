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
        {filteredClips.map((c) => (
          <li
            key={c.id}
            className={selectedClip?.id === c.id ? "active" : ""}
            onClick={() => setSelectedClip(c)}
          >
            <div className="title">{clipTitle(c, lang)}</div>
            <div className="meta">
              <span>{c.category}</span>
              <span>{c.duration_seconds.toFixed(1)} s</span>
            </div>
          </li>
        ))}
      </ul>

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
