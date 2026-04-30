/**
 * Smoke render mode — billboarded particle clouds with additive blending.
 *
 * Each frame in the active visibility window emits a small *cluster* of
 * camera-aligned quads, each textured with a soft gaussian blob. The
 * quads are blended additively so overlapping puffs visually merge,
 * creating the illusion of coloured smoke. Per-instance alpha decays
 * with age so the trail dissolves toward the tail.
 *
 * No depth-write means transparent fragments composite cleanly without
 * z-fighting against the grid / axes / polyline.
 *
 * The shader receives:
 *  - `instanceMatrix` — Three.js's per-instance transform. We only use
 *    the translation column (drift + base position); rotation is locked
 *    to camera space inside the vertex shader.
 *  - `instanceRgba` (custom vec4) — colour + age-decayed alpha
 *  - `instanceSize` (custom float) — blob radius in world units.
 *
 * The base geometry is a unit quad (PlaneGeometry(2, 2) = corners in
 * [-1, +1] × [-1, +1]).
 */
import * as THREE from "three";

/** Generate a 64×64 RGBA gaussian blob texture once on init. */
export function makeGaussianTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const center = size / 2;
  const sigma = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const d2 = dx * dx + dy * dy;
      const v = Math.exp(-d2 / (2 * sigma * sigma));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(v * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const SMOKE_VERT = /* glsl */ `
  attribute vec4 instanceRgba;
  attribute float instanceSize;

  varying vec4 vColor;
  varying vec2 vUv;

  void main() {
    vColor = instanceRgba;
    vUv = uv;

    // The instance's world centre is the translation column of
    // (modelViewMatrix * instanceMatrix). We then displace this view-
    // space centre by the quad's local xy offset (multiplied by
    // instanceSize), which gives a perfectly camera-aligned billboard.
    mat4 mvi = modelViewMatrix * instanceMatrix;
    vec3 viewCenter = mvi[3].xyz;
    viewCenter.xy += position.xy * instanceSize;
    gl_Position = projectionMatrix * vec4(viewCenter, 1.0);
  }
`;

const SMOKE_FRAG = /* glsl */ `
  precision highp float;
  varying vec4 vColor;
  varying vec2 vUv;
  uniform sampler2D uMap;

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float a = vColor.a * tex.a;
    if (a < 0.005) discard;
    // Pre-multiply the colour by alpha so additive blending stays
    // colour-correct without saturating to white too quickly.
    gl_FragColor = vec4(vColor.rgb * a, a);
  }
`;

export function makeSmokeMaterial(map: THREE.DataTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    uniforms: {
      uMap: { value: map }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}
