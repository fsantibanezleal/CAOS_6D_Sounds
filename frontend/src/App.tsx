import { useEffect, useRef } from "react";

import { AudioPlayer } from "./components/AudioPlayer";
import { ControlPanel } from "./components/ControlPanel";
import { Header } from "./components/Header";
import { HelpModal } from "./components/HelpModal";
import { LiveFeatures } from "./components/LiveFeatures";
import { SoundLibrary } from "./components/SoundLibrary";
import { Spectrogram } from "./components/Spectrogram";
import { Toasts } from "./components/Toasts";
import { Visualization6D } from "./components/Visualization6D";
import { api } from "./lib/api";
import { decodeState, encodeState } from "./lib/urlState";
import { DEFAULT_CLIP_ID, useStore } from "./store/useStore";

export default function App() {
  const setLibrary = useStore((s) => s.setLibrary);
  const library = useStore((s) => s.library);
  const setSelectedClip = useStore((s) => s.setSelectedClip);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const viz = useStore((s) => s.viz);
  const setViz = useStore((s) => s.setViz);
  const selectedClip = useStore((s) => s.selectedClip);
  const isPlaying = useStore((s) => s.isPlaying);
  const comparisonClip = useStore((s) => s.comparisonClip);
  const comparisonClipId = useStore((s) => s.comparisonClipId);
  const setComparisonClip = useStore((s) => s.setComparisonClip);
  const setLibraryError = useStore((s) => s.setLibraryError);

  // URL state — read once at mount into a ref so the write-back effect
  // can tell "hash → store" from "store → hash" and avoid a loop.
  const pendingUrlStateRef = useRef(decodeState(window.location.hash));
  const lastWrittenHashRef = useRef<string>("");

  useEffect(() => {
    const state = pendingUrlStateRef.current;
    if (!state) return;
    // Viz fields apply immediately — they don't depend on the library.
    const patch: Parameters<typeof setViz>[0] = {};
    if (state.renderMode) patch.renderMode = state.renderMode;
    if (state.trackName) patch.trackName = state.trackName;
    if (state.axes) patch.axes = state.axes;
    if (Object.keys(patch).length > 0) setViz(patch);
  }, [setViz]);

  // Once the library arrives, apply the URL's clipId / comparisonClipId
  // if present. Library load + this effect run on every mount so this is
  // the first selection the user sees on a shared link.
  useEffect(() => {
    if (!library) return;
    const state = pendingUrlStateRef.current;
    if (!state) return;
    if (state.clipId) {
      const found = library.clips.find((c) => c.id === state.clipId);
      if (found) setSelectedClip(found);
    }
    if (state.comparisonClipId === null) {
      setComparisonClip(null);
    } else if (state.comparisonClipId) {
      const found = library.clips.find((c) => c.id === state.comparisonClipId);
      if (found) setComparisonClip(found);
    }
    // Single-shot: consumed.
    pendingUrlStateRef.current = null;
  }, [library, setSelectedClip, setComparisonClip]);

  // Sync store → location.hash, debounced so a slider drag doesn't
  // thrash history.replaceState.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const hash = encodeState({
        clipId: selectedClip?.id,
        comparisonClipId,
        renderMode: viz.renderMode,
        trackName: viz.trackName,
        axes: viz.axes
      });
      if (hash === lastWrittenHashRef.current) return;
      lastWrittenHashRef.current = hash;
      const url = `${window.location.pathname}${window.location.search}#${hash}`;
      window.history.replaceState(null, "", url);
    }, 300);
    return () => window.clearTimeout(t);
  }, [
    selectedClip?.id,
    comparisonClipId,
    viz.renderMode,
    viz.trackName,
    viz.axes
  ]);

  useEffect(() => {
    void api
      .getLibrary()
      .then((lib) => {
        setLibrary(lib);
        setLibraryError(null);
      })
      .catch((err) => {
        console.error("Failed to load library", err);
        const msg =
          err instanceof Error ? err.message : "Could not load the library.";
        setLibraryError(msg);
      });
  }, [setLibrary, setLibraryError]);

  // Auto-select the default clip on first load (when nothing is yet
  // chosen). This gives first-time visitors something immediate to
  // look at without forcing them to click around the library.
  useEffect(() => {
    if (!library || selectedClip) return;
    const fallback =
      library.clips.find((c) => c.id === DEFAULT_CLIP_ID) ?? library.clips[0];
    if (fallback) setSelectedClip(fallback);
  }, [library, selectedClip, setSelectedClip]);

  // Re-hydrate the comparison clip from its persisted id after the
  // library arrives. If the clip was removed from the library since
  // the user last set it, silently drop the comparison.
  useEffect(() => {
    if (!library || comparisonClip || !comparisonClipId) return;
    const restored = library.clips.find((c) => c.id === comparisonClipId);
    if (restored) setComparisonClip(restored);
    else setComparisonClip(null);
  }, [library, comparisonClip, comparisonClipId, setComparisonClip]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      switch (e.key.toLowerCase()) {
        case " ":
          if (selectedClip) {
            e.preventDefault();
            const audio = document.querySelector("audio");
            if (audio?.paused) void audio.play();
            else audio?.pause();
          }
          break;
        case "t":
          toggleTheme();
          break;
        case "g":
          setViz({ showGrid: !viz.showGrid });
          break;
        case "a":
          setViz({ showAxes: !viz.showAxes });
          break;
        default: {
          const n = Number(e.key);
          if (Number.isFinite(n) && n >= 1 && n <= 9 && library) {
            const clips = library.clips;
            const idx = n - 1;
            if (idx < clips.length) {
              setSelectedClip(clips[idx]);
            }
          }
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    library,
    selectedClip,
    isPlaying,
    setIsPlaying,
    toggleTheme,
    setSelectedClip,
    setViz,
    viz.showAxes,
    viz.showGrid
  ]);

  return (
    <div className="app-shell">
      <Header />
      <main className="app-body">
        <SoundLibrary />
        <section className="viz-shell">
          <Visualization6D />
          <div className="viz-aux">
            <Spectrogram />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AudioPlayer />
              <LiveFeatures />
            </div>
          </div>
        </section>
        <ControlPanel />
      </main>
      <HelpModal />
      <Toasts />
    </div>
  );
}
