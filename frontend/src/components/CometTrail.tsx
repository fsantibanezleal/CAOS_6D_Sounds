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
 * Comet render mode for the 6D trail.
 *
 * One bright "head" billboard at the cursor position, plus a series of
 * smaller / dimmer billboards along the trail behind it. Both layers
 * use the same gaussian-textured additive material so the head reads
 * as a glowing nucleus and the tail dissolves smoothly.
 *
 * Two InstancedMesh:
 *  - Trail mesh: `numFrames` billboards (one per frame) positioned at
 *    the frame centre with size that decays sharply with age.
 *  - Head mesh: a single oversized billboard at the cursor frame.
 *
 * The "stretched" feel is achieved by making the trail head about
 * `headScale` (default 5x) bigger than the tail head. A user slider
 * controls how aggressive the size falloff along the trail is.
 */

export function CometTrail({
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

  const trailMeshRef = useRef<THREE.InstancedMesh>(null);
  const headMeshRef = useRef<THREE.InstancedMesh>(null);
  const matrixObj = useMemo(() => new THREE.Object3D(), []);

  const sharedMaterial = useMemo(() => {
    const tex = makeGaussianTexture(64);
    return makeSmokeMaterial(tex);
  }, []);
  // Head and trail can share the same material since both use additive
  // gaussian billboards. The size differentiation comes from
  // `instanceSize` per instance.
  useEffect(
    () => () => {
      const map = (sharedMaterial.uniforms.uMap.value as THREE.DataTexture | null) ?? null;
      sharedMaterial.dispose();
      if (map) map.dispose();
    },
    [sharedMaterial]
  );

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

  // Trail attributes
  const trailRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames * 4), 4),
    [numFrames]
  );
  const trailSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames), 1),
    [numFrames]
  );
  // Head: just 1 instance.
  const headRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(4), 4),
    []
  );
  const headSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(1), 1),
    []
  );
  useEffect(() => {
    trailRgba.setUsage(THREE.DynamicDrawUsage);
    trailSize.setUsage(THREE.DynamicDrawUsage);
    headRgba.setUsage(THREE.DynamicDrawUsage);
    headSize.setUsage(THREE.DynamicDrawUsage);
  }, [trailRgba, trailSize, headRgba, headSize]);

  useEffect(() => {
    const trailInst = trailMeshRef.current;
    const headInst = headMeshRef.current;
    if (!trailInst || !headInst) return;
    trailInst.geometry.setAttribute("instanceRgba", trailRgba);
    trailInst.geometry.setAttribute("instanceSize", trailSize);
    headInst.geometry.setAttribute("instanceRgba", headRgba);
    headInst.geometry.setAttribute("instanceSize", headSize);
    return () => {
      trailInst.geometry.deleteAttribute("instanceRgba");
      trailInst.geometry.deleteAttribute("instanceSize");
      headInst.geometry.deleteAttribute("instanceRgba");
      headInst.geometry.deleteAttribute("instanceSize");
    };
  }, [trailRgba, trailSize, headRgba, headSize, numFrames]);

  const headScale = viz.cometHeadScale;
  const tailDecay = viz.cometTailDecay;

  useFrame(() => {
    const trailInst = trailMeshRef.current;
    const headInst = headMeshRef.current;
    if (!trailInst || !headInst) return;

    const { cursor, start, trailFrames } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );

    const trailRgbaArr = trailRgba.array as Float32Array;
    const trailSizeArr = trailSize.array as Float32Array;

    for (let i = 0; i < numFrames; i++) {
      const visible = i >= start && i <= cursor;
      if (!visible) {
        matrixObj.position.set(0, 0, 0);
        matrixObj.scale.setScalar(0.0001);
        matrixObj.updateMatrix();
        trailInst.setMatrixAt(i, matrixObj.matrix);
        trailRgbaArr[4 * i + 3] = 0;
        trailSizeArr[i] = 0;
        continue;
      }
      const px = frames.positions[3 * i];
      const py = frames.positions[3 * i + 1];
      const pz = frames.positions[3 * i + 2];
      const ageFrames = cursor - i;
      // Sharper-than-linear decay along the trail (controlled by
      // `cometTailDecay`); higher values = tail dies off faster.
      const ageNorm = ageFrames / Math.max(1, trailFrames);
      const alpha = Math.pow(1 - ageNorm, tailDecay);
      // Trail blob size shrinks toward the tail.
      const sizeNow = frames.sizes[i] * (0.4 + 0.6 * alpha);

      matrixObj.position.set(px, py, pz);
      matrixObj.scale.setScalar(1);
      matrixObj.updateMatrix();
      trailInst.setMatrixAt(i, matrixObj.matrix);

      trailRgbaArr[4 * i] = frames.colors[3 * i];
      trailRgbaArr[4 * i + 1] = frames.colors[3 * i + 1];
      trailRgbaArr[4 * i + 2] = frames.colors[3 * i + 2];
      trailRgbaArr[4 * i + 3] = alpha;
      trailSizeArr[i] = sizeNow;
    }
    trailInst.instanceMatrix.needsUpdate = true;
    trailRgba.needsUpdate = true;
    trailSize.needsUpdate = true;

    // Head: single oversized billboard at the cursor frame.
    const cx = frames.positions[3 * cursor];
    const cy = frames.positions[3 * cursor + 1];
    const cz = frames.positions[3 * cursor + 2];
    const cr = frames.colors[3 * cursor];
    const cg = frames.colors[3 * cursor + 1];
    const cb = frames.colors[3 * cursor + 2];
    const headRgbaArr = headRgba.array as Float32Array;
    const headSizeArr = headSize.array as Float32Array;
    matrixObj.position.set(cx, cy, cz);
    matrixObj.scale.setScalar(1);
    matrixObj.updateMatrix();
    headInst.setMatrixAt(0, matrixObj.matrix);
    headRgbaArr[0] = cr;
    headRgbaArr[1] = cg;
    headRgbaArr[2] = cb;
    headRgbaArr[3] = 1.0;
    headSizeArr[0] = frames.sizes[cursor] * headScale;
    headInst.instanceMatrix.needsUpdate = true;
    headRgba.needsUpdate = true;
    headSize.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={trailMeshRef as any}
        args={[undefined as any, sharedMaterial as any, numFrames]}
        frustumCulled={false}
      >
        <planeGeometry args={[2, 2]} />
      </instancedMesh>
      <instancedMesh
        ref={headMeshRef as any}
        args={[undefined as any, sharedMaterial as any, 1]}
        frustumCulled={false}
      >
        <planeGeometry args={[2, 2]} />
      </instancedMesh>
    </group>
  );
}
