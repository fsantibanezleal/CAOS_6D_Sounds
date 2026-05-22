import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { sampleColormap } from "../lib/colormaps";
import { useStore } from "../store/useStore";

/**
 * Bursts (fireworks) render mode for the 6D trail.
 *
 * Each per-audio-frame is drawn as a tiny explosion of `rayCount`
 * line segments radiating from the frame's 6D-mapped position.
 * Each ray points in a static random direction (seeded so re-renders
 * are stable) and grows in length with the audio frame's size axis +
 * with how long ago the frame was emitted (older bursts have longer,
 * dimmer flares).
 *
 * Implementation notes:
 *  - One `THREE.LineSegments` with `vertexColors + vertexAlphas`.
 *  - Each frame contributes `rayCount * 2` vertices (one segment per ray).
 *  - Outside the visibility window we collapse both endpoints to the
 *    origin and set alpha=0, which renders as a degenerate, invisible
 *    line — cheap and avoids reallocation.
 *  - Static per-ray data (random unit direction, length jitter) is
 *    seeded with a fixed RNG so a given frame's burst is the same
 *    every time the user scrubs back to it.
 */

const AXIS_HALF = 1.5;
const MIN_TRAIL_FRAMES = 8;

export function BurstsTrail({
  values,
  numFrames,
  hopSeconds
}: {
  values: number[][];
  numFrames: number;
  hopSeconds: number;
}) {
  const viz = useStore((s) => s.viz);
  const currentTime = useStore((s) => s.currentTime);

  const linesRef = useRef<THREE.LineSegments>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const rayCount = Math.max(2, Math.min(32, viz.burstRays));
  const totalSegments = numFrames * rayCount;
  const totalVertices = totalSegments * 2;

  // Static per-ray attributes — direction + length jitter. Re-rolled
  // when `rayCount` or `numFrames` changes.
  const rays = useMemo(() => {
    let seed = 0xb0_05_71_c5;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
    const dirs = new Float32Array(totalSegments * 3);
    const lengthJitter = new Float32Array(totalSegments);
    for (let i = 0; i < totalSegments; i++) {
      // Uniform unit vector via rejection sampling.
      let x = 0;
      let y = 0;
      let z = 0;
      while (true) {
        x = rand() * 2 - 1;
        y = rand() * 2 - 1;
        z = rand() * 2 - 1;
        const r2 = x * x + y * y + z * z;
        if (r2 > 0.05 && r2 <= 1) {
          const r = Math.sqrt(r2);
          x /= r;
          y /= r;
          z /= r;
          break;
        }
      }
      dirs[3 * i] = x;
      dirs[3 * i + 1] = y;
      dirs[3 * i + 2] = z;
      lengthJitter[i] = 0.7 + rand() * 0.6;
    }
    return { dirs, lengthJitter };
  }, [totalSegments]);

  // Per-frame static map of (parent_pos, parent_color, parent_size).
  const frames = useMemo(() => {
    const xi = viz.axes.x;
    const yi = viz.axes.y;
    const zi = viz.axes.z;
    const ci = viz.axes.color;
    const si = viz.axes.size;
    const positions = new Float32Array(numFrames * 3);
    const colors = new Float32Array(numFrames * 3);
    const sizes = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const v = values[i] ?? [];
      positions[3 * i] = ((v[xi] ?? 0.5) * 2 - 1) * AXIS_HALF;
      positions[3 * i + 1] = ((v[yi] ?? 0.5) * 2 - 1) * AXIS_HALF;
      positions[3 * i + 2] = ((v[zi] ?? 0.5) * 2 - 1) * AXIS_HALF;
      const tColor = viz.reverseColormap ? 1 - (v[ci] ?? 0.5) : v[ci] ?? 0.5;
      const [r, g, b] = sampleColormap(viz.colormap, tColor);
      colors[3 * i] = r;
      colors[3 * i + 1] = g;
      colors[3 * i + 2] = b;
      sizes[i] = viz.sphereMin + (viz.sphereMax - viz.sphereMin) * (v[si] ?? 0.5);
    }
    return { positions, colors, sizes };
  }, [
    values,
    numFrames,
    viz.axes.x,
    viz.axes.y,
    viz.axes.z,
    viz.axes.color,
    viz.axes.size,
    viz.colormap,
    viz.reverseColormap,
    viz.sphereMin,
    viz.sphereMax
  ]);

  // Allocate position + color buffers once per (numFrames, rayCount).
  useEffect(() => {
    const geo = geomRef.current;
    if (!geo) return;
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(totalVertices * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(totalVertices * 4), 4)
    );
    geo.setDrawRange(0, totalVertices);
  }, [totalVertices]);

  useFrame(() => {
    const geo = geomRef.current;
    if (!geo) return;
    const positionAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute;
    if (!positionAttr || !colorAttr) return;

    const trailFrames = Math.max(
      MIN_TRAIL_FRAMES,
      Math.round(viz.trailSeconds / hopSeconds)
    );
    const cursor = Math.min(numFrames - 1, Math.floor(currentTime / hopSeconds));
    const start = Math.max(0, cursor - trailFrames + 1);

    const posArr = positionAttr.array as Float32Array;
    const colArr = colorAttr.array as Float32Array;

    for (let f = 0; f < numFrames; f++) {
      const visible = f >= start && f <= cursor;
      const baseRayIdx = f * rayCount;

      if (!visible) {
        // Collapse the rays to a degenerate origin segment + alpha 0.
        for (let k = 0; k < rayCount; k++) {
          const ri = baseRayIdx + k;
          const v0 = ri * 2;
          const v1 = v0 + 1;
          posArr[3 * v0] = 0;
          posArr[3 * v0 + 1] = 0;
          posArr[3 * v0 + 2] = 0;
          posArr[3 * v1] = 0;
          posArr[3 * v1 + 1] = 0;
          posArr[3 * v1 + 2] = 0;
          colArr[4 * v0 + 3] = 0;
          colArr[4 * v1 + 3] = 0;
        }
        continue;
      }

      const ageFrames = cursor - f;
      const alpha = 1 - ageFrames / Math.max(1, trailFrames);
      const baseLen = frames.sizes[f] * 4.0; // bursts read better with longer rays than spheres
      const lengthGrow = 1 + 0.6 * (ageFrames / Math.max(1, trailFrames));
      const cx = frames.positions[3 * f];
      const cy = frames.positions[3 * f + 1];
      const cz = frames.positions[3 * f + 2];
      const cr = frames.colors[3 * f];
      const cg = frames.colors[3 * f + 1];
      const cb = frames.colors[3 * f + 2];

      for (let k = 0; k < rayCount; k++) {
        const ri = baseRayIdx + k;
        const v0 = ri * 2;
        const v1 = v0 + 1;
        const dx = rays.dirs[3 * ri];
        const dy = rays.dirs[3 * ri + 1];
        const dz = rays.dirs[3 * ri + 2];
        const len = baseLen * rays.lengthJitter[ri] * lengthGrow * viz.burstSize;

        // Start at the centre.
        posArr[3 * v0] = cx;
        posArr[3 * v0 + 1] = cy;
        posArr[3 * v0 + 2] = cz;
        // End along the random direction.
        posArr[3 * v1] = cx + dx * len;
        posArr[3 * v1 + 1] = cy + dy * len;
        posArr[3 * v1 + 2] = cz + dz * len;

        // Bright at centre, fading along the ray.
        colArr[4 * v0] = cr;
        colArr[4 * v0 + 1] = cg;
        colArr[4 * v0 + 2] = cb;
        colArr[4 * v0 + 3] = alpha;
        colArr[4 * v1] = cr;
        colArr[4 * v1 + 1] = cg;
        colArr[4 * v1 + 2] = cb;
        colArr[4 * v1 + 3] = alpha * 0.15; // tip of the flare nearly invisible
      }
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  });

  return (
    <lineSegments ref={linesRef as any}>
      <bufferGeometry ref={geomRef as any} />
      <lineBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        {...({ vertexAlphas: true } as any)}
      />
    </lineSegments>
  );
}
