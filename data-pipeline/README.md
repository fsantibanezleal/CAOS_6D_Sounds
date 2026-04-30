# data-pipeline/

Offline scripts that turn raw audio clips under `../data/sounds/` into the
JSON artifacts the FastAPI backend serves at runtime:

* `../data/manifest.json` — top-level catalog (categories + clips list)
* `../data/embeddings/<clip-id>.json` — per-clip 6D embedding tracks

## Why this is offline

Computing PCA / t-SNE / UMAP and 12+ spectral features for the whole library
takes seconds-to-minutes locally and pulls in heavy dependencies (`librosa`,
`numba`, `umap-learn`, ...). Production should not carry that. The pipeline
runs on the developer workstation; its outputs are committed to the repo.

## Install

```powershell
# From the project root
python -m venv .venv-pipeline
.\.venv-pipeline\Scripts\Activate.ps1
pip install -r data-pipeline\requirements.txt
```

```bash
# bash equivalent
python -m venv .venv-pipeline
source .venv-pipeline/bin/activate
pip install -r data-pipeline/requirements.txt
```

## Run

The end-to-end command is:

```bash
python data-pipeline/ingest.py
```

It walks `data/sounds/<category>/<clip>.<ext>`, extracts features, fits the
chosen embeddings, and writes both artifacts. Existing outputs are
overwritten in place.

Subcommands (each script is also runnable on its own):

* `python data-pipeline/synthetic_seeds.py`    — generates the demo synthetic clips
* `python data-pipeline/extract_features.py`   — extract & cache per-frame features
* `python data-pipeline/compute_embeddings.py` — fit PCA / t-SNE / UMAP across the corpus
* `python data-pipeline/build_manifest.py`     — assemble `data/manifest.json`

## Conventions

* Frame hop is 50 ms (20 fps), window 100 ms — fast enough to look fluid in
  the visualization without bloating the JSON.
* Every track is min-max normalized to `[0, 1]` per dimension so the
  frontend can map any feature to any axis without re-scaling.
* Audio assets are NOT modified by the pipeline — only read.

See [../docs/audio_embedding_theory.md](../docs/audio_embedding_theory.md)
for the math.
