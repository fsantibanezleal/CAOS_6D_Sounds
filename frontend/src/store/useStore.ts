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
  | "comet"
  | "tube"
  | "galaxy"
  | "flowfield";

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
  /** Tube-ribbon parameters. */
  tubeWidth: number;      // 0.2..3.0 (multiplier on frame.size to derive ribbon half-width)
  /** Galaxy-mode parameters. */
  galaxyDensity: number;  // 1..20 stars per frame
  galaxySpread: number;   // 0..0.4 cluster radius in world units
  galaxyTwinkle: number;  // 0..0.8 multiplicative brightness wobble
  /** Flowfield-mode parameters. */
  flowfieldParticles: number; // 32..800 particles in the swarm
  flowfieldSpeed: number;     // 0.05..1 advection speed (world units / s)
  flowfieldLifetime: number;  // 0.5..6 seconds before respawn
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
// clip in Comet mode with a generous trail produces an immediately
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
  renderMode: "comet",
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
  cometTailDecay: 1.8,
  tubeWidth: 1.4,
  galaxyDensity: 6,
  galaxySpread: 0.04,
  galaxyTwinkle: 0.35,
  flowfieldParticles: 240,
  flowfieldSpeed: 0.35,
  flowfieldLifetime: 2.5
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
      // Bump this every time we add new required fields to `viz`. Older
      // persisted states that lack those fields are discarded so we
      // don't render with `undefined` numbers (which propagate as NaN
      // and freeze the WebGL InstancedMesh).
      // History:
      //   v2 — added Constellation + Aurora + Comet fields (release 0.5.1)
      //   v3 — added Tube + Galaxy fields (release 0.6.0)
      //   v4 — added Flowfield fields (release 0.7.0)
      version: 4,
      partialize: (state) => ({
        theme: state.theme,
        viz: state.viz,
        loopAudio: state.loopAudio
      }),
      // Defensive merger: even when the version matches, we deep-merge
      // the persisted `viz` over the current defaults so any missing
      // sub-key (e.g. a freshly-added `cometHeadScale`) is filled in
      // with the default value rather than `undefined`.
      merge: (persistedRaw, current) => {
        const persisted = (persistedRaw ?? {}) as Partial<StoreState>;
        const persistedViz = (persisted.viz ?? {}) as Partial<VizConfig>;
        return {
          ...current,
          ...persisted,
          viz: {
            ...current.viz,
            ...persistedViz,
            axes: { ...current.viz.axes, ...(persistedViz.axes ?? {}) }
          }
        } as StoreState;
      }
    }
  )
);

// Apply persisted theme on first load.
if (typeof document !== "undefined") {
  const stored = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", stored);
}
