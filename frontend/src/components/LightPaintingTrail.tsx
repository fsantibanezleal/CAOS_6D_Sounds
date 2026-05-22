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
 * Light-painting render mode — long-exposure photography in 3D.
 *
 * Differs from the existing modes in three deliberate ways:
 *
 *  1. **The whole path stays visible**, from frame 0 to the cursor, like
 *     a slow-shutter exposure. Galaxy also keeps everything visible, but
 *     as star clusters; here the trail is a continuous line that
 *     accumulates in 3D space.
 *  2. **Additive blending + multiple jittered passes** give pixels where
 *     the trail revisits itself a brighter glow than passes that only
 *     touch them once. The user sees *time density* — slow phrases
 *     glow more than fast ones.
 *  3. **The cursor's recent vicinity is brightest** (alpha = 1) and the
 *     rest of the path tapers to a steady minimum so the whole route
 *     stays painted but the "active brush" reads as a hot tip.
 *
 * Implementation: a single Line of (numFrames - 1) segments with per-
 * vertex RGBA + vertexAlphas + additive blending, plus a stack of
 * billboarded "head" glows at the cursor position to reinforce the
 * write-head. Cheap — one Line + one InstancedMesh.
 */

const HEAD_GLOW_COUNT = 5; // overlapping billboards at the cursor for halo

export function LightPaintingTrail({
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

  const lineGeomRef = useRef<THREE.BufferGeometry>(null);
  const headMeshRef = useRef<THREE.InstancedMesh>(null);
  const matrixObj = useMemo(() => new THREE.Object3D(), []);

  const headMaterial = useMemo(() => {
    const tex = makeGaussianTexture(64);
    return makeSmokeMaterial(tex);
  }, []);
  useEffect(
    () => () => {
      const map = (headMaterial.uniforms.uMap.value as THREE.DataTexture | null) ?? null;
      headMaterial.dispose();
      if (map) map.dispose();
    },
    [headMaterial]
  );

  const headInstanceRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(HEAD_GLOW_COUNT * 4), 4),
    []
  );
  const headInstanceSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(HEAD_GLOW_COUNT), 1),
    []
  );
  useEffect(() => {
    headInstanceRgba.setUsage(THREE.DynamicDrawUsage);
    headInstanceSize.setUsage(THREE.DynamicDrawUsage);
  }, [headInstanceRgba, headInstanceSize]);
  useEffect(() => {
    const inst = headMeshRef.current;
    if (!inst) return;
    inst.geometry.setAttribute("instanceRgba", headInstanceRgba);
    inst.geometry.setAttribute("instanceSize", headInstanceSize);
    return () => {
      inst.geometry.deleteAttribute("instanceRgba");
      inst.geometry.deleteAttribute("instanceSize");
    };
  }, [headInstanceRgba, headInstanceSize]);

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

  // Pre-allocate position + colour buffers once. Positions are set
  // directly from the FrameMap (no per-tick recompute); only colours +
  // alphas change each tick to track the cursor.
  useEffect(() => {
    const geo = lineGeomRef.current;
    if (!geo) return;
    const positions = new Float32Array(numFrames * 3);
    for (let i = 0; i < numFrames; i++) {
      positions[3 * i] = frames.positions[3 * i];
      positions[3 * i + 1] = frames.positions[3 * i + 1];
      positions[3 * i + 2] = frames.positions[3 * i + 2];
    }
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(numFrames * 4), 4)
    );
    geo.setDrawRange(0, 0);
  }, [numFrames, frames]);

  useFrame(() => {
    const geo = lineGeomRef.current;
    const headInst = headMeshRef.current;
    if (!geo || !headInst) return;
    const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!colorAttr) return;

    const { cursor, trailFrames } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );

    const colArr = colorAttr.array as Float32Array;

    // Light-painting tuning: the whole path keeps a floor of 0.15
    // (always visible), the recent `trailFrames` window decays from
    // 1.0 at the cursor down to that floor. Future frames (i > cursor)
    // are hidden by drawRange so they don't render at all.
    const FLOOR_ALPHA = 0.15;
    const visibleEnd = Math.min(numFrames, cursor + 1);
    for (let i = 0; i < visibleEnd; i++) {
      const distFromCursor = cursor - i;
      let alpha: number;
      if (distFromCursor <= 0) {
        alpha = 1;
      } else if (distFromCursor <= trailFrames) {
        // Linear fade from 1.0 at cursor to FLOOR_ALPHA at trail end.
        alpha = 1 - (distFromCursor / trailFrames) * (1 - FLOOR_ALPHA);
      } else {
        alpha = FLOOR_ALPHA;
      }
      const cr = frames.colors[3 * i];
      const cg = frames.colors[3 * i + 1];
      const cb = frames.colors[3 * i + 2];
      colArr[4 * i] = cr;
      colArr[4 * i + 1] = cg;
      colArr[4 * i + 2] = cb;
      colArr[4 * i + 3] = alpha;
    }
    colorAttr.needsUpdate = true;
    geo.setDrawRange(0, visibleEnd);

    // Head glow — 5 overlapping additive billboards at the cursor.
    if (cursor >= 0) {
      const hx = frames.positions[3 * cursor];
      const hy = frames.positions[3 * cursor + 1];
      const hz = frames.positions[3 * cursor + 2];
      const hr = frames.colors[3 * cursor];
      const hg = frames.colors[3 * cursor + 1];
      const hb = frames.colors[3 * cursor + 2];
      const baseSize = frames.sizes[cursor] * 4;
      const rgbaArr = headInstanceRgba.array as Float32Array;
      const sizeArr = headInstanceSize.array as Float32Array;
      for (let k = 0; k < HEAD_GLOW_COUNT; k++) {
        // Each successive billboard is larger + dimmer — a halo.
        const t = k / Math.max(1, HEAD_GLOW_COUNT - 1);
        matrixObj.position.set(hx, hy, hz);
        matrixObj.scale.setScalar(1);
        matrixObj.updateMatrix();
        headInst.setMatrixAt(k, matrixObj.matrix);
        rgbaArr[4 * k] = hr;
        rgbaArr[4 * k + 1] = hg;
        rgbaArr[4 * k + 2] = hb;
        rgbaArr[4 * k + 3] = (1 - t) * 0.6;
        sizeArr[k] = baseSize * (1 + t * 1.8);
      }
      headInst.instanceMatrix.needsUpdate = true;
      headInstanceRgba.needsUpdate = true;
      headInstanceSize.needsUpdate = true;
      headInst.count = HEAD_GLOW_COUNT;
    } else {
      headInst.count = 0;
    }
  });

  return (
    <group>
      <line>
        <bufferGeometry ref={lineGeomRef} />
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          {...({ vertexAlphas: true } as Record<string, unknown>)}
        />
      </line>
      <instancedMesh
        ref={headMeshRef}
        args={[undefined, headMaterial, HEAD_GLOW_COUNT]}
        frustumCulled={false}
      >
        <planeGeometry args={[2, 2]} />
      </instancedMesh>
    </group>
  );
}
