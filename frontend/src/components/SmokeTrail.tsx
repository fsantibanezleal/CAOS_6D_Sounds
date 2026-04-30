import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { sampleColormap } from "../lib/colormaps";
import { makeGaussianTexture, makeSmokeMaterial } from "../lib/smokeMaterial";
import { useStore } from "../store/useStore";

/**
 * Smoke render mode for the 6D trail.
 *
 * Each per-audio-frame emits ``viz.smokeDensity`` billboarded particles
 * at small random offsets around the frame's 6D-mapped position, with a
 * radial drift that grows with age. The puffs are textured with a soft
 * gaussian and rendered with additive blending; overlapping puffs
 * visually merge into smooth coloured smoke.
 *
 * The visible window is identical to the spheres mode: only frames in
 * ``[start, cursor]`` are drawn, with linear age-fade.
 */

const AXIS_HALF = 1.5;
const MIN_TRAIL_FRAMES = 8;

export function SmokeTrail({
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

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrixObj = useMemo(() => new THREE.Object3D(), []);

  const density = Math.max(1, Math.min(16, viz.smokeDensity));
  const totalParticles = numFrames * density;

  // Cache: gaussian texture + smoke material (created once per mount).
  const material = useMemo(() => {
    const tex = makeGaussianTexture(64);
    return makeSmokeMaterial(tex);
  }, []);
  useEffect(
    () => () => {
      const mat = material;
      const map = (mat.uniforms.uMap.value as THREE.DataTexture | null) ?? null;
      mat.dispose();
      if (map) map.dispose();
    },
    [material]
  );

  // Static per-particle attributes — initial offset and drift velocity.
  // Re-rolled when `density` or `numFrames` changes.
  const particles = useMemo(() => {
    // Use a fixed seed for reproducibility across re-renders within a clip.
    let seed = 0x6d5d_a0c5;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
    const offsets = new Float32Array(totalParticles * 3);
    const velocities = new Float32Array(totalParticles * 3);
    const colorJitter = new Float32Array(totalParticles); // -1..+1 brightness wobble
    for (let i = 0; i < totalParticles; i++) {
      // Random point in unit ball via rejection sampling, then scale.
      let x = 0;
      let y = 0;
      let z = 0;
      while (true) {
        x = rand() * 2 - 1;
        y = rand() * 2 - 1;
        z = rand() * 2 - 1;
        if (x * x + y * y + z * z <= 1) break;
      }
      offsets[3 * i] = x;
      offsets[3 * i + 1] = y;
      offsets[3 * i + 2] = z;
      // Drift velocity = same direction as offset (radial), magnitude in (0.4..1.0)
      const len = Math.sqrt(x * x + y * y + z * z) + 1e-6;
      const m = 0.4 + rand() * 0.6;
      velocities[3 * i] = (x / len) * m;
      velocities[3 * i + 1] = (y / len) * m;
      velocities[3 * i + 2] = (z / len) * m;
      colorJitter[i] = (rand() - 0.5) * 0.3;
    }
    return { offsets, velocities, colorJitter };
  }, [totalParticles]);

  // Per-frame static map of (parent_pos, parent_color, parent_size). This is
  // the same computation as Trail6D's `frames` memo — recomputed when the
  // axis mapping or colormap changes.
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

  // Allocate per-instance custom attributes once; reused each frame.
  const instanceRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(totalParticles * 4), 4),
    [totalParticles]
  );
  const instanceSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(totalParticles), 1),
    [totalParticles]
  );
  useEffect(() => {
    instanceRgba.setUsage(THREE.DynamicDrawUsage);
    instanceSize.setUsage(THREE.DynamicDrawUsage);
  }, [instanceRgba, instanceSize]);

  useEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    inst.geometry.setAttribute("instanceRgba", instanceRgba);
    inst.geometry.setAttribute("instanceSize", instanceSize);
    return () => {
      inst.geometry.deleteAttribute("instanceRgba");
      inst.geometry.deleteAttribute("instanceSize");
    };
  }, [instanceRgba, instanceSize, totalParticles]);

  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;

    const trailFrames = Math.max(
      MIN_TRAIL_FRAMES,
      Math.round(viz.trailSeconds / hopSeconds)
    );
    const cursor = Math.min(numFrames - 1, Math.floor(currentTime / hopSeconds));
    const start = Math.max(0, cursor - trailFrames + 1);

    const rgbaArr = instanceRgba.array as Float32Array;
    const sizeArr = instanceSize.array as Float32Array;

    const spread = viz.smokeSpread;
    const drift = viz.smokeDrift;

    for (let f = 0; f < numFrames; f++) {
      const visible = f >= start && f <= cursor;
      const ageFrames = visible ? cursor - f : 0;
      const alphaFrame = visible ? 1 - ageFrames / Math.max(1, trailFrames) : 0;
      const baseSize = frames.sizes[f];
      // Smoke radius grows with age (the puff disperses).
      const sizeNow = baseSize * (1.5 + 0.5 * (ageFrames / Math.max(1, trailFrames)));
      const px = frames.positions[3 * f];
      const py = frames.positions[3 * f + 1];
      const pz = frames.positions[3 * f + 2];
      const cr = frames.colors[3 * f];
      const cg = frames.colors[3 * f + 1];
      const cb = frames.colors[3 * f + 2];

      for (let k = 0; k < density; k++) {
        const idx = f * density + k;

        if (!visible) {
          // Hide: alpha 0 + tiny size.
          matrixObj.position.set(0, 0, 0);
          matrixObj.scale.setScalar(0.0001);
          matrixObj.updateMatrix();
          inst.setMatrixAt(idx, matrixObj.matrix);
          rgbaArr[4 * idx + 3] = 0;
          sizeArr[idx] = 0;
          continue;
        }

        const ageSeconds = ageFrames * hopSeconds;
        const driftPx = particles.velocities[3 * idx] * drift * ageSeconds;
        const driftPy = particles.velocities[3 * idx + 1] * drift * ageSeconds;
        const driftPz = particles.velocities[3 * idx + 2] * drift * ageSeconds;
        const ox = particles.offsets[3 * idx] * spread;
        const oy = particles.offsets[3 * idx + 1] * spread;
        const oz = particles.offsets[3 * idx + 2] * spread;
        matrixObj.position.set(px + ox + driftPx, py + oy + driftPy, pz + oz + driftPz);
        // Scale = 1 in instanceMatrix; the shader applies `instanceSize`.
        matrixObj.scale.setScalar(1);
        matrixObj.updateMatrix();
        inst.setMatrixAt(idx, matrixObj.matrix);

        // Per-particle subtle brightness wobble keeps the cloud from
        // looking like a flat shading; ±15 % multiplicative jitter.
        const j = particles.colorJitter[idx];
        const k1 = 1 + j;
        rgbaArr[4 * idx] = cr * k1;
        rgbaArr[4 * idx + 1] = cg * k1;
        rgbaArr[4 * idx + 2] = cb * k1;
        // Each puff keeps a fraction of the frame alpha — additive
        // blending stacks them to recover full intensity at the head.
        rgbaArr[4 * idx + 3] = alphaFrame / Math.max(2, density * 0.6);
        sizeArr[idx] = sizeNow;
      }
    }

    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;
    instanceSize.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef as any}
      args={[undefined as any, material as any, totalParticles]}
      frustumCulled={false}
    >
      <planeGeometry args={[2, 2]} />
    </instancedMesh>
  );
}
