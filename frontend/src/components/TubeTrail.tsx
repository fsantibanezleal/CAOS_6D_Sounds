import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { buildFrameMap, computeWindow } from "../lib/frameMap";
import { useStore } from "../store/useStore";

/**
 * Tube ribbon render mode — a thick, camera-aligned strip along the
 * trail.
 *
 * Implementation: a triangle strip with two vertices per audio frame
 * (top + bottom of the ribbon). Per useFrame we compute, for each
 * frame in the visibility window:
 *
 *   1. the centre point in world space (from the FrameMap)
 *   2. the segment direction (vector to the next frame)
 *   3. the perpendicular direction in *screen space* (cross product
 *      of the segment direction with the camera's view axis), so the
 *      ribbon always faces the camera
 *   4. top   = centre + perp * halfWidth
 *      bottom = centre - perp * halfWidth
 *      where halfWidth = frame.size * tubeWidth (user slider)
 *
 * Per-vertex RGBA carries the colour + age-fade alpha. The shader is
 * stock `meshBasicMaterial` with `vertexColors + vertexAlphas +
 * transparent + depthWrite=false`.
 *
 * Index buffer: numFrames triangles forming a strip, two triangles per
 * segment between consecutive frames (i, i+1).
 */

export function TubeTrail({
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
  const { camera } = useThree();

  const meshRef = useRef<THREE.Mesh>(null);
  const geomRef = useRef<THREE.BufferGeometry>(null);

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

  // 2 vertices per frame; 6 indices per segment (= 2 triangles).
  // (numFrames - 1) segments. Pre-allocate full buffers; setDrawRange
  // controls how much of them is rendered each tick.
  useEffect(() => {
    const geo = geomRef.current;
    if (!geo) return;

    const numVerts = numFrames * 2;
    const numIndices = Math.max(0, (numFrames - 1) * 6);

    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(numVerts * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(numVerts * 4), 4)
    );

    const indices = new Uint32Array(numIndices);
    for (let i = 0; i < numFrames - 1; i++) {
      const top0 = i * 2;
      const bot0 = i * 2 + 1;
      const top1 = (i + 1) * 2;
      const bot1 = (i + 1) * 2 + 1;
      const j = i * 6;
      // First triangle: top0, bot0, top1
      indices[j] = top0;
      indices[j + 1] = bot0;
      indices[j + 2] = top1;
      // Second triangle: bot0, bot1, top1
      indices[j + 3] = bot0;
      indices[j + 4] = bot1;
      indices[j + 5] = top1;
    }
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.setDrawRange(0, 0);
  }, [numFrames]);

  const widthScale = viz.tubeWidth;

  useFrame(() => {
    const geo = geomRef.current;
    if (!geo) return;
    const positionAttr = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
    const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!positionAttr || !colorAttr) return;

    const { cursor, start, trailFrames } = computeWindow(
      currentTime,
      hopSeconds,
      viz.trailSeconds,
      numFrames
    );

    // Camera view direction in world space (normalised). Used to
    // project perpendicular ribbon offsets into the plane facing the
    // camera, so the ribbon always reads as a flat strip rather than
    // becoming edge-on and disappearing.
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    const perp = new THREE.Vector3();
    const segDir = new THREE.Vector3();

    let drawSegments = 0; // counted segments rendered (= drawCount / 6)
    const visibleCount = Math.max(0, cursor - start + 1);

    for (let i = 0; i < visibleCount; i++) {
      const frameIndex = start + i;
      const cx = frames.positions[3 * frameIndex];
      const cy = frames.positions[3 * frameIndex + 1];
      const cz = frames.positions[3 * frameIndex + 2];

      // Segment direction: vector to the next visible frame, or to the
      // previous one for the last visible frame.
      let nextIndex = frameIndex + 1;
      if (nextIndex > cursor) nextIndex = Math.max(start, frameIndex - 1);
      const nx = frames.positions[3 * nextIndex];
      const ny = frames.positions[3 * nextIndex + 1];
      const nz = frames.positions[3 * nextIndex + 2];
      segDir.set(nx - cx, ny - cy, nz - cz);
      const segLen = segDir.length();
      if (segLen < 1e-6) {
        // Degenerate segment (consecutive frames at the same point) —
        // pick an arbitrary perpendicular.
        segDir.set(1, 0, 0);
      } else {
        segDir.divideScalar(segLen);
      }

      // perp = camDir x segDir, then normalised. This points across the
      // ribbon, perpendicular to both the segment direction and the
      // line from the camera to the strip — i.e. the ribbon's "width"
      // axis in screen space.
      perp.copy(camDir).cross(segDir);
      const perpLen = perp.length();
      if (perpLen < 1e-6) {
        // Camera looking along the segment — choose any perpendicular.
        perp.set(0, 1, 0);
      } else {
        perp.divideScalar(perpLen);
      }
      const halfWidth = frames.sizes[frameIndex] * widthScale * 0.5;

      const topX = cx + perp.x * halfWidth;
      const topY = cy + perp.y * halfWidth;
      const topZ = cz + perp.z * halfWidth;
      const botX = cx - perp.x * halfWidth;
      const botY = cy - perp.y * halfWidth;
      const botZ = cz - perp.z * halfWidth;

      const v0 = i * 2;
      const v1 = v0 + 1;
      positionAttr.setXYZ(v0, topX, topY, topZ);
      positionAttr.setXYZ(v1, botX, botY, botZ);

      const ageFrames = cursor - frameIndex;
      const alpha = 1 - ageFrames / Math.max(1, trailFrames);
      const cr = frames.colors[3 * frameIndex];
      const cg = frames.colors[3 * frameIndex + 1];
      const cb = frames.colors[3 * frameIndex + 2];
      colorAttr.setXYZW(v0, cr, cg, cb, alpha);
      colorAttr.setXYZW(v1, cr, cg, cb, alpha);
    }

    drawSegments = Math.max(0, visibleCount - 1);
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    // Render `drawSegments * 6` indices (2 triangles per segment).
    geo.setDrawRange(0, drawSegments * 6);
  });

  return (
    <mesh ref={meshRef as any}>
      <bufferGeometry ref={geomRef as any} />
      {/* Double-sided so the ribbon is visible from any camera angle. */}
      <meshBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        {...({ vertexAlphas: true } as any)}
      />
    </mesh>
  );
}
