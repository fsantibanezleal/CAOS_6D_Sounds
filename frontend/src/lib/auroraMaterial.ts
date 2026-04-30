/**
 * Aurora material — vertical ribbon with a soft alpha gradient and a
 * gentle horizontal sine wobble.
 *
 * Each instance is a thin vertical quad. The vertex shader applies the
 * wobble (driven by a deterministic per-frame phase, NOT wall-clock
 * time, so scrubbing the audio replays the same animation). The
 * fragment shader fades alpha smoothly from the bottom (full) to the
 * top (zero) so the ribbon dissolves upward like an aurora.
 *
 * Renders with additive blending so overlapping ribbons brighten — a
 * dense cluster of close frames produces a luminous "curtain".
 */
import * as THREE from "three";

const AURORA_VERT = /* glsl */ `
  attribute vec4 instanceRgba;
  attribute float instanceHeight;
  attribute float instancePhase;

  varying vec4 vColor;
  varying float vY;

  uniform float uWobbleAmplitude;

  void main() {
    vColor = instanceRgba;
    // PlaneGeometry positions are centred: x in [-w/2, w/2], y in [-h/2, h/2].
    // Map y from [-0.5, +0.5] to [0, 1] so the base of the ribbon sits at
    // the frame centre and the top is stretched by instanceHeight.
    float yNorm = position.y + 0.5;
    vY = yNorm;

    // Read the instance translation from the 4th column of
    // (modelViewMatrix * instanceMatrix). Then add the local quad
    // offset in view space — that camera-aligns the horizontal axis
    // while keeping the ribbon vertical (y stays world-up).
    mat4 mvi = modelViewMatrix * instanceMatrix;
    vec3 viewCenter = mvi[3].xyz;

    // Deterministic per-frame horizontal sway; bottom = no sway, top = max.
    float sway = sin(instancePhase + yNorm * 6.28318) * uWobbleAmplitude * yNorm;

    viewCenter.x += position.x + sway;
    viewCenter.y += yNorm * instanceHeight;
    gl_Position = projectionMatrix * vec4(viewCenter, 1.0);
  }
`;

const AURORA_FRAG = /* glsl */ `
  precision highp float;
  varying vec4 vColor;
  varying float vY;

  void main() {
    // Soft horizontal edge (we use a thin quad, so the alpha is mostly
    // governed by the y gradient — vY == 0 at base, 1 at top).
    float vertical = 1.0 - vY;        // bright at bottom, fade at top
    float curve = pow(vertical, 1.4); // accentuate the falloff
    float a = vColor.a * curve;
    if (a < 0.005) discard;
    gl_FragColor = vec4(vColor.rgb * a, a);
  }
`;

export function makeAuroraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: AURORA_VERT,
    fragmentShader: AURORA_FRAG,
    uniforms: {
      uWobbleAmplitude: { value: 0.06 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}
