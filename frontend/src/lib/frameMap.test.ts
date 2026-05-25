/**
 * Unit tests for the shared per-frame mapping helpers.
 *
 * These functions are the foundation of every render mode: a bug here
 * silently corrupts the visuals across all 10 modes. Worth covering
 * the edge cases (defensive fallbacks, window clamping, trail floor).
 */
import { describe, expect, it } from "vitest";

import { AXIS_HALF, buildFrameMap, computeWindow } from "./frameMap";

describe("buildFrameMap", () => {
  it("maps each axis value through (v * 2 - 1) * AXIS_HALF for position", () => {
    const result = buildFrameMap({
      values: [[0.5, 0.5, 0.5, 0.5, 0.5]],
      numFrames: 1,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: false,
      sphereMin: 0.1,
      sphereMax: 0.5
    });
    // v=0.5 → (0.5*2-1)*AXIS_HALF = 0 — center of the world.
    expect(result.positions[0]).toBe(0);
    expect(result.positions[1]).toBe(0);
    expect(result.positions[2]).toBe(0);
  });

  it("pushes v=0 to -AXIS_HALF and v=1 to +AXIS_HALF on each axis", () => {
    const result = buildFrameMap({
      values: [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 0, 0]
      ],
      numFrames: 2,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: false,
      sphereMin: 0,
      sphereMax: 1
    });
    // Frame 0: all zeros → -AXIS_HALF on every axis
    expect(result.positions[0]).toBeCloseTo(-AXIS_HALF);
    expect(result.positions[1]).toBeCloseTo(-AXIS_HALF);
    expect(result.positions[2]).toBeCloseTo(-AXIS_HALF);
    // Frame 1: ones → +AXIS_HALF
    expect(result.positions[3]).toBeCloseTo(AXIS_HALF);
    expect(result.positions[4]).toBeCloseTo(AXIS_HALF);
    expect(result.positions[5]).toBeCloseTo(AXIS_HALF);
  });

  it("interpolates sizes between sphereMin and sphereMax via axisSize", () => {
    const result = buildFrameMap({
      values: [
        [0.5, 0.5, 0.5, 0.5, 0],
        [0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 1]
      ],
      numFrames: 3,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: false,
      sphereMin: 0.1,
      sphereMax: 0.5
    });
    expect(result.sizes[0]).toBeCloseTo(0.1); // size axis = 0 → sphereMin
    expect(result.sizes[1]).toBeCloseTo(0.3); // 0.5 → halfway
    expect(result.sizes[2]).toBeCloseTo(0.5); // 1 → sphereMax
  });

  it("falls back to 0.5 when a row is missing rather than producing NaN", () => {
    // The defensive fallback is what stops a bad embedding file from
    // freezing the canvas — verified here.
    const result = buildFrameMap({
      values: [], // ← deliberately empty
      numFrames: 1,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: false,
      sphereMin: 0,
      sphereMax: 1
    });
    // 0.5 fallback → world origin, no NaN.
    for (let i = 0; i < 3; i++) {
      expect(result.positions[i]).toBe(0);
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
    // Colour fallback is also defined.
    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(result.colors[i])).toBe(true);
    }
    expect(Number.isFinite(result.sizes[0])).toBe(true);
  });

  it("reverses the colormap when reverseColormap is true", () => {
    const forward = buildFrameMap({
      values: [[0, 0, 0, 0, 0]],
      numFrames: 1,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: false,
      sphereMin: 0,
      sphereMax: 1
    });
    const reverse = buildFrameMap({
      values: [[0, 0, 0, 0, 0]],
      numFrames: 1,
      axisX: 0,
      axisY: 1,
      axisZ: 2,
      axisColor: 3,
      axisSize: 4,
      colormap: "viridis",
      reverseColormap: true,
      sphereMin: 0,
      sphereMax: 1
    });
    // axisColor = 3 → v[3] = 0 → reversed = 1.
    // Forward t=0 vs reverse t=1 should produce visibly different colours.
    const colorsDiffer =
      forward.colors[0] !== reverse.colors[0] ||
      forward.colors[1] !== reverse.colors[1] ||
      forward.colors[2] !== reverse.colors[2];
    expect(colorsDiffer).toBe(true);
  });
});

describe("computeWindow", () => {
  const HOP = 0.05;
  const NUM_FRAMES = 100;

  it("returns cursor=0, start=0 at t=0", () => {
    const { cursor, start } = computeWindow(0, HOP, 5, NUM_FRAMES);
    expect(cursor).toBe(0);
    expect(start).toBe(0);
  });

  it("advances cursor by 1 every HOP seconds", () => {
    const { cursor } = computeWindow(10 * HOP, HOP, 5, NUM_FRAMES);
    expect(cursor).toBe(10);
  });

  it("clamps cursor to numFrames-1 past the end", () => {
    const { cursor } = computeWindow(100 * HOP, HOP, 5, NUM_FRAMES);
    expect(cursor).toBe(NUM_FRAMES - 1);
  });

  it("computes start = cursor - trailFrames + 1, clamped to >= 0", () => {
    const { cursor, start, trailFrames } = computeWindow(
      20 * HOP, // t such that cursor=20
      HOP,
      1.0, // 1 s trail → 20 frames
      NUM_FRAMES
    );
    expect(cursor).toBe(20);
    expect(trailFrames).toBe(20);
    expect(start).toBe(20 - 20 + 1);
  });

  it("enforces minTrailFrames so very short trails still show something", () => {
    const { trailFrames } = computeWindow(
      0,
      HOP,
      0.001, // 1 ms trail → would round to 0 frames
      NUM_FRAMES,
      8
    );
    expect(trailFrames).toBe(8); // minTrailFrames floor
  });

  it("never returns negative start", () => {
    const { start } = computeWindow(0, HOP, 17, NUM_FRAMES);
    expect(start).toBe(0);
  });
});
