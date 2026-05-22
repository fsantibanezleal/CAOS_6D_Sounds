import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { makeAuroraMaterial } from "../lib/auroraMaterial";
import { buildFrameMap, computeWindow } from "../lib/frameMap";
import { useStore } from "../store/useStore";

/**
 * Aurora curtains render mode.
 *
 * Each frame in the visibility window is drawn as a thin vertical
 * ribbon rising from its 6D-mapped position toward +y. The custom
 * `auroraMaterial` shades each ribbon with a fade-to-transparent
 * gradient and applies a deterministic horizontal sway that depends
 * on the local height — so the top of each ribbon sways more than
 * the base, like real auroral curtains.
 *
 * Per-frame attributes:
 *   - instance position = ribbon base (the frame's xyz)
 *   - instanceRgba = colour + age-decayed alpha
 *   - instanceHeight = ribbon vertical length, modulated by the size axis
 *   - instancePhase = deterministic sway phase derived from frame index
 */

export function AuroraTrail({
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

  const material = useMemo(() => makeAuroraMaterial(), []);
  useEffect(
    () => () => {
      material.dispose();
    },
    [material]
  );
  useEffect(() => {
    material.uniforms.uWobbleAmplitude.value = viz.auroraWobble;
  }, [material, viz.auroraWobble]);

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

  // Per-frame static attributes — height and sway phase. Re-rolled when
  // numFrames changes.
  const phases = useMemo(() => {
    let seed = 0xa0_0c_3a_99;
    function rand(): number {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    }
    const arr = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) arr[i] = rand() * Math.PI * 2;
    return arr;
  }, [numFrames]);

  const instanceRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames * 4), 4),
    [numFrames]
  );
  const instanceHeight = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames), 1),
    [numFrames]
  );
  const instancePhase = useMemo(
    () => new THREE.InstancedBufferAttribute(phases, 1),
    [phases]
  );
  useEffect(() => {
    instanceRgba.setUsage(THREE.DynamicDrawUsage);
    instanceHeight.setUsage(THREE.DynamicDrawUsage);
    instancePhase.setUsage(THREE.StaticDrawUsage);
  }, [instanceRgba, instanceHeight, instancePhase]);

  useEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    inst.geometry.setAttribute("instanceRgba", instanceRgba);
    inst.geometry.setAttribute("instanceHeight", instanceHeight);
    inst.geometry.setAttribute("instancePhase", instancePhase);
    return () => {
      inst.geometry.deleteAttribute("instanceRgba");
      inst.geometry.deleteAttribute("instanceHeight");
      inst.geometry.deleteAttribute("instancePhase");
    };
  }, [instanceRgba, instanceHeight, instancePhase, numFrames]);

  const heightScale = viz.auroraHeight;

  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;
    const { cursor, start, trailFrames } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );
    const rgbaArr = instanceRgba.array as Float32Array;
    const hArr = instanceHeight.array as Float32Array;

    for (let i = 0; i < numFrames; i++) {
      const visible = i >= start && i <= cursor;
      if (!visible) {
        matrixObj.position.set(0, 0, 0);
        matrixObj.scale.setScalar(0.0001);
        matrixObj.updateMatrix();
        inst.setMatrixAt(i, matrixObj.matrix);
        rgbaArr[4 * i + 3] = 0;
        hArr[i] = 0;
        continue;
      }
      const px = frames.positions[3 * i];
      const py = frames.positions[3 * i + 1];
      const pz = frames.positions[3 * i + 2];
      // Anchor the ribbon base at the frame position.
      matrixObj.position.set(px, py, pz);
      matrixObj.scale.setScalar(1);
      matrixObj.updateMatrix();
      inst.setMatrixAt(i, matrixObj.matrix);

      const ageFrames = cursor - i;
      const alpha = 1 - ageFrames / Math.max(1, trailFrames);
      // Curtain height is driven by the size axis (mapped via sphereMin/Max)
      // times the user's heightScale slider.
      hArr[i] = frames.sizes[i] * heightScale * 6.0;

      rgbaArr[4 * i] = frames.colors[3 * i];
      rgbaArr[4 * i + 1] = frames.colors[3 * i + 1];
      rgbaArr[4 * i + 2] = frames.colors[3 * i + 2];
      rgbaArr[4 * i + 3] = alpha;
    }
    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;
    instanceHeight.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef as any}
      args={[undefined as any, material as any, numFrames]}
      frustumCulled={false}
    >
      {/* PlaneGeometry — width = thin ribbon (constant), height = 1.
          The shader normalises the local y from [-0.5, +0.5] to [0, 1]
          and then multiplies by `instanceHeight`, so the base sits at
          the instance translation and the top stretches upward. */}
      <planeGeometry args={[0.04, 1, 1, 1]} />
    </instancedMesh>
  );
}
