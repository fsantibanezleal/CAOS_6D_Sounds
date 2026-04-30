# Development history

Newest-first log of the design decisions that shaped Auralis. Each entry
records what changed, why, and the alternative we considered.

## v0.7.0 — Flowfield mode + library expansion + new features (2026-04-30)

The 9th and final render mode of the original roadmap, plus library
growth and feature roster expansion.

### Flowfield render mode (9th, last roadmap mode)
A swarm of ~240 glowing particles advecting along the trail's tangent
vectors. Each particle is anchored to a deterministic frame inside
the visibility window (chosen via stable hash of particle index +
slow phase advance), reads the local tangent at its anchor, and
blends its current velocity toward that tangent before advecting.
Particles respawn after `lifetime` seconds with a new anchor. The
3-phase alpha envelope (fast fade-in / hold / fade-out) makes the
swarm read as a continuous wake.

User controls: Particle count (32..800), Flow speed (0.05..1),
Particle lifetime (0.5..6 s). Code:
`components/FlowfieldTrail.tsx`. Renders via the same gaussian +
additive ShaderMaterial used by Smoke / Constellation / Comet.

This closes the original roadmap. The Render-Modes wiki page now
documents 9 modes implemented and zero pending.

### Library expanded to 82 clips
Added 15 new clips across the previously-underpopulated categories:

* `birds` (12 → 16): Anna's hummingbird (broken — Skeleton container,
  removed), Northern raven, Wild turkey, Mallard duck. (4 net)
* `mammals` (13 → 14): Killer whale (orca, NOAA public domain).
* `amphibians_reptiles` (4 → 9): Bufo bufo + Bufo viridis toad calls,
  Spring peeper, Cope's gray treefrog, Rattlesnake, Tokay gecko.
* `insects` (3 → 4): Bumblebee buzz, Honeybee hive ambience.
* `music` (11 → 13): Bach Partita for Solo Flute (Allemande), Violin
  pizzicato (G major reference scale).
* `mechanical` (7): Mechanical alarm clock (replaces nothing —
  added). Helicopter clip removed (Theora video, libsndfile crash).

Net change: +15 clips. Several formerly-pending blacklisted clips
were removed permanently from `curated_downloads.py` with explanatory
comments.

### Audio feature roster: 22 → 27
Five new per-frame features:

* `spectral_irregularity` (Krimphoff 1994) — sum of squared bin-
  to-bin amplitude differences, normalised by total energy. Reads
  as "how jagged is the spectral envelope".
* `mel_band_0` through `mel_band_3` — perceptually-spaced bands
  computed via librosa's mel filterbank (80 mels grouped into 4
  equal-width sub-bands). Complements the existing linear octave
  bands.

The mel bands are deliberately added *alongside* the linear ones
rather than replacing them, so users can pick whichever axis
semantics fits their use case (linear Hz vs. perceptual mel).

### Persist version bumped to 4
`flowfieldParticles`, `flowfieldSpeed`, `flowfieldLifetime` added
to DEFAULT_VIZ. Stale localStorage from any 0.6.x is discarded;
the defensive merge from 0.5.1 keeps everything else intact.

### Wiki
- `Render-Modes`: full Flowfield section, roadmap retired.
- `Audio-Features`: spectral_irregularity + mel-band-energies sections.
- `Library-Curation`: bumped to 82 clips with the new subcategory listing.
- `Home`: bumped to release 0.7.0 numbers.

## v0.6.0 — Tube + Galaxy + video recording + tag filter (2026-04-30)

Two more render modes (8 total), a video recording feature, and a
tag-based library filter.

### Tube ribbon mode
Thick camera-aligned triangle strip along the trail. Two vertices
per frame (top + bottom of the strip); ribbon perpendicular comes
from `camera.viewDir × segmentDir` so the strip always faces the
camera regardless of orbit angle. Width = size axis × `tubeWidth`
slider. Code: `components/TubeTrail.tsx`. Looks sculptural and
continuous — pairs especially well with Tonnetz on music clips.

### Galaxy mode
Permanent star-clusters at every frame. No drift, no age fade —
the entire 6D path remains visible. Each point twinkles with a
deterministic sine of the frame index. Sliders: stars per frame
(1..20), cluster radius (0..0.4), twinkle amplitude (0..0.8).
Different ergonomics from the other modes (history-preserving
rather than window-based). Code: `components/GalaxyTrail.tsx`.

### Video recording
New `Record video` button uses `HTMLCanvasElement.captureStream(30)`
+ `MediaRecorder` to capture the 6D viz as a webm at 8 Mbps. 60 s
safety cap. Pulsing red dot + elapsed seconds while recording.
Hidden when the browser lacks support (very old Safari). Files:
`lib/videoRecorder.ts`, `components/RecordButton.tsx`.

### Tag filter in the library
Collapsible facet under the library toolbar lists every distinct
tag with its clip count. Click to toggle; OR semantics (a clip
matches if it carries any selected tag). Combines with the existing
search + license + max-duration filters.

### Persist version bumped to 3
DEFAULT_VIZ gained four new fields (`tubeWidth`, `galaxyDensity`,
`galaxySpread`, `galaxyTwinkle`); the version bump discards stale
localStorage that lacked them.

### Wiki
- New page **Recording-And-Snapshots** documenting both PNG and
  webm capture in detail (browser-support matrix included).
- New page **Cookbook** with eight practical workflows
  (start-here, harmonic-shape video, two-species comparison,
  brand-coloured palette, etc.).

## v0.5.0 — Three more render modes (2026-04-30)

Three new visualisation modes — **Constellation**, **Aurora**,
**Comet** — bringing the total to six. Each shares the same
`(values, numFrames, hopSeconds)` interface and consumes the new
shared `lib/frameMap.ts` helpers (`buildFrameMap`, `computeWindow`)
that replace ~120 lines of duplicated per-frame code across the
existing modes.

### Constellation
A minimalist "graph" aesthetic. Small bright nodes (additive
billboards with a soft halo, sized far below the Spheres default)
joined by thin glowing edges that brighten where they overlap
(additive lineBasicMaterial). Per-node alpha pulses subtly with a
deterministic sine of the frame index — scrubbing back replays the
same pulsation. Controls: `Node size` (0.2..2.0×), `Edge brightness`
(0..1).

### Aurora
Vertical curtains of light. Each frame in the visibility window
becomes a thin vertical ribbon rising upward from its 6D-mapped
position. The custom `auroraMaterial` shader fades alpha from full
at the base to zero at the top and applies a deterministic sine sway
that scales with local height — base barely moves, top flutters.
Additive blending so dense clusters of frames produce a luminous
curtain. Controls: `Curtain height` (0.1..3.0×), `Sway` (0..0.4).

### Comet
A bright "head" billboard at the cursor + a stretched fading trail
of smaller billboards behind it. Two `InstancedMesh` (trail and
head) sharing the gaussian-textured additive material from Smoke;
the head is rendered with size = ``frame.size * cometHeadScale``
(default 5×). Trail alpha decays with `pow(1 - age, cometTailDecay)`
so the user can crank the falloff sharper or softer. Controls:
`Head size` (1..10×), `Tail decay` (0.5..4).

### UI
The render-mode toggle is now two rows of three buttons each
(Spheres / Smoke / Bursts on top, Constellation / Aurora / Comet on
the bottom). Mode-specific sliders replace each other when you
switch; persisted in zustand.

### New shared helpers
- `lib/frameMap.ts` — pure functions `buildFrameMap()` and
  `computeWindow()` consolidate the per-frame position+colour+size
  computation and the cursor-window math.
- `lib/auroraMaterial.ts` — the vertical-ribbon shader.

## v0.4.2 — Bursts render mode (2026-04-30)

**Third visualisation mode: Bursts.** Each frame in the active
visibility window draws a tiny explosion of K rays from its 6D-mapped
centre in random unit directions. Ray length scales with the frame's
size axis times an age-grow factor (older bursts have longer flares).
Each ray colour-fades from bright at the centre to nearly transparent
at the tip; bursts persist with overall age-decaying alpha.

Implementation:

- New `components/BurstsTrail.tsx` — single `THREE.LineSegments` with
  `vertexColors + vertexAlphas + AdditiveBlending` and depth-write
  disabled. ``numFrames * rayCount * 2`` vertices in one draw call.
- Static per-ray data (random unit direction + length jitter) seeded
  with a fixed RNG so a given frame's burst is stable across replays.
- Per-frame writes only positions + RGBA on the segments inside the
  visibility window; outside frames collapse to a degenerate
  zero-length segment with alpha 0.
- Visualization6D branches between Spheres / Smoke / Bursts.

UI:

- The mode toggle in the control panel is now a 3-button group
  (Spheres / Smoke / Bursts).
- Burst-specific sliders appear when active: Rays (4..32),
  Burst size (0.2..2.0×).
- i18n strings for ES + EN.

Performance: ~70 K vertices for the 67-clip corpus; one
`THREE.LineSegments` draw call. Holds 60 fps comfortably.

Visually: pairs especially well with percussive / transient clips
(bird trills, cricket chirps, explosions) where each frame has a
distinct identity worth highlighting.

## v0.4.1 — first-visit defaults (2026-04-30)

The SPA now auto-loads `bird-house-sparrow` in Smoke mode with
sphereMin/Max pinned to slider extremes and a 17-second trail when
a fresh visitor arrives (no localStorage state). Returning users
keep their persisted setup. See PR #17.

## v0.4.0 — Smoke render mode (2026-04-30)

**New visualisation mode: Smoke.** Each frame in the active visibility
window emits a small cluster of camera-aligned quads, each textured
with a soft gaussian and blended additively. The puffs drift outward
over time so the cloud disperses with age. Per-particle alpha decays
linearly with frame age. The polyline is not drawn in Smoke mode —
overlapping clouds fill the gap between consecutive frames naturally.

Implementation:

- New `lib/smokeMaterial.ts` builds the gaussian texture (one-time
  64×64 RGBA) and the `THREE.ShaderMaterial` (custom vertex + fragment
  with billboard math, additive blending, depthWrite disabled).
- New `components/SmokeTrail.tsx` renders an `InstancedMesh` of
  ``numFrames * smokeDensity`` particles. The default density is 8
  particles per audio frame.
- `Visualization6D` branches on `viz.renderMode` between Spheres
  (existing) and Smoke (new).
- `ControlPanel` gains a 2-button toggle for the mode + three
  smoke-specific sliders (density 2..16, spread 0..0.4, drift 0..0.4).
- Persistent in zustand alongside the rest of `viz`.

Performance: ~50 K particles at 60 fps in a single instanced draw
call. The full corpus (67 clips × ~6 K frames × 8 particles) fits
inside a single InstancedMesh per scene.

## v0.3.0 — features deep-dive + tonal axes (2026-04-30)

**More features.** SCALAR_FEATURES grew from 18 to 22 with:
* `loudness_db` — 20·log10(RMS), clamped to [-80, 0] dB
* `spectral_skewness` — 3rd standardised moment of the spectrum
* `spectral_kurtosis` — 4th standardised moment (excess form)
* `onset_density` — onsets per second over a 1 s sliding window

**New 6D embedding track: Tonnetz.** The natural 6-dim harmonic space
of chroma (Harte, Sandler & Gasser, 2006). Axes pair as fifths,
minor thirds, major thirds. Per-clip min-max normalized so it shares
the same world cube as PCA / t-SNE / UMAP / YAMNet. This track shows
its strengths on the music + speech clips (clear chord-progression
trajectories that are invisible in MFCC space).

**Library polish.** Selector now shows a small "subcategory" pill on
each clip row, plus license + max-duration filter dropdowns. Dropped
the 10-min Churchill clip whose particular Vorbis encoding crashed
libsndfile on Windows.

**Live features panel.** Now also shows loudness (dB) and onset
density (/s) per current frame, in addition to RMS / centroid / pitch
+ clip-level tempo and key.

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
