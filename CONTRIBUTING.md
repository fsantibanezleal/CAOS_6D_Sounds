# Contributing to Auralis

Thanks for the interest. This is a small personal project, so the bar
for contributions is "useful and well-explained" rather than process-
heavy.

## How to file an issue

- **Bugs**: include browser + OS, what you did, what you expected,
  what happened. A screenshot or short screen-record of the canvas
  helps a lot — the rendering modes have subtle visual states that
  are hard to describe in words.
- **Feature ideas**: explain the use case first, the implementation
  is a separate conversation. Most accepted features have a short
  rationale ("I wanted to do X with the visualization but couldn't")
  rather than a generic improvement claim.
- **Audio clip suggestions**: the curation list lives in
  [`data-pipeline/curated_downloads.py`](data-pipeline/curated_downloads.py).
  PD or CC-licensed sources only; under 24 MB per file (the
  `MAX_BYTES` cap stays so the repo doesn't bloat); link the source
  page so the license can be verified.

## How to send a pull request

The repo follows a three-tier branch model that's documented in
[`docs/development_history.md`](docs/development_history.md): work on
a `task/<slug>` branch, PR to `develop`, then `develop` → `main`
when a release is ready. For an outside contributor: open the PR
against `develop`. The maintainer handles the second hop.

Before you push, run the local checks the CI runs:

```bash
# Backend
.venv/bin/pytest tests/ -q

# Frontend
cd frontend
pnpm typecheck
pnpm test
pnpm build
```

All four should pass on green. If any of them fails on `develop`
before your change, that's already a bug — say so in the PR.

## Code style

There's no enforced linter beyond TypeScript's strict mode and
Python's standard `ruff`-style defaults. The conventions that
matter:

- **Docstring-the-WHY, not the WHAT.** If a function's name and
  signature are obvious, leave the body uncommented. Save the
  prose for surprising decisions or non-obvious invariants
  (`buildFrameMap` defaulting missing axis values to 0.5 to
  prevent NaN gl_Position is a good example).
- **Two locales stay in sync.** Every UI string goes through
  `t()`, with matching keys in `frontend/src/i18n/en.json` AND
  `es.json`. A CI parity check is on the roadmap.
- **No co-author trailers** on commits or PRs.
- **Three.js stack is exact-pinned.** See
  [`frontend/DEPENDENCIES.md`](frontend/DEPENDENCIES.md) for why —
  the v0.10.0 incident in development history is the cautionary tale.

## Local setup

See [`README.md`](README.md#quickstart) for the venv + frontend
install commands, and the
[Local development wiki page](https://github.com/fsantibanezleal/CAOS_6D_Sounds/wiki/Local-Development)
for the rest of the dev loop.

## Communicating

Open an issue or comment on an existing PR — easier than email and
keeps the conversation visible. There's no Discord, no Slack, no
mailing list — by design.

## License

By contributing you agree your code ships under the MIT license that
covers the rest of the repo. Audio clips remain under their original
upstream license; check `data/sounds/<category>/<id>.meta.json` for
the per-clip attribution.
