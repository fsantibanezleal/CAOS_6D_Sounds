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
 * Flowfield render mode for the 6D trail.
 *
 * Treat the trail's segment tangents as a vector field, and let a
 * swarm of secondary particles flow through it. Visually: a "wake"
 * of glowing particles that follow the path the audio has just
 * traced, with each particle picking up the local direction at
 * whichever trail frame it's currently nearest.
 *
 * This is more expensive than the other modes — there is no closed-
 * form per-frame update — but stays performant for ~250 particles
 * over ~6000 trail frames thanks to two simplifications:
 *
 *   (1) Each particle is *anchored* to a deterministic trail frame
 *       (chosen at spawn time as a function of the particle index).
 *       The advection direction comes from that anchor frame's local
 *       tangent, *not* from a full nearest-neighbour search every
 *       tick. Particles never wander far from their anchors because
 *       they get re-spawned with new anchors after `lifetime` ticks.
 *
 *   (2) Tangents are computed from the precomputed FrameMap (no
 *       extra geometry crunching per useFrame).
 *
 * Render path: a single InstancedMesh of additive billboards (the
 * smoke gaussian) — visually similar to Smoke mode but with very
 * different motion semantics (no static cluster around frames; the
 * particles *flow*).
 */

// Total particle pool. Higher = denser wake, lower = clearer flow.
const DEFAULT_PARTICLE_COUNT = 240;

export function FlowfieldTrail({
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

  const particleCount = Math.max(
    32,
    Math.min(800, viz.flowfieldParticles ?? DEFAULT_PARTICLE_COUNT)
  );

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

  // Per-particle dynamic state — recomputed each useFrame tick.
  // Keep in TypedArrays so we never allocate inside the hot loop.
  const particleState = useMemo(() => {
    return {
      positions: new Float32Array(particleCount * 3),
      velocities: new Float32Array(particleCount * 3),
      ages: new Float32Array(particleCount),
      anchorIndex: new Int32Array(particleCount),
      seedOffsets: new Float32Array(particleCount * 3)
    };
  }, [particleCount]);

  // Static seed offsets per particle (so respawn is deterministic).
  useEffect(() => {
    let seed = 0xfa_55_b0_3d;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
    for (let i = 0; i < particleCount; i++) {
      // Random unit-cube offset in [-1, +1]^3 used at every respawn.
      particleState.seedOffsets[3 * i] = rand() * 2 - 1;
      particleState.seedOffsets[3 * i + 1] = rand() * 2 - 1;
      particleState.seedOffsets[3 * i + 2] = rand() * 2 - 1;
      // Initial age is randomised so particles don't all respawn on
      // the same frame.
      particleState.ages[i] = rand();
      particleState.anchorIndex[i] = -1;
    }
  }, [particleCount, particleState]);

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
    () => new THREE.InstancedBufferAttribute(new Float32Array(particleCount * 4), 4),
    [particleCount]
  );
  const instanceSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(particleCount), 1),
    [particleCount]
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
  }, [instanceRgba, instanceSize, particleCount]);

  // User-tunable parameters
  const speed = viz.flowfieldSpeed ?? 0.35;
  const lifetime = Math.max(0.3, viz.flowfieldLifetime ?? 2.5); // seconds
  const lifetimeFrames = lifetime / hopSeconds;

  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;
    const { cursor, start } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );
    if (cursor < 0) return;

    const visibleCount = Math.max(1, cursor - start + 1);
    const rgbaArr = instanceRgba.array as Float32Array;
    const sizeArr = instanceSize.array as Float32Array;

    // dt approximation: assume a steady-ish 30 fps render. We don't
    // strictly need wall-clock time because the audio cursor itself
    // drives the visible state — `ages` measure logical-frames-elapsed.
    const dt = 1.0 / 30;

    for (let i = 0; i < particleCount; i++) {
      // Increment age (in *seconds* of wall clock).
      particleState.ages[i] += dt;
      let anchor = particleState.anchorIndex[i];

      // (Re)spawn condition — first tick, or particle aged out, or
      // anchor fell off the visibility window.
      const tooOld = particleState.ages[i] > lifetime;
      const anchorMissing = anchor < start || anchor > cursor;
      if (anchor < 0 || tooOld || anchorMissing) {
        // Pick a new anchor inside the visible window. Use a stable
        // hash of the particle index + a phase that advances slowly
        // so the swarm isn't all anchored to the same frame.
        const phase = (i * 0.6180339 + cursor * 0.013) % 1;
        anchor = start + Math.floor(phase * visibleCount);
        anchor = Math.min(cursor, Math.max(start, anchor));
        particleState.anchorIndex[i] = anchor;
        particleState.ages[i] = 0;

        // Initial position = anchor centre + small seed offset.
        const ax = frames.positions[3 * anchor];
        const ay = frames.positions[3 * anchor + 1];
        const az = frames.positions[3 * anchor + 2];
        const ox = particleState.seedOffsets[3 * i] * 0.05;
        const oy = particleState.seedOffsets[3 * i + 1] * 0.05;
        const oz = particleState.seedOffsets[3 * i + 2] * 0.05;
        particleState.positions[3 * i] = ax + ox;
        particleState.positions[3 * i + 1] = ay + oy;
        particleState.positions[3 * i + 2] = az + oz;
        particleState.velocities[3 * i] = 0;
        particleState.velocities[3 * i + 1] = 0;
        particleState.velocities[3 * i + 2] = 0;
      }

      // Tangent at the anchor frame: vector to the next frame, or to
      // the previous if the anchor is at the cursor.
      const a = particleState.anchorIndex[i];
      const aNext = a < cursor ? a + 1 : Math.max(start, a - 1);
      const tx = frames.positions[3 * aNext] - frames.positions[3 * a];
      const ty = frames.positions[3 * aNext + 1] - frames.positions[3 * a + 1];
      const tz = frames.positions[3 * aNext + 2] - frames.positions[3 * a + 2];
      const tlen = Math.sqrt(tx * tx + ty * ty + tz * tz) + 1e-6;
      const tnx = tx / tlen;
      const tny = ty / tlen;
      const tnz = tz / tlen;

      // Smoothly blend the particle's velocity toward the tangent.
      const blend = 0.18;
      particleState.velocities[3 * i] =
        particleState.velocities[3 * i] * (1 - blend) + tnx * speed * blend;
      particleState.velocities[3 * i + 1] =
        particleState.velocities[3 * i + 1] * (1 - blend) + tny * speed * blend;
      particleState.velocities[3 * i + 2] =
        particleState.velocities[3 * i + 2] * (1 - blend) + tnz * speed * blend;

      // Advect position.
      particleState.positions[3 * i] += particleState.velocities[3 * i] * dt;
      particleState.positions[3 * i + 1] += particleState.velocities[3 * i + 1] * dt;
      particleState.positions[3 * i + 2] += particleState.velocities[3 * i + 2] * dt;

      const px = particleState.positions[3 * i];
      const py = particleState.positions[3 * i + 1];
      const pz = particleState.positions[3 * i + 2];
      matrixObj.position.set(px, py, pz);
      matrixObj.scale.setScalar(1);
      matrixObj.updateMatrix();
      inst.setMatrixAt(i, matrixObj.matrix);

      // Colour from the anchor frame's colour. Alpha lifecycle:
      //   fade in fast (0..0.15 of lifetime), hold, fade out (0.7..1).
      const lifeNorm = particleState.ages[i] / lifetime;
      let alpha: number;
      if (lifeNorm < 0.15) alpha = lifeNorm / 0.15;
      else if (lifeNorm > 0.7) alpha = (1 - lifeNorm) / 0.3;
      else alpha = 1;
      alpha = Math.max(0, Math.min(1, alpha));
      const cr = frames.colors[3 * a];
      const cg = frames.colors[3 * a + 1];
      const cb = frames.colors[3 * a + 2];
      rgbaArr[4 * i] = cr;
      rgbaArr[4 * i + 1] = cg;
      rgbaArr[4 * i + 2] = cb;
      rgbaArr[4 * i + 3] = alpha * 0.6;
      sizeArr[i] = frames.sizes[a] * 0.5;
    }

    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;
    instanceSize.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef as any}
      args={[undefined as any, material as any, particleCount]}
      frustumCulled={false}
    >
      <planeGeometry args={[2, 2]} />
    </instancedMesh>
  );
}
