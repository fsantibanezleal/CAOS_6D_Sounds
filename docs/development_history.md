# Development history

Newest-first log of the design decisions that shaped Auralis. Each entry
records what changed, why, and the alternative we considered.

## v0.2.0 — library + UX expansion (2026-04-30)

**Library tripled.** Curation list grew from ~17 verified Wikimedia
entries to ~50, organized by category + new subcategory tag. Each clip
ships with a sidecar ``<id>.meta.json`` that the manifest builder reads
back. Total uncompressed audio ≈ 100 MB, every individual clip ≤ 24 MB.

**Selector redesign.** The flat list under "Sound library" was
unworkable past ~15 clips. New layout:

* Collapsible categories (▶ / ▼ caret) with per-category counts.
* Subcategory groups inside each category (e.g. birds → songbirds /
  raptors / waterfowl).
* Search expands all matching categories automatically.
* Sort by title or duration.
* "Expand all" / "Collapse all" toolbar.
* License badge per clip (CC, PD, ...).

**More features.** Per-frame roster grew from 12 to 18:

* spectral entropy
* energy in 4 octave-spaced sub-bands (low / mid-low / mid-high / high)
* harmonic-percussive ratio (via librosa HPSS)

Plus two new clip-level scalars:

* tempo (BPM, librosa estimator on onset envelope)
* key (Krumhansl–Schmuckler estimator on mean chroma — pitch class + mode)

The frontend's live-features panel now shows tempo + key alongside the
per-frame readouts.

**Snapshot export.** A single button on the control panel calls
``canvas.toBlob()`` to download the current 6D viz frame as a timestamped
PNG. Required ``preserveDrawingBuffer:true`` on the WebGL context — without
it the buffer is cleared after compositing and the export is blank.

**Schema bump.** Per-clip embedding JSON now carries a ``clip_level``
object (tempo + key). Manifest schema gains ``subcategory`` per clip.
Both fields are optional in the frontend types so older manifests still
parse.

## v0.1.x — post-launch sweep (2026-04)

See PRs #2..#9. Highlights:
- #2 instance colors render black bug (vertexColors flag)
- #3 audio loop default + real per-instance/vertex transparency
- #4 production bundle split via Rollup manualChunks
- #5 cross-clip overlay (silhouette comparison)
- #7 CREPE-based pitch tracker (optional, 440 Hz on pure-tone validated)
- #8 YAMNet deep embeddings (4th 6D track via TF Hub; replaced OpenL3
  which is incompatible with Python 3.12)

## v0.1.0 — initial public release (2026-04)

**Scope.** Working FastAPI backend, React/Three.js SPA, Python data
pipeline, eight synthetic seed clips, full ES/EN i18n, light/dark theme,
seven colormaps, three projection methods (PCA / t-SNE / UMAP) plus an
interpretable "features" track, deploy templates for Hetzner.

**Architectural decision: split offline pipeline + thin runtime.**
Running `librosa` + `scikit-learn` + `umap-learn` on the production VPS
would inflate the venv from ~30 MB to ~1.4 GB and add second-of-cold-start
latency. Embeddings are deterministic (PCA / t-SNE / UMAP are seeded), so
we precompute once and ship JSON.

> Considered: live re-projection on the server. Rejected because it adds
> CPU pressure on a 3.7 GiB box already running 16 services, and the
> output is identical for a given input.

**Stack: FastAPI + Vite + Three.js (R3F).** Reference repos in this
account were `CAOS_WEB_Finn_Forecasts` (FastAPI + Jinja) and
`CAOS_WEB_UnderMineRisk` (Next.js). The 6D visualization needs declarative
scene-graph code at 60 fps on a clip with thousands of frames; that is
much cleaner with `@react-three/fiber` than with Jinja + plain Three.js.
The backend stays simple (FastAPI mounts `frontend/dist`), so we get the
React power without the Next.js footprint.

> Considered: Plotly's 3D scatter. Rejected — it does not gracefully
> handle 6 000+ markers with per-frame re-coloring and per-frame
> visibility windows.

**Six-dimensional axis mapping.** Felipe's specification: "let the user
pick which dim goes to X / Y / Z, which to color, which to size, with
time as the implicit 6th axis." The data pipeline therefore emits
`(num_frames, 6)` per track and the user picks the mapping at runtime.

> Considered: hardwiring D1=X, D2=Y, ... D6=size. Rejected — the most
> *interesting* axes vary per clip.

**Per-axis normalization.** Min-max to `[0, 1]` per dimension means
clips from different categories share the same world cube and are
visually comparable. Standardization (z-score) was tested but produced
unbounded outliers that needed clamping anyway.

**t-SNE in 3+3 instead of 6.** scikit-learn's `barnes_hut` (default)
caps `n_components` at 3. Two 3D fits with different perplexities is
~2x faster than one 6D `exact` fit and surfaces both local + global
structure.

**Synthetic seeds.** A self-contained, redistributable starter
corpus (pure tone, chirps, FM drone, pink noise, harmonic arpeggio,
AM-tremolo noise, organ chord). Designed to exercise every dimension:
RMS dynamics, ZCR contrast, pitch sweep, spectral flatness extremes.

**Frontend instancing.** `InstancedMesh` of N spheres beats N React
nodes by ~50× at 6 000 frames. The polyline trail is a single `Line`
object reused across renders.

**Bundle size.** ~1.07 MB before gzip → 300 KB on the wire. The
dominant weight is Three.js. We accept it and rely on nginx's
`Cache-Control: public, immutable` for hashed assets.

**i18n: react-i18next.** Same library family as `next-intl` used in
UnderMineRisk; consistent with the rest of the account.

**Theme persistence.** The chosen theme is written to `localStorage`
under the `auralis-state` Zustand key (alongside the viz config) so a
user's setup survives full reloads.

## Roadmap

- **OpenL3 / PANNs deep embeddings** — add a fourth track using a
  pre-trained network. Heavier dependency but produces semantically
  cleaner clusters.
- **CREPE pitch tracker** — replace the current `piptrack`-based
  dominant pitch with CREPE for tighter pitch confidence.
- **VAE 6D space** — train a small autoencoder per category to project
  MFCC matrices into a clip-aware space.
- **Clip uploads** — allow users to drop their own audio (with size
  cap) and run the pipeline on the server. Requires a queue.
- **Cross-clip comparison view** — overlay two clips' trails in the
  same scene.
- **Snapshot export** — capture the canvas as a PNG / GIF of the trail.
