import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ClipEmbedding, SoundClip, SoundLibrary } from "../lib/api";
import { type ColormapName } from "../lib/colormaps";

export type Theme = "dark" | "light";
export type AxisRole = "x" | "y" | "z" | "color" | "size";
export type RenderMode =
  | "spheres"
  | "smoke"
  | "bursts"
  | "constellation"
  | "aurora"
  | "comet";

export interface VizConfig {
  /** Which embedding track to use (features / pca / tsne / umap / tonnetz / yamnet). */
  trackName: string;
  /** Index in the track's dim_labels array assigned to each role. */
  axes: Record<AxisRole, number>;
  colormap: ColormapName;
  reverseColormap: boolean;
  sphereMin: number;
  sphereMax: number;
  /** Trail length in seconds. */
  trailSeconds: number;
  showTrailLine: boolean;
  showAxes: boolean;
  showGrid: boolean;
  /** Visualization mode — geometric spheres or diffuse smoke clouds. */
  renderMode: RenderMode;
  /** Smoke-mode parameters (ignored when renderMode !== "smoke"). */
  smokeDensity: number;  // 1..16 particles per frame
  smokeSpread: number;   // initial offset radius in world units
  smokeDrift: number;    // outward drift speed in world units / second
  /** Bursts-mode parameters (ignored when renderMode !== "bursts"). */
  burstRays: number;     // 4..32 rays per frame
  burstSize: number;     // global multiplier for ray length (0..2)
  /** Constellation-mode parameters. */
  constellationNodeScale: number; // 0.2..2 (scales the size mapping)
  constellationEdgeAlpha: number; // 0..1 (overall edge brightness)
  /** Aurora-mode parameters. */
  auroraHeight: number;  // 0..3 (global multiplier on ribbon height)
  auroraWobble: number;  // 0..0.4 (horizontal sway amplitude)
  /** Comet-mode parameters. */
  cometHeadScale: number; // 1..10 (head size = frame size * this)
  cometTailDecay: number; // 0.5..4 (higher = tail dies off faster)
}

interface StoreState {
  theme: Theme;
  toggleTheme: () => void;

  library: SoundLibrary | null;
  setLibrary: (library: SoundLibrary) => void;

  selectedCategory: string | null;
  setSelectedCategory: (id: string | null) => void;

  search: string;
  setSearch: (s: string) => void;

  selectedClip: SoundClip | null;
  setSelectedClip: (clip: SoundClip | null) => void;

  embedding: ClipEmbedding | null;
  setEmbedding: (e: ClipEmbedding | null) => void;

  comparisonClip: SoundClip | null;
  setComparisonClip: (clip: SoundClip | null) => void;

  comparisonEmbedding: ClipEmbedding | null;
  setComparisonEmbedding: (e: ClipEmbedding | null) => void;

  swapWithComparison: () => void;

  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  loopAudio: boolean;
  setLoopAudio: (b: boolean) => void;

  viz: VizConfig;
  setViz: (patch: Partial<VizConfig>) => void;
  setAxis: (role: AxisRole, dim: number) => void;
  resetViz: () => void;

  helpOpen: boolean;
  setHelpOpen: (b: boolean) => void;
}

// Defaults tuned for first-time visitors — landing on the House Sparrow
// clip in Smoke mode with a generous trail produces an immediately
// striking visual that showcases what Auralis is for.
//
// `sphereMin` is at the slider's minimum and `sphereMax` at the slider's
// maximum so the dynamic range of the size mapping is fully exercised.
const DEFAULT_VIZ: VizConfig = {
  trackName: "features",
  axes: { x: 0, y: 1, z: 2, color: 3, size: 4 },
  colormap: "viridis",
  reverseColormap: false,
  sphereMin: 0.01,   // matches the slider's minimum
  sphereMax: 0.6,    // matches the slider's maximum
  trailSeconds: 17,
  showTrailLine: true,
  showAxes: true,
  showGrid: true,
  renderMode: "smoke",
  smokeDensity: 8,
  smokeSpread: 0.05,
  smokeDrift: 0.08,
  burstRays: 12,
  burstSize: 1.0,
  constellationNodeScale: 0.6,
  constellationEdgeAlpha: 0.6,
  auroraHeight: 1.0,
  auroraWobble: 0.06,
  cometHeadScale: 5.0,
  cometTailDecay: 1.8
};

/** Stable id of the clip that loads automatically when the library
 *  first arrives and the user has no clip selected yet. */
export const DEFAULT_CLIP_ID = "bird-house-sparrow";

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        set({ theme: next });
      },

      library: null,
      setLibrary: (library) => set({ library }),

      selectedCategory: null,
      setSelectedCategory: (id) => set({ selectedCategory: id }),

      search: "",
      setSearch: (s) => set({ search: s }),

      selectedClip: null,
      setSelectedClip: (clip) => set({ selectedClip: clip, embedding: null, currentTime: 0 }),

      embedding: null,
      setEmbedding: (e) => set({ embedding: e }),

      comparisonClip: null,
      setComparisonClip: (clip) =>
        set({ comparisonClip: clip, comparisonEmbedding: null }),

      comparisonEmbedding: null,
      setComparisonEmbedding: (e) => set({ comparisonEmbedding: e }),

      swapWithComparison: () => {
        const s = get();
        if (!s.comparisonClip) return;
        set({
          selectedClip: s.comparisonClip,
          embedding: s.comparisonEmbedding,
          comparisonClip: s.selectedClip,
          comparisonEmbedding: s.embedding,
          currentTime: 0,
          isPlaying: false
        });
      },

      isPlaying: false,
      setIsPlaying: (b) => set({ isPlaying: b }),
      currentTime: 0,
      setCurrentTime: (t) => set({ currentTime: t }),
      loopAudio: true,
      setLoopAudio: (b) => set({ loopAudio: b }),

      viz: DEFAULT_VIZ,
      setViz: (patch) => set({ viz: { ...get().viz, ...patch } }),
      setAxis: (role, dim) =>
        set({ viz: { ...get().viz, axes: { ...get().viz.axes, [role]: dim } } }),
      resetViz: () => set({ viz: DEFAULT_VIZ }),

      helpOpen: false,
      setHelpOpen: (b) => set({ helpOpen: b })
    }),
    {
      name: "auralis-state",
      partialize: (state) => ({
        theme: state.theme,
        viz: state.viz,
        loopAudio: state.loopAudio
      })
    }
  )
);

// Apply persisted theme on first load.
if (typeof document !== "undefined") {
  const stored = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", stored);
}
