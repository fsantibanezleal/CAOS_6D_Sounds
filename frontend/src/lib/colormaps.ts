/**
 * Perceptually-uniform colormaps used by the 6D visualization.
 *
 * Each colormap is sampled at 16 evenly spaced control points (RGB in
 * [0, 1]) and interpolated linearly at lookup time. Sources:
 * - viridis / magma / plasma / inferno / cividis: matplotlib default LUTs
 *   (BSD-compatible — see https://github.com/matplotlib/matplotlib/blob/main/LICENSE)
 * - turbo: Mikko's "Turbo" — Apache 2.0 (Google Research)
 * - rdbu: ColorBrewer "RdBu" diverging palette (Cynthia Brewer, Apache 2.0)
 *
 * Storing 16 stops keeps the bundle tiny; visual quality is indistinguishable
 * from the full 256-stop tables for the size of marker we use.
 */

export type ColormapName =
  | "viridis"
  | "magma"
  | "plasma"
  | "inferno"
  | "cividis"
  | "turbo"
  | "rdbu";

export const COLORMAP_NAMES: ColormapName[] = [
  "viridis",
  "magma",
  "plasma",
  "inferno",
  "cividis",
  "turbo",
  "rdbu"
];

type RGB = [number, number, number];

const VIRIDIS: RGB[] = [
  [0.267, 0.005, 0.329],
  [0.283, 0.131, 0.449],
  [0.262, 0.243, 0.521],
  [0.220, 0.343, 0.549],
  [0.177, 0.438, 0.557],
  [0.143, 0.522, 0.553],
  [0.120, 0.607, 0.534],
  [0.166, 0.691, 0.497],
  [0.290, 0.770, 0.428],
  [0.464, 0.832, 0.330],
  [0.661, 0.870, 0.213],
  [0.864, 0.895, 0.104],
  [0.986, 0.906, 0.144],
  [0.991, 0.745, 0.137],
  [0.987, 0.519, 0.119],
  [0.981, 0.282, 0.097]
];

const MAGMA: RGB[] = [
  [0.001, 0.000, 0.014],
  [0.063, 0.046, 0.181],
  [0.143, 0.080, 0.379],
  [0.244, 0.091, 0.500],
  [0.346, 0.107, 0.529],
  [0.444, 0.122, 0.534],
  [0.541, 0.139, 0.530],
  [0.637, 0.156, 0.521],
  [0.734, 0.176, 0.502],
  [0.825, 0.211, 0.471],
  [0.901, 0.276, 0.430],
  [0.957, 0.367, 0.385],
  [0.985, 0.475, 0.345],
  [0.995, 0.601, 0.339],
  [0.992, 0.737, 0.388],
  [0.987, 0.991, 0.749]
];

const PLASMA: RGB[] = [
  [0.050, 0.029, 0.528],
  [0.183, 0.011, 0.599],
  [0.295, 0.005, 0.633],
  [0.404, 0.017, 0.643],
  [0.508, 0.058, 0.629],
  [0.604, 0.110, 0.598],
  [0.692, 0.165, 0.564],
  [0.770, 0.224, 0.524],
  [0.836, 0.288, 0.483],
  [0.892, 0.357, 0.442],
  [0.937, 0.435, 0.401],
  [0.969, 0.520, 0.359],
  [0.987, 0.611, 0.318],
  [0.992, 0.711, 0.282],
  [0.985, 0.819, 0.262],
  [0.940, 0.975, 0.131]
];

const INFERNO: RGB[] = [
  [0.001, 0.000, 0.014],
  [0.064, 0.043, 0.149],
  [0.156, 0.044, 0.298],
  [0.260, 0.040, 0.408],
  [0.359, 0.071, 0.432],
  [0.455, 0.105, 0.426],
  [0.551, 0.135, 0.405],
  [0.646, 0.169, 0.371],
  [0.738, 0.211, 0.327],
  [0.821, 0.265, 0.276],
  [0.890, 0.336, 0.226],
  [0.940, 0.426, 0.179],
  [0.970, 0.535, 0.139],
  [0.984, 0.654, 0.116],
  [0.978, 0.776, 0.180],
  [0.988, 0.998, 0.645]
];

const CIVIDIS: RGB[] = [
  [0.000, 0.135, 0.305],
  [0.020, 0.183, 0.402],
  [0.087, 0.236, 0.435],
  [0.182, 0.286, 0.430],
  [0.262, 0.336, 0.421],
  [0.330, 0.385, 0.420],
  [0.395, 0.435, 0.430],
  [0.460, 0.485, 0.444],
  [0.527, 0.535, 0.452],
  [0.598, 0.585, 0.452],
  [0.671, 0.637, 0.444],
  [0.749, 0.689, 0.428],
  [0.829, 0.741, 0.404],
  [0.910, 0.797, 0.368],
  [0.961, 0.864, 0.290],
  [0.995, 0.925, 0.157]
];

const TURBO: RGB[] = [
  [0.190, 0.072, 0.232],
  [0.262, 0.249, 0.529],
  [0.241, 0.412, 0.785],
  [0.156, 0.564, 0.901],
  [0.098, 0.704, 0.870],
  [0.140, 0.820, 0.732],
  [0.300, 0.916, 0.560],
  [0.503, 0.964, 0.392],
  [0.703, 0.973, 0.250],
  [0.852, 0.929, 0.170],
  [0.951, 0.840, 0.131],
  [0.985, 0.717, 0.118],
  [0.962, 0.575, 0.116],
  [0.881, 0.418, 0.117],
  [0.749, 0.252, 0.110],
  [0.581, 0.105, 0.096]
];

const RDBU: RGB[] = [
  [0.404, 0.000, 0.122],
  [0.553, 0.085, 0.157],
  [0.698, 0.145, 0.181],
  [0.776, 0.255, 0.247],
  [0.839, 0.420, 0.353],
  [0.898, 0.580, 0.439],
  [0.937, 0.704, 0.553],
  [0.965, 0.812, 0.671],
  [0.969, 0.882, 0.851],
  [0.852, 0.918, 0.945],
  [0.708, 0.851, 0.929],
  [0.557, 0.773, 0.871],
  [0.408, 0.671, 0.812],
  [0.282, 0.561, 0.745],
  [0.180, 0.443, 0.671],
  [0.020, 0.188, 0.380]
];

const TABLES: Record<ColormapName, RGB[]> = {
  viridis: VIRIDIS,
  magma: MAGMA,
  plasma: PLASMA,
  inferno: INFERNO,
  cividis: CIVIDIS,
  turbo: TURBO,
  rdbu: RDBU
};

/**
 * Look up a colormap value at `t` in [0, 1]. Out-of-range values are
 * clamped. Returns RGB as 3 floats in [0, 1].
 */
export function sampleColormap(name: ColormapName, t: number): RGB {
  const table = TABLES[name];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (table.length - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(table.length - 1, i0 + 1);
  const f = scaled - i0;
  const a = table[i0];
  const b = table[i1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f
  ];
}

/** Build a CSS linear-gradient string for previewing a colormap. */
export function colormapCss(name: ColormapName, stops = 9): string {
  const table = TABLES[name];
  const out: string[] = [];
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1);
    const [r, g, b] = sampleColormap(name, t);
    const pct = Math.round(t * 100);
    out.push(
      `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}) ${pct}%`
    );
  }
  return `linear-gradient(to right, ${out.join(", ")})`;
}
