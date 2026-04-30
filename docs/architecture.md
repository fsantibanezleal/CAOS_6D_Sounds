# Architecture

Auralis is a single-purpose web application: turn a sound clip into a
moving point in a six-dimensional space and project it onto a 3D canvas
with color and size encoding the remaining dimensions.

The architecture is deliberately simple. Heavy work is done **once,
offline**, by a Python pipeline; the production server only ships the
resulting JSON + the audio files + a small static SPA.

## Diagram

![Architecture](svg/architecture.svg)

## Three components

```
┌──────────────────┐  python pipeline  ┌──────────────────┐
│  data/sounds/    │ ───────────────▶ │  data/manifest.  │
│  <category>/     │                  │     json + per-  │
│  <clip>.ogg      │                  │     clip JSONs   │
└──────────────────┘                  └─────────┬────────┘
                                                │
                                                ▼
                                      ┌──────────────────┐
                                      │  FastAPI server  │
                                      │  (uvicorn :8104) │
                                      └────────┬─────────┘
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │  React + R3F SPA │
                                      │  (Vite build)    │
                                      └──────────────────┘
```

### 1. Data pipeline (offline, Python)

Located at [`../data-pipeline/`](../data-pipeline/). Runs on the developer
workstation; not installed on the production server.

For every clip under `data/sounds/<category>/<id>.<ext>`:

1. Resample to 22050 Hz mono.
2. Compute 12 per-frame spectral features (RMS, ZCR, spectral centroid /
   rolloff / bandwidth / flatness / contrast, dominant pitch + confidence,
   tempo proxy, dominant chroma, onset strength).
3. Compute 13 MFCC bands per frame.

Then, **across the corpus**:

4. Fit PCA on the concatenated MFCC matrix → 6D projection.
5. Fit two t-SNE projections (different perplexities) → stack to 6D.
6. Fit UMAP on the same concatenated matrix → 6D projection
   (skipped silently when the optional `umap-learn` is not installed).

Per-clip outputs:

* `data/embeddings/<id>.json` — `tracks=[features, pca, tsne, umap]`,
  each track is a `(num_frames, 6)` matrix min-max normalized to `[0, 1]`.

Library output:

* `data/manifest.json` — categories, clips list, available embedding
  methods, feature roster.

### 2. Backend (FastAPI, Python 3.12)

Located at [`../app/`](../app/). One process, one systemd unit, port `:8104`
on `127.0.0.1` (nginx is the public entrypoint, see `deploy/`).

Surfaces:

| Path | Purpose |
| --- | --- |
| `/health` | Liveness probe (200 "ok") |
| `/api/library` | Top-level catalog |
| `/api/clip/{id}` | Single clip metadata |
| `/api/clip/{id}/embedding` | Per-frame 6D vectors |
| `/audio/{id}` | Audio asset (range-request friendly) |
| `/api/docs` | OpenAPI Swagger UI |
| `/` (and SPA fallback) | Built React bundle |

Backend dependencies are minimal (`fastapi`, `uvicorn`, `pydantic`,
`pydantic-settings`, `orjson`). No DB, no cache server, no background
workers.

### 3. Frontend (React + Vite + Three.js)

Located at [`../frontend/`](../frontend/). Build artifact: `frontend/dist/`,
served as static by the FastAPI app.

Rendering stack:

- **React 18** + **TypeScript** for state and UI.
- **@react-three/fiber + drei** for Three.js scene graph.
- **Web Audio API** (HTMLMediaElement → MediaElementSourceNode → AnalyserNode)
  for live spectrogram and waveform side panels.
- **react-i18next** for ES + EN with localStorage persistence.
- **Zustand** with persistence for theme + viz config (so a user's axis
  mapping survives reload).

The 6D visualization uses an `InstancedMesh` of `numFrames` spheres + a
single line mesh; useFrame updates only the visibility window each tick.
This holds 60 fps for clips up to ~10 minutes (~12 000 frames).

## Why this split?

- **Privacy:** the sound corpus is committed; nothing is fetched at
  runtime.
- **Speed:** the SPA's largest network request is the per-clip embedding
  (≤ ~250 KB before gzip ≈ ~50 KB on the wire).
- **Determinism:** PCA / t-SNE / UMAP fits are seeded; the same input
  produces the same JSON, which makes diffs in CI meaningful.
- **Portability:** the production server stays slim — no `librosa`, no
  `scikit-learn`, no `umap-learn`. A 32 MB venv vs. a 1.4 GB one.

## Deployment

See `../deployments/auralis.md` (in `_CAOS_MANAGE` repo) for the binding,
and `../deploy/` here for the templates.

The whole production install is:

1. `git clone` the repo into `/opt/fasl-apps/CAOS_6D_Sounds`.
2. `pip install -r requirements.txt` into `.venv`.
3. `pnpm install && pnpm build` inside `frontend/`.
4. `cp deploy/fasl-auralis.service /etc/systemd/system/`.
5. `cp deploy/auralis.fasl-work.com.conf /etc/nginx/sites-available/`.
6. `certbot --nginx`.

`deploy/setup.sh` is the one-shot orchestrator; `deploy/update.sh` is the
daily redeploy.
