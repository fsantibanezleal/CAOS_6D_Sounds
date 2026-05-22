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
 * Constellation render mode for the 6D trail.
 *
 * Minimal "graph" aesthetic — small bright nodes (additive billboards
 * with a soft halo) connected by thin glowing edges. Looks like a
 * constellation map of the audio's path.
 *
 * The nodes are *much* smaller than in Spheres mode and use additive
 * blending with a gaussian texture so each node has a halo. The edges
 * are a single `THREE.Line` with `vertexColors + vertexAlphas + AdditiveBlending`
 * so overlapping segments brighten naturally.
 *
 * Per-frame node alpha pulses subtly with a sine wave (driven by the
 * frame index, NOT wall-clock time, so scrubbing the audio shows
 * deterministic pulsation).
 */

export function ConstellationTrail({
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
  const lineGeomRef = useRef<THREE.BufferGeometry>(null);
  const matrixObj = useMemo(() => new THREE.Object3D(), []);

  // Reuse the smoke gaussian texture + material. The "halo" effect comes
  // for free because the material is additive and the gaussian fades to
  // transparent at the edge.
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

  // Build the per-frame static map (position + colour + size).
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
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames * 4), 4),
    [numFrames]
  );
  const instanceSize = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames), 1),
    [numFrames]
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
  }, [instanceRgba, instanceSize, numFrames]);

  // Edge geometry: one entry per visible frame, plus the cursor itself
  // forms a continuous polyline. We allocate the maximum buffer
  // (numFrames vertices) and use setDrawRange.
  useEffect(() => {
    const geo = lineGeomRef.current;
    if (!geo) return;
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(numFrames * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(numFrames * 4), 4)
    );
    geo.setDrawRange(0, 0);
  }, [numFrames]);

  const nodeScale = viz.constellationNodeScale;
  const edgeAlpha = viz.constellationEdgeAlpha;

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
    const sizeArr = instanceSize.array as Float32Array;

    for (let i = 0; i < numFrames; i++) {
      const visible = i >= start && i <= cursor;
      if (!visible) {
        matrixObj.position.set(0, 0, 0);
        matrixObj.scale.setScalar(0.0001);
        matrixObj.updateMatrix();
        inst.setMatrixAt(i, matrixObj.matrix);
        rgbaArr[4 * i + 3] = 0;
        sizeArr[i] = 0;
        continue;
      }
      const px = frames.positions[3 * i];
      const py = frames.positions[3 * i + 1];
      const pz = frames.positions[3 * i + 2];
      // Constellation nodes are deliberately tiny — nodeScale runs ~0.2..1.5
      // applied on top of the user's sphereMin/Max. The gaussian texture
      // gives them a soft halo that reads as a glowing star.
      const baseSize = frames.sizes[i] * nodeScale;
      // Pulsate subtly using a sine of the frame index — deterministic,
      // so scrubbing back replays the same pulse pattern.
      const pulse = 1 + 0.15 * Math.sin(i * 0.8 + cursor * 0.05);
      const ageFrames = cursor - i;
      const alpha = 1 - ageFrames / Math.max(1, trailFrames);

      matrixObj.position.set(px, py, pz);
      matrixObj.scale.setScalar(1);
      matrixObj.updateMatrix();
      inst.setMatrixAt(i, matrixObj.matrix);

      rgbaArr[4 * i] = frames.colors[3 * i];
      rgbaArr[4 * i + 1] = frames.colors[3 * i + 1];
      rgbaArr[4 * i + 2] = frames.colors[3 * i + 2];
      rgbaArr[4 * i + 3] = alpha;
      sizeArr[i] = baseSize * pulse;
    }
    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;
    instanceSize.needsUpdate = true;

    // Edges (continuous polyline through the visible frames).
    const geo = lineGeomRef.current;
    if (geo) {
      const positionAttr = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
      const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
      // Attributes are attached lazily inside a useEffect; on the very
      // first useFrame tick they may not yet exist. Bail out cleanly
      // instead of crashing the render loop.
      if (!positionAttr || !colorAttr) {
        return;
      }
      let drawCount = 0;
      for (let i = start; i <= cursor; i++) {
        positionAttr.setXYZ(
          drawCount,
          frames.positions[3 * i],
          frames.positions[3 * i + 1],
          frames.positions[3 * i + 2]
        );
        const ageFrames = cursor - i;
        const alpha = 1 - ageFrames / Math.max(1, trailFrames);
        colorAttr.setXYZW(
          drawCount,
          frames.colors[3 * i],
          frames.colors[3 * i + 1],
          frames.colors[3 * i + 2],
          alpha * edgeAlpha
        );
        drawCount++;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geo.setDrawRange(0, drawCount);
    }
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef as any}
        args={[undefined as any, material as any, numFrames]}
        frustumCulled={false}
      >
        <planeGeometry args={[2, 2]} />
      </instancedMesh>
      <line>
        <bufferGeometry ref={lineGeomRef as any} />
        <lineBasicMaterial
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          {...({ vertexAlphas: true } as any)}
        />
      </line>
    </group>
  );
}
