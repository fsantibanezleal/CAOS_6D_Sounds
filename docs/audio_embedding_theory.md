# Audio embedding theory

This document is a self-contained primer on the math behind Auralis. It
explains, in order:

1. The frame-level features we extract.
2. The three projections we fit (PCA, t-SNE, UMAP).
3. How the 6D representation is mapped onto a 3D scene with color and size.

## 1. Frame-level features

Audio is sampled at `f_s = 22050 Hz`, framed at `W = 0.10 s` windows with
hop `H = 0.05 s` (50 % overlap, 20 fps). For each frame `i` we compute:

### 1.1 Time-domain scalars

* **RMS energy**

  $$
  \mathrm{RMS}_i = \sqrt{\frac{1}{N} \sum_{n=0}^{N-1} x_i[n]^2}
  $$

* **Zero-crossing rate (ZCR)** — fraction of consecutive sample pairs
  with opposite signs. High for noisy / unvoiced sounds, low for
  pure tones.

  $$
  \mathrm{ZCR}_i = \frac{1}{N-1} \sum_{n=1}^{N-1} \mathbb{1}\!\left[x_i[n-1] x_i[n] < 0\right]
  $$

### 1.2 Spectral scalars

For frame `i` the magnitude spectrum is `S_i[k] = |STFT|`. Let `f[k]` be
the centre frequency of bin `k`.

* **Spectral centroid** — the spectrum's "center of mass":

  $$
  C_i = \frac{\sum_k f[k] \, S_i[k]}{\sum_k S_i[k]}
  $$

* **Spectral rolloff (85 %)** — the frequency below which 85 % of the
  spectral energy is contained.

  $$
  R_i = \min\left\{ f_r : \sum_{k:f[k] \le f_r} S_i[k]^2 \ge 0.85 \sum_k S_i[k]^2 \right\}
  $$

* **Spectral bandwidth** — second moment about the centroid.

  $$
  B_i = \sqrt{\frac{\sum_k (f[k] - C_i)^2 \, S_i[k]}{\sum_k S_i[k]}}
  $$

* **Spectral flatness (Wiener entropy)** — geometric mean over arithmetic
  mean. Close to 1 for white-noise-like spectra, close to 0 for tonal.

  $$
  F_i = \frac{\exp\!\left(\frac{1}{K} \sum_k \log S_i[k]\right)}{\frac{1}{K} \sum_k S_i[k]}
  $$

* **Spectral contrast** — average peak-to-valley ratio across log-spaced
  sub-bands; captures harmonic vs. noisy texture.

### 1.3 Pitch features

We use `librosa.piptrack`, which finds peak interpolations of the magnitude
spectrum. For frame `i` we keep the bin index with the largest magnitude as
**dominant pitch** (Hz) and the (normalized) magnitude itself as
**pitch confidence**.

### 1.4 Rhythmic / textural

* **Onset strength** — half-rectified spectral flux summed across bands.
* **Tempo proxy** — rolling standard deviation of onset strength over an
  8-frame window. Coarse but cheap rhythmic indicator without committing
  to a global BPM.

### 1.5 MFCCs

Thirteen Mel-Frequency Cepstral Coefficients per frame. MFCCs are the
classic compact representation of speech/music timbre (Logan 2000); we
use them as the input to PCA / t-SNE / UMAP.

The matrix `X` of shape `(num_frames, 13)` is the input to the
non-linear projections below.

## 2. Six-dimensional projections

Three projections are fit on the **concatenated** MFCC matrix across all
clips, then split back per clip. Concatenation matters: it puts
recordings in a common embedding so the user can compare them visually.

### 2.1 PCA

Principal Component Analysis solves

$$
\max_{w \in \mathbb{R}^d, \|w\|=1} \mathrm{Var}(X w)
$$

iteratively for the top six directions. The solution is the SVD of the
centered `X`. Each new component is orthogonal to the previous and
captures the next-largest variance direction.

**Strengths**: fast, deterministic, linearly invertible, preserves
global structure. **Weaknesses**: cannot unwrap non-linear manifolds.

### 2.2 t-SNE

t-Distributed Stochastic Neighbor Embedding (van der Maaten & Hinton,
2008) defines pairwise probabilities

$$
p_{j|i} = \frac{\exp(-\|x_i - x_j\|^2 / 2\sigma_i^2)}{\sum_{k \ne i} \exp(-\|x_i - x_k\|^2 / 2\sigma_i^2)}
$$

in the original space and matches them to a heavy-tailed Student-t
distribution `q` in the projected space by minimizing the
Kullback-Leibler divergence

$$
\mathrm{KL}(P \| Q) = \sum_{i \ne j} p_{ij} \log \frac{p_{ij}}{q_{ij}}.
$$

We run it twice with different perplexities (one local, one global)
and stack the two 3D embeddings to form a 6D vector. Doing two
3D fits is dramatically cheaper than one 6D fit and exposes both local
clusters and broader structure.

**Strengths**: separates local clusters cleanly. **Weaknesses**: slow,
sensitive to perplexity, distances between clusters are not meaningful.

### 2.3 UMAP

Uniform Manifold Approximation and Projection (McInnes, Healy & Melville,
2018) frames dimensionality reduction as building a fuzzy simplicial set
in the input space and then optimizing a low-dimensional fuzzy graph to
match it via cross-entropy:

$$
\mathcal{L} = \sum_{e \in E} w_e \log \frac{w_e}{\hat{w}_e} + (1 - w_e) \log \frac{1 - w_e}{1 - \hat{w}_e}
$$

UMAP is much faster than t-SNE on medium corpora (10 000–100 000 frames),
preserves global topology better, and supports out-of-sample inference.

**Strengths**: fast, smooth global geometry, supports arbitrary `n_components`
including 6 directly. **Weaknesses**: slightly more parameters to tune
(`n_neighbors`, `min_dist`).

## 3. Mapping 6D → 3D + color + size

Auralis lets the user assign each of the six dimensions to one of five
roles:

| Role | Use |
| --- | --- |
| X | World x-position |
| Y | World y-position |
| Z | World z-position |
| Color | Look up value in a perceptually-uniform colormap (viridis / magma / plasma / inferno / cividis / turbo / RdBu) |
| Size | Sphere radius, lerped between `sphereMin` and `sphereMax` |

Time is the implicit 6th axis: frames are emitted in order with hop
`H = 0.05 s`. Past frames remain visible with linearly decreasing alpha
over a user-controlled window (`trailSeconds`); a polyline connects them
in time order, colored by the most recent frame.

Each axis value is in `[0, 1]` (min-max normalized per dimension during
pipeline stage 5). The frontend rescales to world space:

$$
\mathrm{world}_x = (v_x \cdot 2 - 1) \cdot R, \quad R = 1.5
$$

so embeddings live inside the unit cube `[-1.5, 1.5]^3`.

## References

See [references.md](references.md) for the full bibliography.
