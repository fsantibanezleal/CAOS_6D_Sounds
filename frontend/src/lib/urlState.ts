/**
 * Shareable URL state — encode the key parts of the viz config and the
 * current clip selection into `location.hash`, so a link reproduces the
 * exact view the sender was looking at.
 *
 * We deliberately ship only a *minimal* schema (clip ids, render mode,
 * track, axis mapping). Anything else (colormap toggles, per-mode
 * sliders, trail length, bloom) is left to the user's persisted
 * localStorage. This keeps the URL short enough to paste into a tweet
 * and stops it from churning on every slider drag.
 *
 * No gzip — the JSON payload is ~150 bytes before base64; the URL stays
 * well under 200 chars. We can revisit if the schema grows.
 */
import type { RenderMode, VizConfig } from "../store/useStore";

export interface SharedState {
  clipId?: string;
  comparisonClipId?: string | null;
  renderMode?: RenderMode;
  trackName?: string;
  axes?: VizConfig["axes"];
}

const VALID_RENDER_MODES: ReadonlySet<RenderMode> = new Set([
  "spheres",
  "smoke",
  "bursts",
  "constellation",
  "aurora",
  "comet",
  "tube",
  "galaxy",
  "flowfield",
  "lightpainting"
]);

/** Encode a minimal state object as a URL-safe base64 string. */
export function encodeState(state: SharedState): string {
  const json = JSON.stringify(state);
  // btoa only handles latin-1; route UTF-8 through encodeURIComponent so
  // any non-ASCII bytes survive the round trip.
  const latin1 = unescape(encodeURIComponent(json));
  return btoa(latin1)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a URL hash back into a SharedState. Returns null on any
 *  parse / validation failure — the caller falls back to localStorage. */
export function decodeState(hash: string): SharedState | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const latin1 = atob(b64);
    const json = decodeURIComponent(escape(latin1));
    const parsed = JSON.parse(json) as unknown;
    return validate(parsed);
  } catch {
    return null;
  }
}

function validate(parsed: unknown): SharedState | null {
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const out: SharedState = {};

  if (typeof obj.clipId === "string" && obj.clipId.length <= 128) {
    out.clipId = obj.clipId;
  }
  if (obj.comparisonClipId === null) {
    out.comparisonClipId = null;
  } else if (
    typeof obj.comparisonClipId === "string" &&
    obj.comparisonClipId.length <= 128
  ) {
    out.comparisonClipId = obj.comparisonClipId;
  }
  if (
    typeof obj.renderMode === "string" &&
    VALID_RENDER_MODES.has(obj.renderMode as RenderMode)
  ) {
    out.renderMode = obj.renderMode as RenderMode;
  }
  if (typeof obj.trackName === "string" && obj.trackName.length <= 64) {
    out.trackName = obj.trackName;
  }
  if (obj.axes && typeof obj.axes === "object") {
    const a = obj.axes as Record<string, unknown>;
    const axes: VizConfig["axes"] = { x: 0, y: 1, z: 2, color: 3, size: 4 };
    let ok = true;
    for (const role of ["x", "y", "z", "color", "size"] as const) {
      const v = a[role];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 31) {
        ok = false;
        break;
      }
      axes[role] = v;
    }
    if (ok) out.axes = axes;
  }
  return out;
}
