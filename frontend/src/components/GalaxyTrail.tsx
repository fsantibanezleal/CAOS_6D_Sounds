import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { buildFrameMap, computeWindow } from "../lib/frameMap";
import {
  makeGaussianTexture,
  makeSmokeMaterial
} from "../lib/smokeMaterial";
import { useStore } from "../store/useStore";

/**
 * Galaxy render mode for the 6D trail.
 *
 * Each frame seeds a small static cluster of glowing points around its
 * 6D-mapped centre. The points do not move (no drift) and do not fade
 * with age — old frames stay visible just as bright as the cursor —
 * but every point has a small *twinkle* (multiplicative alpha
 * modulation by a sine of frame index + per-particle phase). The
 * result reads as a star-field where the audio's path through 6D
 * leaves a permanent constellation.
 *
 * Differences vs. Smoke and Constellation:
 *  - Smoke: clouds drift outward + fade to invisible.
 *  - Constellation: 1 node per frame, all linked.
 *  - Galaxy: K points per frame, no edges, no fade, twinkly.
 *
 * Because nothing fades with age, the trail "fills" the 6D path
 * permanently — useful when you want to see the whole shape of the
 * audio's journey rather than just the last few seconds.
 */

const STAR_GEOMETRY_SIZE = 2; // PlaneGeometry size for the billboard quads.

export function GalaxyTrail({
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

  const density = Math.max(1, Math.min(20, viz.galaxyDensity));
  const totalStars = numFrames * density;

  const material = useMemo(() => {
    const tex = makeGaussianTexture(64);
    return makeSmokeMaterial(tex);
  }, []);
  useEffect(
    () => () => {
      const map = (material.uniforms.uMap.value as THREE.DataTexture | null) ?? null;
      material.dispose();
      if (map) map.dispose();
    },
    [material]
  );

  // Static per-star data — offset within a sphere of radius 1, plus a
  // twinkle phase. Re-rolled when density or numFrames changes.
  const stars = useMemo(() => {
    let seed = 0xa1_be_4f_77;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
    const offsets = new Float32Array(totalStars * 3);
    const phases = new Float32Array(totalStars);
    for (let i = 0; i < totalStars; i++) {
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
      phases[i] = rand() * Math.PI * 2;
    }
    return { offsets, phases };
  }, [totalStars]);

  const frames = useMemo(
    () =>
      buildFrameMap({
        values,
        numFrames,
        axisX: viz.axes.x,
        axisY: viz.axes.y,
        axisZ: viz.axes.z,
        axisColor: viz.axes.color,
        axisSize: viz.axes.size,
        colormap: viz.colormap,
        reverseColormap: viz.reverseColormap,
        sphereMin: viz.sphereMin,
        sphereMax: viz.sphereMax
      }),
    [
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
    ]
  );

  const instanceRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(totalStars * 4), 4),
    [totalStars]
  );
  const instanceSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(totalStars), 1),
    [totalStars]
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
  }, [instanceRgba, instanceSize, totalStars]);

  const twinkleAmp = viz.galaxyTwinkle;
  const spread = viz.galaxySpread;

  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;
    // Galaxy ignores the trail visibility window — every frame from
    // the start of the clip up to the current cursor is shown.
    const { cursor } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );

    const rgbaArr = instanceRgba.array as Float32Array;
    const sizeArr = instanceSize.array as Float32Array;

    for (let f = 0; f < numFrames; f++) {
      const playedYet = f <= cursor;
      const baseSize = frames.sizes[f] * 0.6; // a touch smaller than the user's slider
      const px = frames.positions[3 * f];
      const py = frames.positions[3 * f + 1];
      const pz = frames.positions[3 * f + 2];
      const cr = frames.colors[3 * f];
      const cg = frames.colors[3 * f + 1];
      const cb = frames.colors[3 * f + 2];

      for (let k = 0; k < density; k++) {
        const idx = f * density + k;

        if (!playedYet) {
          matrixObj.position.set(0, 0, 0);
          matrixObj.scale.setScalar(0.0001);
          matrixObj.updateMatrix();
          inst.setMatrixAt(idx, matrixObj.matrix);
          rgbaArr[4 * idx + 3] = 0;
          sizeArr[idx] = 0;
          continue;
        }

        const ox = stars.offsets[3 * idx] * spread;
        const oy = stars.offsets[3 * idx + 1] * spread;
        const oz = stars.offsets[3 * idx + 2] * spread;
        matrixObj.position.set(px + ox, py + oy, pz + oz);
        matrixObj.scale.setScalar(1);
        matrixObj.updateMatrix();
        inst.setMatrixAt(idx, matrixObj.matrix);

        // Twinkle: deterministic per-frame sine modulated by per-star
        // phase. The cursor advances the time argument so star
        // brightness cycles smoothly as the audio plays.
        const tw = 1 + twinkleAmp * Math.sin(stars.phases[idx] + cursor * 0.07);
        rgbaArr[4 * idx] = cr * tw;
        rgbaArr[4 * idx + 1] = cg * tw;
        rgbaArr[4 * idx + 2] = cb * tw;
        rgbaArr[4 * idx + 3] = 0.6 * tw; // permanent, no age fade
        sizeArr[idx] = baseSize * (0.6 + 0.4 * (1 + 0.3 * Math.sin(stars.phases[idx] + cursor * 0.07)));
      }
    }

    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;
    instanceSize.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef as any}
      args={[undefined as any, material as any, totalStars]}
      frustumCulled={false}
    >
      <planeGeometry args={[STAR_GEOMETRY_SIZE, STAR_GEOMETRY_SIZE]} />
    </instancedMesh>
  );
}
