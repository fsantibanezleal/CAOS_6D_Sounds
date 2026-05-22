/**
 * Demo tour — automatic cycling through a curated set of clip + render
 * mode + track combinations. Designed to be screen-recorded (or used
 * with the existing webm record button) to produce a short showcase
 * video without manual clicking.
 *
 * Activation:
 *   - URL param: `?demo=1`  →  starts the tour on mount.
 *   - URL param: `?demo=1&interval=6` →  6 s per stop (default 7).
 *   - Programmatic: import { startTour, stopTour } and call from a UI
 *     button (`DemoTourButton.tsx`).
 *
 * Stops are picked to span the visual + acoustic range: a song bird,
 * a music piece in Tonnetz, a pure synth tone, a famous speech in
 * YAMNet semantic space, a whale (underwater category), a wolf howl
 * with Aurora curtains, a mechanical train under Tube ribbon, and a
 * second bird in Bursts mode. Eight stops × ~7 s ≈ a 56-second
 * shareable demo.
 */
import type { SoundClip } from "./api";
import type { RenderMode, VizConfig } from "../store/useStore";

export interface TourStop {
  clipId: string;            // looked up in library.clips; falls back to first clip
  renderMode: RenderMode;
  trackName: string;
  axes?: VizConfig["axes"];  // optional axis override per stop
  caption?: string;          // shown if/when we add a HUD; not rendered today
}

export const TOUR_STOPS: TourStop[] = [
  {
    clipId: "bird-house-sparrow",
    renderMode: "comet",
    trackName: "features",
    caption: "House Sparrow — interpretable spectral features"
  },
  {
    clipId: "music-vivaldi-spring-allegro",
    renderMode: "smoke",
    trackName: "tonnetz",
    caption: "Vivaldi — harmonic Tonnetz space"
  },
  {
    clipId: "synth-pure-tone-440",
    renderMode: "galaxy",
    trackName: "features",
    caption: "Pure tone — Galaxy constellation"
  },
  {
    clipId: "speech-armstrong-step",
    renderMode: "lightpainting",
    trackName: "yamnet",
    caption: "Armstrong's first step — YAMNet semantic projection"
  },
  {
    clipId: "underwater-humpback-whale-song",
    renderMode: "flowfield",
    trackName: "yamnet",
    caption: "Humpback whale — Flowfield wake"
  },
  {
    clipId: "mammal-wolf-howl",
    renderMode: "aurora",
    trackName: "umap",
    caption: "Wolf howl — Aurora curtains, UMAP space"
  },
  {
    clipId: "mechanical-train-engine",
    renderMode: "tube",
    trackName: "pca",
    caption: "Steam locomotive — Tube ribbon, PCA"
  },
  {
    clipId: "bird-blackbird",
    renderMode: "bursts",
    trackName: "features",
    caption: "Blackbird song — Bursts"
  }
];

export interface DemoTourOptions {
  intervalSeconds?: number;
  loop?: boolean;
  stops?: TourStop[];
  onAdvance?: (stop: TourStop, index: number) => void;
  onComplete?: () => void;
}

export interface DemoTourHandle {
  stop(): void;
  isRunning(): boolean;
}

export function parseDemoFromUrl(): { active: boolean; intervalSeconds: number } {
  if (typeof window === "undefined") return { active: false, intervalSeconds: 7 };
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") !== "1") return { active: false, intervalSeconds: 7 };
  const iv = parseFloat(params.get("interval") ?? "7");
  return {
    active: true,
    intervalSeconds: Number.isFinite(iv) && iv > 0 ? iv : 7
  };
}

/**
 * Start the tour. Returns a handle the caller can use to stop it.
 *
 * @param applyStop  callback invoked once per stop with the resolved
 *                   clip + viz patch. Wires to the zustand store from
 *                   the caller side (DemoTourButton) so this lib stays
 *                   store-agnostic and easier to unit-test.
 */
export function startTour(
  resolveClip: (clipId: string) => SoundClip | undefined,
  applyStop: (stop: TourStop, clip: SoundClip) => void,
  opts: DemoTourOptions = {}
): DemoTourHandle {
  const intervalMs = (opts.intervalSeconds ?? 7) * 1000;
  const stops = opts.stops ?? TOUR_STOPS;
  const loop = opts.loop ?? true;

  let i = 0;
  let timerId: number | null = null;
  let stopped = false;

  function advance(): void {
    if (stopped) return;
    if (i >= stops.length) {
      if (loop) {
        i = 0;
      } else {
        stopped = true;
        opts.onComplete?.();
        return;
      }
    }
    const stop = stops[i];
    const clip = resolveClip(stop.clipId);
    if (clip) {
      applyStop(stop, clip);
      opts.onAdvance?.(stop, i);
    }
    i += 1;
    timerId = window.setTimeout(advance, intervalMs);
  }

  // Run the first stop immediately so the user sees motion right away.
  advance();

  return {
    stop(): void {
      stopped = true;
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    },
    isRunning(): boolean {
      return !stopped;
    }
  };
}
