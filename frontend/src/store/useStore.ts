import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ClipEmbedding, SoundClip, SoundLibrary } from "../lib/api";
import { type ColormapName } from "../lib/colormaps";

export type Theme = "dark" | "light";
export type AxisRole = "x" | "y" | "z" | "color" | "size";

export interface VizConfig {
  /** Which embedding track to use (features / pca / tsne / umap). */
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

  isPlaying: boolean;
  setIsPlaying: (b: boolean) => void;
  currentTime: number;
  setCurrentTime: (t: number) => void;

  viz: VizConfig;
  setViz: (patch: Partial<VizConfig>) => void;
  setAxis: (role: AxisRole, dim: number) => void;
  resetViz: () => void;

  helpOpen: boolean;
  setHelpOpen: (b: boolean) => void;
}

const DEFAULT_VIZ: VizConfig = {
  trackName: "features",
  axes: { x: 0, y: 1, z: 2, color: 3, size: 4 },
  colormap: "viridis",
  reverseColormap: false,
  sphereMin: 0.04,
  sphereMax: 0.18,
  trailSeconds: 4,
  showTrailLine: true,
  showAxes: true,
  showGrid: true
};

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

      isPlaying: false,
      setIsPlaying: (b) => set({ isPlaying: b }),
      currentTime: 0,
      setCurrentTime: (t) => set({ currentTime: t }),

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
      partialize: (state) => ({ theme: state.theme, viz: state.viz })
    }
  )
);

// Apply persisted theme on first load.
if (typeof document !== "undefined") {
  const stored = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", stored);
}
