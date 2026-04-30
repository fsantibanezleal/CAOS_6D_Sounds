import { useEffect } from "react";

import { AudioPlayer } from "./components/AudioPlayer";
import { ControlPanel } from "./components/ControlPanel";
import { Header } from "./components/Header";
import { HelpModal } from "./components/HelpModal";
import { LiveFeatures } from "./components/LiveFeatures";
import { SoundLibrary } from "./components/SoundLibrary";
import { Spectrogram } from "./components/Spectrogram";
import { Visualization6D } from "./components/Visualization6D";
import { api } from "./lib/api";
import { useStore } from "./store/useStore";

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

  useEffect(() => {
    void api
      .getLibrary()
      .then(setLibrary)
      .catch((err) => {
        console.error("Failed to load library", err);
      });
  }, [setLibrary]);

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
    </div>
  );
}
