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
 * - Spheres: a single InstancedMesh of N spheres rendered with a custom
 *   ShaderMaterial that reads a per-instance RGBA attribute. This gives
 *   us *real* per-instance transparency (Three.js's stock instanceColor
 *   is RGB-only).
 * - Trail line: a single Line mesh with a 4-component (RGBA) color
 *   attribute and `vertexAlphas` enabled on the lineBasicMaterial, so
 *   each vertex of the trail can fade out independently.
 * - Per-frame useFrame writes the active visibility window only (fast
 *   even at 6 000+ frames).
 */

const AXIS_HALF = 1.5; // world units → embedding values in [0,1] map to [-1.5, 1.5]
const MIN_TRAIL_FRAMES = 8;

export function Visualization6D() {
  return (
    <div className="viz-canvas" style={{ height: "100%" }}>
      <Canvas
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          // Required to grab a non-blank PNG via canvas.toBlob() — by default
          // R3F clears the drawing buffer right after the frame is composited.
          preserveDrawingBuffer: true
        }}
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
  const comparisonEmbedding = useStore((s) => s.comparisonEmbedding);
  const showAxes = viz.showAxes;
  const showGrid = viz.showGrid;

  const trackValues = useMemo(() => {
    if (!embedding) return null;
    const tr = embedding.tracks.find((t) => t.name === viz.trackName);
    if (!tr) return null;
    return tr;
  }, [embedding, viz.trackName]);

  const comparisonTrackValues = useMemo(() => {
    if (!comparisonEmbedding) return null;
    const tr = comparisonEmbedding.tracks.find((t) => t.name === viz.trackName);
    if (!tr) return null;
    return tr;
  }, [comparisonEmbedding, viz.trackName]);

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

      {comparisonEmbedding && comparisonTrackValues && (
        <Trail6D
          key={"cmp-" + comparisonEmbedding.id}
          values={comparisonTrackValues.values}
          numFrames={comparisonEmbedding.num_frames}
          hopSeconds={comparisonEmbedding.hop_seconds}
          mode="silhouette"
        />
      )}

      {embedding && trackValues && (
        <Trail6D
          key={"primary-" + embedding.id}
          values={trackValues.values}
          numFrames={embedding.num_frames}
          hopSeconds={embedding.hop_seconds}
          mode="animated"
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
      <CameraReset />
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

// --------------------------------------------------------------------------- //
// Custom material that reads per-instance RGBA from a custom attribute,       //
// instead of Three.js's stock RGB-only instanceColor mechanism.               //
// --------------------------------------------------------------------------- //

const SPHERE_VERT = /* glsl */ `
  attribute vec4 instanceRgba;
  varying vec4 vColor;
  varying vec3 vNormal;

  void main() {
    vColor = instanceRgba;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SPHERE_FRAG = /* glsl */ `
  precision highp float;
  varying vec4 vColor;
  varying vec3 vNormal;

  void main() {
    // Cheap directional shading so the sphere doesn't read flat.
    vec3 lightDir = normalize(vec3(0.4, 0.7, 0.6));
    float ndl = max(dot(normalize(vNormal), lightDir), 0.0);
    float light = 0.55 + 0.45 * ndl;
    vec3 rgb = vColor.rgb * light;
    if (vColor.a < 0.005) discard;
    gl_FragColor = vec4(rgb, vColor.a);
  }
`;

function makeSphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SPHERE_VERT,
    fragmentShader: SPHERE_FRAG,
    transparent: true,
    depthWrite: false
  });
}

/**
 * Core 6D trail. Renders an instanced sphere per frame plus a thin line
 * connecting consecutive frames. Each useFrame tick updates the
 * play-position window: instances inside the window are visible with
 * decreasing alpha from front to tail; instances outside are hidden.
 */
type TrailMode = "animated" | "silhouette";

function Trail6D({
  values,
  numFrames,
  hopSeconds,
  mode = "animated"
}: {
  values: number[][];
  numFrames: number;
  hopSeconds: number;
  mode?: TrailMode;
}) {
  const viz = useStore((s) => s.viz);
  const currentTime = useStore((s) => s.currentTime);
  const isSilhouette = mode === "silhouette";
  const SILHOUETTE_ALPHA = 0.18;
  const SILHOUETTE_SIZE_SCALE = 0.55;

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lineGeomRef = useRef<THREE.BufferGeometry>(null);
  const sphereMaterial = useMemo(() => makeSphereMaterial(), []);

  // Reusable scratch matrix.
  const matrixObj = useMemo(() => new THREE.Object3D(), []);

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

  // Allocate per-instance RGBA attribute and per-vertex RGBA line buffer
  // each time the frame count changes. Both are written every useFrame
  // tick on the active visibility window.
  const instanceRgba = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(numFrames * 4), 4),
    [numFrames]
  );
  useEffect(() => {
    instanceRgba.setUsage(THREE.DynamicDrawUsage);
  }, [instanceRgba]);

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
      new THREE.BufferAttribute(new Float32Array(numFrames * 4), 4)
    );
    geo.setDrawRange(0, 0);
  }, [numFrames]);

  // Attach the custom RGBA attribute once the InstancedMesh's geometry
  // is available. Three.js needs `instanceRgba` recognized as an
  // *instanced* attribute, not a per-vertex one.
  useEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    inst.geometry.setAttribute("instanceRgba", instanceRgba);
    return () => {
      inst.geometry.deleteAttribute("instanceRgba");
    };
  }, [instanceRgba, numFrames]);

  // Per-frame update.
  useFrame(() => {
    const inst = meshRef.current;
    if (!inst) return;

    const rgbaArr = instanceRgba.array as Float32Array;
    const geo = lineGeomRef.current;

    if (isSilhouette) {
      // Static "ghost" rendering: every frame is shown, with a constant
      // low alpha. Useful as a comparison overlay behind the animated
      // primary clip.
      for (let i = 0; i < numFrames; i++) {
        const px = frames.positions[3 * i];
        const py = frames.positions[3 * i + 1];
        const pz = frames.positions[3 * i + 2];
        const s = frames.sizes[i] * SILHOUETTE_SIZE_SCALE;
        matrixObj.position.set(px, py, pz);
        matrixObj.scale.setScalar(s);
        matrixObj.updateMatrix();
        inst.setMatrixAt(i, matrixObj.matrix);
        rgbaArr[4 * i] = frames.colors[3 * i];
        rgbaArr[4 * i + 1] = frames.colors[3 * i + 1];
        rgbaArr[4 * i + 2] = frames.colors[3 * i + 2];
        rgbaArr[4 * i + 3] = SILHOUETTE_ALPHA;
      }
      inst.instanceMatrix.needsUpdate = true;
      instanceRgba.needsUpdate = true;

      if (geo && viz.showTrailLine) {
        const positionAttr = geo.getAttribute("position") as THREE.BufferAttribute;
        const colorAttr = geo.getAttribute("color") as THREE.BufferAttribute;
        for (let i = 0; i < numFrames; i++) {
          positionAttr.setXYZ(
            i,
            frames.positions[3 * i],
            frames.positions[3 * i + 1],
            frames.positions[3 * i + 2]
          );
          colorAttr.setXYZW(
            i,
            frames.colors[3 * i],
            frames.colors[3 * i + 1],
            frames.colors[3 * i + 2],
            SILHOUETTE_ALPHA * 0.7
          );
        }
        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        geo.setDrawRange(0, numFrames);
      } else if (geo) {
        geo.setDrawRange(0, 0);
      }
      return;
    }

    // Animated mode: only the active visibility window is drawn.
    const trailFrames = Math.max(
      MIN_TRAIL_FRAMES,
      Math.round(viz.trailSeconds / hopSeconds)
    );
    const cursor = Math.min(numFrames - 1, Math.floor(currentTime / hopSeconds));
    const start = Math.max(0, cursor - trailFrames + 1);

    for (let i = 0; i < numFrames; i++) {
      if (i < start || i > cursor) {
        matrixObj.position.set(0, 0, 0);
        matrixObj.scale.setScalar(0.0001);
        matrixObj.updateMatrix();
        inst.setMatrixAt(i, matrixObj.matrix);
        rgbaArr[4 * i + 3] = 0;
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

      const age = (cursor - i) / Math.max(1, trailFrames);
      const alpha = 1 - age;
      rgbaArr[4 * i] = frames.colors[3 * i];
      rgbaArr[4 * i + 1] = frames.colors[3 * i + 1];
      rgbaArr[4 * i + 2] = frames.colors[3 * i + 2];
      rgbaArr[4 * i + 3] = alpha;
    }
    inst.instanceMatrix.needsUpdate = true;
    instanceRgba.needsUpdate = true;

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
        colorAttr.setXYZW(
          drawCount,
          frames.colors[3 * i],
          frames.colors[3 * i + 1],
          frames.colors[3 * i + 2],
          alpha
        );
        drawCount++;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geo.setDrawRange(0, drawCount);
    } else if (geo) {
      geo.setDrawRange(0, 0);
    }
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef as any}
        args={[undefined as any, sphereMaterial as any, numFrames]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 16, 16]} />
      </instancedMesh>

      {viz.showTrailLine && (
        <line>
          <bufferGeometry ref={lineGeomRef as any} />
          {/* 4-component vertex colors + vertexAlphas = real per-vertex alpha.
              `vertexAlphas` is not declared on R3F's typed LineBasicMaterial
              props, so we set it via the spread cast — Three.js reads it at
              runtime from material.vertexAlphas. */}
          <lineBasicMaterial
            vertexColors
            transparent
            depthWrite={false}
            {...({ vertexAlphas: true } as any)}
          />
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
