import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Category, SoundClip } from "../lib/api";
import { useStore } from "../store/useStore";

type SortKey = "title" | "duration" | "category";
type LicenseFilter = "any" | "permissive" | "public-domain";

function licensePermissive(license: string): boolean {
  // CC-BY, CC-BY-SA, CC0, Public Domain — redistributable without NC
  const lc = license.toUpperCase();
  if (lc.includes("PUBLIC DOMAIN") || lc.startsWith("CC0")) return true;
  if (lc.includes("CC-BY") && !lc.includes("NC")) return true;
  return false;
}
function licensePublicDomain(license: string): boolean {
  const lc = license.toUpperCase();
  return lc.includes("PUBLIC DOMAIN") || lc.startsWith("CC0");
}

function categoryLabel(c: Category, lang: string): string {
  return lang.startsWith("en") ? c.name_en : c.name_es;
}

function clipTitle(c: SoundClip, lang: string): string {
  return lang.startsWith("en") ? c.title_en : c.title_es;
}

function durationLabel(s: number): string {
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function SoundLibrary() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "es";

  const library = useStore((s) => s.library);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const selectedClip = useStore((s) => s.selectedClip);
  const setSelectedClip = useStore((s) => s.setSelectedClip);
  const comparisonClip = useStore((s) => s.comparisonClip);
  const setComparisonClip = useStore((s) => s.setComparisonClip);
  const swapWithComparison = useStore((s) => s.swapWithComparison);

  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("any");
  const [maxDuration, setMaxDuration] = useState<number>(0); // 0 = no cap
  const [activeTags, setActiveTags] = useState<Set<string>>(() => new Set());

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // Sorted distinct list of all tags in the library, with their counts.
  const tagCounts = useMemo<Array<[string, number]>>(() => {
    if (!library) return [];
    const counts = new Map<string, number>();
    for (const c of library.clips) {
      for (const tag of c.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0])
    );
  }, [library]);

  // Filter clips by search query + license + duration + active tag set
  const filteredClips = useMemo<SoundClip[]>(() => {
    if (!library) return [];
    const q = search.trim().toLowerCase();
    let clips = library.clips;
    if (q) {
      clips = clips.filter((c) => {
        const hay = [
          c.title_en,
          c.title_es,
          c.category,
          c.subcategory ?? "",
          ...c.tags
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (licenseFilter === "permissive") {
      clips = clips.filter((c) => licensePermissive(c.license));
    } else if (licenseFilter === "public-domain") {
      clips = clips.filter((c) => licensePublicDomain(c.license));
    }
    if (maxDuration > 0) {
      clips = clips.filter((c) => c.duration_seconds <= maxDuration);
    }
    if (activeTags.size > 0) {
      // OR semantics — show any clip that has at least one of the
      // selected tags. AND semantics would too easily produce empty
      // results at this corpus size.
      clips = clips.filter((c) => c.tags.some((tag) => activeTags.has(tag)));
    }
    return clips;
  }, [library, search, licenseFilter, maxDuration, activeTags]);

  // Group by category, then subcategory
  const grouped = useMemo(() => {
    const out: Record<string, Record<string, SoundClip[]>> = {};
    for (const c of filteredClips) {
      const sub = (c.subcategory ?? "").trim() || "_";
      out[c.category] ??= {};
      out[c.category][sub] ??= [];
      out[c.category][sub].push(c);
    }
    // Sort the leaves
    for (const cat of Object.values(out)) {
      for (const subClips of Object.values(cat)) {
        subClips.sort((a, b) => {
          if (sortKey === "duration") {
            return a.duration_seconds - b.duration_seconds;
          }
          if (sortKey === "category") {
            return a.category.localeCompare(b.category);
          }
          return clipTitle(a, lang).localeCompare(clipTitle(b, lang));
        });
      }
    }
    return out;
  }, [filteredClips, sortKey, lang]);

  // Whenever a clip is selected, auto-expand its category.
  useEffect(() => {
    if (!selectedClip) return;
    setExpanded((prev) =>
      prev[selectedClip.category] ? prev : { ...prev, [selectedClip.category]: true }
    );
  }, [selectedClip]);

  // When a search term is active, expand every matching category.
  useEffect(() => {
    if (!search.trim()) return;
    const all: Record<string, boolean> = {};
    for (const cat of Object.keys(grouped)) all[cat] = true;
    setExpanded(all);
  }, [search, grouped]);

  // Default: expand the first category when the library loads.
  useEffect(() => {
    if (!library) return;
    if (Object.keys(expanded).length > 0) return;
    const first = library.categories.find((c) =>
      library.clips.some((clip) => clip.category === c.id)
    );
    if (first) setExpanded({ [first.id]: true });
  }, [library, expanded]);

  function toggleCategory(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Order the categories using the manifest order, but only show those
  // with at least one matching clip.
  const orderedCategories = useMemo<Category[]>(() => {
    if (!library) return [];
    const ids = Object.keys(grouped);
    return library.categories.filter((c) => ids.includes(c.id));
  }, [library, grouped]);

  const totalClips = filteredClips.length;
  const totalAll = library?.clips.length ?? 0;

  return (
    <aside className="panel left">
      <div className="library-header">
        <h2>{t("library.title")}</h2>
        <span className="library-count">
          {search.trim() ? `${totalClips} / ${totalAll}` : totalAll}
        </span>
      </div>

      <input
        type="search"
        placeholder={t("library.search") ?? ""}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      <div className="library-toolbar">
        <label className="inline-label">{t("library.sort_by")}</label>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="title">{t("library.sort_title")}</option>
          <option value="duration">{t("library.sort_duration")}</option>
        </select>
        <button
          className="icon"
          onClick={() => {
            const all: Record<string, boolean> = {};
            for (const c of orderedCategories) all[c.id] = true;
            setExpanded(all);
          }}
          title={t("library.expand_all")}
        >
          {t("library.expand_short")}
        </button>
        <button
          className="icon"
          onClick={() => setExpanded({})}
          title={t("library.collapse_all")}
        >
          {t("library.collapse_short")}
        </button>
      </div>

      <div className="library-toolbar">
        <label className="inline-label">{t("library.license_filter")}</label>
        <select
          value={licenseFilter}
          onChange={(e) => setLicenseFilter(e.target.value as LicenseFilter)}
        >
          <option value="any">{t("library.license_any")}</option>
          <option value="permissive">{t("library.license_permissive")}</option>
          <option value="public-domain">{t("library.license_pd")}</option>
        </select>
      </div>

      <div className="library-toolbar">
        <label className="inline-label">{t("library.max_duration")}</label>
        <input
          type="range"
          min={0}
          max={180}
          step={5}
          value={maxDuration}
          onChange={(e) => setMaxDuration(Number(e.target.value))}
        />
        <span className="value-readout" style={{ minWidth: 48 }}>
          {maxDuration === 0 ? "∞" : `${maxDuration}s`}
        </span>
      </div>

      {tagCounts.length > 0 && (
        <details className="tag-facet">
          <summary>
            {t("library.tags_filter")}
            {activeTags.size > 0 && (
              <span className="tag-active-count">{activeTags.size}</span>
            )}
          </summary>
          <div className="tag-pills">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                className={activeTags.has(tag) ? "tag-pill active" : "tag-pill"}
                onClick={() => toggleTag(tag)}
                title={`${count} clip(s)`}
              >
                {tag}
                <span className="tag-count">{count}</span>
              </button>
            ))}
            {activeTags.size > 0 && (
              <button
                className="tag-pill clear"
                onClick={() => setActiveTags(new Set())}
              >
                {t("library.tags_clear")}
              </button>
            )}
          </div>
        </details>
      )}

      {totalClips === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 12 }}>
          {t("library.empty")}
        </p>
      )}

      <div className="cat-tree">
        {orderedCategories.map((cat) => {
          const subs = grouped[cat.id] ?? {};
          const subKeys = Object.keys(subs).sort((a, b) =>
            a === "_" ? 1 : b === "_" ? -1 : a.localeCompare(b)
          );
          const totalInCat = Object.values(subs).reduce(
            (acc, arr) => acc + arr.length,
            0
          );
          const isOpen = !!expanded[cat.id];
          return (
            <div key={cat.id} className="cat-group">
              <button
                className={`cat-header ${isOpen ? "open" : ""}`}
                onClick={() => toggleCategory(cat.id)}
                aria-expanded={isOpen}
              >
                <span className="caret">{isOpen ? "▼" : "▶"}</span>
                <span className="cat-name">{categoryLabel(cat, lang)}</span>
                <span className="cat-count">{totalInCat}</span>
              </button>

              {isOpen && (
                <div className="cat-body">
                  {subKeys.map((sub) => {
                    const clips = subs[sub];
                    const showSubLabel = sub !== "_" && subKeys.length > 1;
                    return (
                      <div key={sub} className="sub-group">
                        {showSubLabel && (
                          <div className="sub-label">
                            <span>{sub.replace(/_/g, " ")}</span>
                            <span className="sub-count">{clips.length}</span>
                          </div>
                        )}
                        <ul className="clip-list">
                          {clips.map((c) => {
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
                                <div className="title">
                                  {clipTitle(c, lang)}
                                </div>
                                <div className="meta">
                                  {c.subcategory && (
                                    <span className="sub-badge">
                                      {c.subcategory.replace(/_/g, " ")}
                                    </span>
                                  )}
                                  <span style={{ flex: 1 }} />
                                  <span>{durationLabel(c.duration_seconds)}</span>
                                  {c.license && (
                                    <span className="license-badge">
                                      {c.license.split("-")[0]}
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="compare-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isPrimary) return;
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

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
