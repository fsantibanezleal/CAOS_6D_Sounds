# User guide

Auralis turns a sound clip into a moving point in a six-dimensional space
and projects it onto a 3D scene with color and size encoding the remaining
dimensions. This guide walks through the UI.

## Three panels

```
┌────────────────┬───────────────────────────────────┬──────────────────┐
│  Library       │            Visualization 6D       │  Controls        │
│  (left)        │            +  side panels         │  (right)         │
│                │                                   │                  │
│  category      │   Three.js scene with the active  │   track,         │
│  pills         │   clip's 6D trail.                │   axis mapping,  │
│  search        │                                   │   colormap,      │
│  clip list     │   Spectrogram + audio player +    │   sphere size,   │
│                │   live features below.            │   trail length   │
│                │                                   │                  │
└────────────────┴───────────────────────────────────┴──────────────────┘
```

## Step by step

1. **Pick a clip** in the library on the left. Use the category pills to
   narrow the list, or the search box to filter by title or tag.

2. **Press play**. The visualization updates in lock-step with the audio
   via `requestAnimationFrame`, so frame transitions are smooth.

3. **Choose the embedding track** in the right panel:
   - `FEATURES` — six interpretable spectral descriptors (centroid,
     rolloff, bandwidth, RMS, ZCR, flatness). Best when you want axes
     with physical meaning.
   - `PCA` — linear projection of MFCC frames onto the top six PCs.
     Deterministic and fast.
   - `T-SNE` — non-linear projection that emphasizes local clusters.
     Slower and qualitative.
   - `UMAP` — non-linear projection with better global structure.

4. **Map dimensions to roles**. Each dimension of the active track can
   be assigned to one of: X / Y / Z position, color (4D), sphere size
   (5D). Time is the implicit 6th axis. Mappings are applied live —
   change them while the audio plays.

5. **Adjust the visual.** From the control panel:
   - **Colormap**: choose among viridis, magma, plasma, inferno, cividis,
     turbo and RdBu. All are perceptually uniform (or near-uniform).
   - **Reverse**: invert the color mapping.
   - **Min / max sphere radius**: lerp range for the size dimension.
   - **Trail length**: how many seconds of past frames stay visible.
   - **Connect points with a line** / **Show axes** / **Show grid**.

6. **Reset the camera** with the dedicated button or by pressing `R` in
   the canvas. Zoom, pan and rotate with the standard OrbitControls
   gestures (scroll, right-drag, left-drag).

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `1`..`9` | Jump to the Nth clip in the current filter |
| `T` | Toggle theme (dark / light) |
| `G` | Toggle grid |
| `A` | Toggle axes |

## Side panels

- **Spectrogram** — live mel-scale spectrogram of the playing audio,
  colored with the active colormap.
- **Audio player** — play / pause, scrubber, time readout.
- **Live features** — RMS energy, spectral centroid, dominant pitch at
  the current time.

## Internationalisation

The UI ships in **Spanish (default)** and **English**. Switch with the
language dropdown in the header. The choice is persisted in
localStorage.

## Theme

Light and dark themes are both available. Switch with the theme button
in the header or with the `T` shortcut. The choice is persisted.

## Adding your own clips

1. Drop audio files into `data/sounds/<category>/<clip-id>.<ext>` (use
   one of: `synthetic`, `birds`, `mammals`, `amphibians_reptiles`,
   `insects`, `nature`, `speeches`, `music`, `space`, `mechanical`).
2. (Optional) place a sidecar `<clip-id>.meta.json` with title /
   license / attribution metadata next to the audio.
3. Run the pipeline: `scripts/local.ps1 ingest` (or `./scripts/local.sh
   ingest`).
4. Refresh the browser — the manifest is cached for one hour but the
   service auto-reloads it.

## Troubleshooting

- **No sound plays.** Most browsers block AudioContext until a user
  gesture. Click "Play" once to unlock; subsequent playbacks work
  freely. The 6D visualization still updates from the embedding even
  when the analyser is suspended.

- **Library is empty.** Run the data pipeline (see above). Without a
  manifest the API responds with a fallback empty library so the SPA
  still loads.

- **t-SNE or UMAP missing in the track dropdown.** Some corpora are
  too small for one or both projections — Auralis silently skips the
  ones that fail. The `FEATURES` and `PCA` tracks are always present.
