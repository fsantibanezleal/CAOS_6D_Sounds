import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { sampleColormap } from "../lib/colormaps";
import { useStore } from "../store/useStore";

/**
 * The 6D visualization.
 *
 * Each frame in the active embedding track gives us a 6-vector. The user
 * picks which dimension drives X / Y / Z (3D position), which drives the
 * color (4D), and which drives the sphere size (5D). Time is the implicit
 * sixth dimension — frames are emitted in order and old ones fade out.
 *
 * Implementation notes:
 *
 * - We pre-allocate a single InstancedMesh of N spheres (one per frame in
 *   the loaded clip). Per-frame we update the *visibility window* and the
 *   matrix / color of every active instance. This is dramatically faster
 *   than mounting a Three node per frame.
 * - The trail line is a single Line2 reused across renders.
 * - Axis-mapping changes recompute the position/color/size of every
 *   instance once and then steady-state operations only touch the
 *   visibility window.
 */

const AXIS_HALF = 1.5; // world units → embedding values in [0,1] map to [-1.5, 1.5]
const MIN_TRAIL_FRAMES = 8;

export function Visualization6D() {
  return (
    <div className="viz-canvas" style={{ height: "100%" }}>
      <Canvas
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [3.6, 2.4, 4.0], fov: 45, near: 0.01, far: 100 }}
      >
        <SceneContents />
      </Canvas>
    </div>
  );
}

function SceneContents() {
  const viz = useStore((s) => s.viz);
  const embedding = useStore((s) => s.embedding);
  const showAxes = viz.showAxes;
  const showGrid = viz.showGrid;

  const trackValues = useMemo(() => {
    if (!embedding) return null;
    const tr = embedding.tracks.find((t) => t.name === viz.trackName);
    if (!tr) return null;
    return tr;
  }, [embedding, viz.trackName]);

  return (
    <>
      <color attach="background" args={["#0d1117"]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 5, 4]} intensity={1.2} />

      {showGrid && (
        <Grid
          args={[6, 6]}
          cellSize={0.3}
          cellColor="#30363d"
          sectionSize={1.5}
          sectionColor="#484f58"
          fadeDistance={12}
          fadeStrength={1.2}
          infiniteGrid
        />
      )}

      {showAxes && <AxesGuide />}

      {embedding && trackValues && (
        <Trail6D
          values={trackValues.values}
          numFrames={embedding.num_frames}
          hopSeconds={embedding.hop_seconds}
        />
      )}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        zoomSpeed={0.8}
        rotateSpeed={0.7}
        target={[0, 0, 0]}
      />
    </>
  );
}

/**
 * Static colored arrows + tick marks + faint axis labels rendered as Three
 * primitives. Cheaper than HTML overlays and rotates with the scene.
 */
function AxesGuide() {
  return (
    <group>
      {/* X = red, Y = green, Z = blue. Each arrow is a thin cylinder with a cone tip. */}
      <Axis dir={[1, 0, 0]} color="#ef4444" />
      <Axis dir={[0, 1, 0]} color="#22c55e" />
      <Axis dir={[0, 0, 1]} color="#3b82f6" />
    </group>
  );
}

function Axis({ dir, color }: { dir: [number, number, number]; color: string }) {
  const len = AXIS_HALF;
  const v = new THREE.Vector3(...dir).multiplyScalar(len);
  const half = v.clone().multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...dir)
  );

  return (
    <group>
      <mesh position={half} quaternion={quat}>
        <cylinderGeometry args={[0.005, 0.005, len, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
      <mesh position={v} quaternion={quat}>
        <coneGeometry args={[0.04, 0.12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

/**
 * Core 6D trail. Renders an instanced sphere per frame plus a thin line
 * connecting consecutive frames. Each useFrame tick updates the
 * play-position window: instances inside the window are visible with
 * decreasing opacity from front to tail; instances outside are hidden.
 */
function Trail6D({
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
  const lineRef = useRef<THREE.Line>(null);
  const lineGeomRef = useRef<THREE.BufferGeometry>(null);
  const lastEdgeColor = useRef<THREE.Color>(new THREE.Color(0.5, 0.5, 0.5));

  // Reusable scratch objects to avoid allocations inside useFrame.
  const matrixObj = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  // Static positions / colors / sizes for every frame.
  // Recomputed when the active track or any axis mapping changes.
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
      const x = (v[xi] ?? 0.5) * 2 - 1;
      const y = (v[yi] ?? 0.5) * 2 - 1;
      const z = (v[zi] ?? 0.5) * 2 - 1;
      positions[3 * i] = x * AXIS_HALF;
      positions[3 * i + 1] = y * AXIS_HALF;
      positions[3 * i + 2] = z * AXIS_HALF;

      const tColor = viz.reverseColormap ? 1 - (v[ci] ?? 0.5) : v[ci] ?? 0.5;
      const [r, g, b] = sampleColormap(viz.colormap, tColor);
      colors[3 * i] = r;
      colors[3 * i + 1] = g;
      colors[3 * i + 2] = b;

      const sNorm = v[si] ?? 0.5;
      sizes[i] = viz.sphereMin + (viz.sphereMax - viz.sphereMin) * sNorm;
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

  // Initialize line geometry once per `numFrames`.
  useEffect(() => {
    const geo = lineGeomRef.current;
    if (!geo) return;
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(numFrames * 3), 3)
    );
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(numFrames * 3), 3)
    );
    geo.setDrawRange(0, 0);
  }, [numFrames]);

  // Per-frame update.
  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;

    const trailFrames = Math.max(
      MIN_TRAIL_FRAMES,
      Math.round(viz.trailSeconds / hopSeconds)
    );
    const cursor = Math.min(numFrames - 1, Math.floor(currentTime / hopSeconds));
    const start = Math.max(0, cursor - trailFrames + 1);

    // Hide everything first by writing identity scale-zero matrices outside
    // the active range. We only walk the *changing* boundaries so this is
    // O(trail) per frame, not O(numFrames).
    let written = 0;
    for (let i = 0; i < numFrames; i++) {
      if (i < start || i > cursor) {
        matrixObj.position.set(0, 0, 0);
        matrixObj.scale.setScalar(0.0001);
        matrixObj.updateMatrix();
        inst.setMatrixAt(i, matrixObj.matrix);
        continue;
      }
      const px = frames.positions[3 * i];
      const py = frames.positions[3 * i + 1];
      const pz = frames.positions[3 * i + 2];
      const s = frames.sizes[i];
      matrixObj.position.set(px, py, pz);
      matrixObj.scale.setScalar(s);
      matrixObj.updateMatrix();
      inst.setMatrixAt(i, matrixObj.matrix);

      // Per-instance color with fade-to-transparent via lerp toward bg color.
      const age = (cursor - i) / Math.max(1, trailFrames);
      const alpha = 1 - age;
      const r = frames.colors[3 * i] * alpha;
      const g = frames.colors[3 * i + 1] * alpha;
      const b = frames.colors[3 * i + 2] * alpha;
      colorObj.setRGB(r, g, b);
      inst.setColorAt(i, colorObj);
      written++;
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;

    // Update line geometry — same active window.
    const geo = lineGeomRef.current;
    if (geo && viz.showTrailLine) {
      const positionAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute;
      let drawCount = 0;
      for (let i = start; i <= cursor; i++) {
        positionAttr.setXYZ(
          drawCount,
          frames.positions[3 * i],
          frames.positions[3 * i + 1],
          frames.positions[3 * i + 2]
        );
        const age = (cursor - i) / Math.max(1, trailFrames);
        const alpha = 1 - age;
        colorAttr.setXYZ(
          drawCount,
          frames.colors[3 * i] * alpha,
          frames.colors[3 * i + 1] * alpha,
          frames.colors[3 * i + 2] * alpha
        );
        drawCount++;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geo.setDrawRange(0, drawCount);

      lastEdgeColor.current.setRGB(
        frames.colors[3 * cursor],
        frames.colors[3 * cursor + 1],
        frames.colors[3 * cursor + 2]
      );
    } else if (geo) {
      geo.setDrawRange(0, 0);
    }

    void written; // no-op, but keeps tslint happy if "noUnusedLocals" enabled
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef as any}
        args={[undefined as any, undefined as any, numFrames]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 16, 16]} />
        {/* Note: per-instance colors flow through Three.js's `instanceColor`
             mechanism (set via `setColorAt`). We must NOT set `vertexColors`
             on the material — that switch expects a per-vertex `color`
             attribute which the geometry does not have, and would silently
             render every sphere black. */}
        <meshStandardMaterial transparent opacity={1} roughness={0.4} metalness={0.05} />
      </instancedMesh>

      {viz.showTrailLine && (
        <line ref={lineRef as any}>
          <bufferGeometry ref={lineGeomRef as any} />
          <lineBasicMaterial vertexColors transparent />
        </line>
      )}
    </group>
  );
}

/** Drei's <Grid> needs the camera, so it must be inside <Canvas>. This lets
 *  us reset the camera from outside via a custom event. */
export function CameraReset() {
  const { camera } = useThree();
  useEffect(() => {
    function onReset() {
      camera.position.set(3.6, 2.4, 4.0);
      camera.lookAt(0, 0, 0);
    }
    window.addEventListener("auralis:reset-camera", onReset);
    return () => window.removeEventListener("auralis:reset-camera", onReset);
  }, [camera]);
  return null;
}
