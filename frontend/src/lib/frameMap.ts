/**
 * Shared per-frame mapping for every render mode.
 *
 * Given a 6D track values matrix and the user's axis assignment, produce
 * three flat Float32Array buffers (positions / colors / sizes) that every
 * render component can consume identically.
 *
 * Keeps the rendering modes consistent (a frame at index `i` always lives
 * at the same world position regardless of which mode is drawing it) and
 * removes ~120 lines of duplicated code from Trail6D / SmokeTrail /
 * BurstsTrail and the new Constellation / Aurora / Comet trails.
 */
import { sampleColormap, type ColormapName } from "./colormaps";

export const AXIS_HALF = 1.5; // world units; values in [0,1] map to [-1.5, +1.5]

export interface FrameMapInput {
  values: number[][];
  numFrames: number;
  axisX: number;
  axisY: number;
  axisZ: number;
  axisColor: number;
  axisSize: number;
  colormap: ColormapName;
  reverseColormap: boolean;
  sphereMin: number;
  sphereMax: number;
}

export interface FrameMap {
  positions: Float32Array; // shape (numFrames, 3)
  colors: Float32Array;    // shape (numFrames, 3) RGB in [0, 1]
  sizes: Float32Array;     // shape (numFrames,)
}

/**
 * Build the per-frame mapping for one clip.
 *
 * Reads the user's axis assignment (which dimension drives X / Y / Z /
 * color / size) from the input, then produces three flat typed arrays
 * that every render mode iterates over identically.
 *
 * Defensive fallbacks: a missing per-frame row or a missing axis value
 * collapses to 0.5 — that lands the frame at the world origin with a
 * mid-range size + colour rather than producing NaN coordinates (which
 * would freeze the WebGL pipeline). The defensive defaults exist
 * because embeddings come from disk and a malformed file should not
 * crash the canvas.
 */
export function buildFrameMap(input: FrameMapInput): FrameMap {
  const {
    values,
    numFrames,
    axisX,
    axisY,
    axisZ,
    axisColor,
    axisSize,
    colormap,
    reverseColormap,
    sphereMin,
    sphereMax
  } = input;
  const positions = new Float32Array(numFrames * 3);
  const colors = new Float32Array(numFrames * 3);
  const sizes = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const v = values[i] ?? [];
    positions[3 * i] = ((v[axisX] ?? 0.5) * 2 - 1) * AXIS_HALF;
    positions[3 * i + 1] = ((v[axisY] ?? 0.5) * 2 - 1) * AXIS_HALF;
    positions[3 * i + 2] = ((v[axisZ] ?? 0.5) * 2 - 1) * AXIS_HALF;
    const tColor = reverseColormap
      ? 1 - (v[axisColor] ?? 0.5)
      : v[axisColor] ?? 0.5;
    const [r, g, b] = sampleColormap(colormap, tColor);
    colors[3 * i] = r;
    colors[3 * i + 1] = g;
    colors[3 * i + 2] = b;
    sizes[i] = sphereMin + (sphereMax - sphereMin) * (v[axisSize] ?? 0.5);
  }
  return { positions, colors, sizes };
}

/**
 * Compute the visible-window indices for the current playhead.
 *
 * Every animated render mode (spheres, smoke, bursts, …) needs to
 * answer the same two questions every frame: where is the cursor (the
 * frame at the current audio playhead), and what range of trailing
 * frames is still visible.
 *
 * - ``cursor`` — the latest frame at or before the playhead. Clamped
 *   to the last valid index so the cursor never reads past the
 *   embedding array.
 * - ``trailFrames`` — how many frames back are kept visible, derived
 *   from the user's trail-length slider. Floored to ``minTrailFrames``
 *   so very short trail settings still render *something*; without the
 *   floor a 0.5 s trail on a 50 ms hop would only show 10 frames and
 *   modes like Comet would lose their visual signature.
 * - ``start`` — the first visible frame index (clamped to 0).
 *
 * For light-painting mode the caller ignores ``start`` and draws
 * everything from 0 to ``cursor`` (the "accumulate every visited
 * frame" semantics).
 */
export function computeWindow(
  currentTime: number,
  hopSeconds: number,
  trailSeconds: number,
  numFrames: number,
  minTrailFrames = 8
): { cursor: number; start: number; trailFrames: number } {
  const trailFrames = Math.max(
    minTrailFrames,
    Math.round(trailSeconds / hopSeconds)
  );
  const cursor = Math.min(numFrames - 1, Math.floor(currentTime / hopSeconds));
  const start = Math.max(0, cursor - trailFrames + 1);
  return { cursor, start, trailFrames };
}
