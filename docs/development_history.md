# Development history

Newest-first log of the design decisions that shaped Auralis. Each entry
records what changed, why, and the alternative we considered.

## v0.14.0 — CLAP 7th track + test expansion + lightpainting URL fix (2026-05-25)

A 10-PR block focused on correctness and offline readiness for #48
phase 2 (CLAP text-prompt UI).

### CLAP (laion/clap-htsat-unfused) enabled on every clip

torch (CPU wheel from the official PyTorch index) + transformers 5.x
installed in the local pipeline venv, re-ingest produced the CLAP
audio embedding for every clip. The manifest now reports 7
embedding methods:

  features, pca, tsne, umap, tonnetz, yamnet, **clap**

`/api/clip/<id>/embedding` carries the new track; the UI's track
selector shows it automatically. The fitted PCA mean + components +
per-axis [0, 1] ranges are persisted to
`data/projections/clap.json` (~101 KB). Combined with the YAMNet
equivalent persisted in 0.13.0, all of the offline preparation for
the future text-prompt endpoint is now committed.

### Two transformers-5.x compat fixes for CLAP

Discovered when running the actual ingest:

1. `ClapProcessor(audios=…)` was deprecated in 4.x and removed
   outright in 5.x — renamed to `audio=`. Fixed by trying the new
   keyword first and falling back to the old one for 4.x
   compatibility.
2. `ClapModel.get_audio_features(…)` used to return a (1, 512)
   tensor; in 5.x it returns `BaseModelOutputWithPooling`. Fixed
   by reading `.pooler_output` if present, falling back to the bare
   object otherwise. Same fix on `get_text_features` for symmetry.

### Test expansion: 5 backend tests → 56 across the stack

Backend (`tests/`):

- `test_smoke.py` — kept the original 5 happy-path tests
- `test_endpoints.py` — 11 negative-path + invariant tests (404
  handling, every track agrees on `num_frames`, every declared
  method appears in each clip's payload, audio content-type matches
  extension, unique clip ids, no empty titles, projection-model
  schema check)
- `test_pipeline_helpers.py` — 6 unit tests for
  `normalize01_with_range`, `project_pca_with_model`,
  `save_projection_model`, `needs_transcoding`. `pytest.importorskip`
  gate so the module skips cleanly in the lean backend venv (no
  numpy / scikit-learn there).

Frontend (`frontend/src/lib/`):

- `frameMap.test.ts` — 11 tests on the foundational `buildFrameMap`
  + `computeWindow` helpers used by every render mode (axis
  mapping, defensive 0.5 fallback, trail-window math).
- `urlState.test.ts` — 23 tests on the shareable-URL codec (round
  trip, validation hardening, render-mode whitelist parity).

CI runs all of them via `pnpm test` after typecheck and before
build.

### Bug found writing the tests

The `it.each` parity test for render-mode whitelist parity caught
that `lightpainting` was missing from `VALID_RENDER_MODES` in
`urlState.ts` since v0.8.0 — shared URLs that included
`renderMode: "lightpainting"` silently dropped the mode on decode,
the recipient saw the default. Fixed; the parity test will catch
this kind of drift the next time a render mode is added.

### Polish

- Help-modal step list refreshed to mention autoplay, all 7
  embedding tracks, all 10 render modes, and the new playback-speed
  + pitch-shift sliders. Both EN and ES.
- `CONTRIBUTING.md` + `SECURITY.md` added — standard community
  files, small and honest about the project being a personal one
  with no SLA.

### Why I held off on shipping the text-prompt endpoint with this

The offline preparation is done — projection model on disk, ingest
helpers all written — but the runtime endpoint still requires the
deployment decision around hosting a 1.3 GB torch + transformers +
CLAP install. The three paths offered (bigger VPS in process,
separate service behind nginx, HF Inference API) each have real
trade-offs that belong outside an autonomous shipping cycle.

## v0.12.0 — Data integrity sweep + ffmpeg transcoding + complete i18n (2026-05-24)

A six-PR pass to bring everything to "actually working end-to-end"
after the previous release closed feature work on paper.

### YAMNet regression (PR #127 → #128)

PR #118's re-ingest had silently dropped the `yamnet` track from all 87
clips because the local TF Hub cache had a corrupted module
(`~/AppData/Local/Temp/tfhub_modules/<hash>/` was missing
`saved_model.pb`). `try_yamnet()` caught the load error and returned
None, so the pipeline ran without YAMNet — and the empty embeddings
got committed and deployed. Production was serving 5 tracks per clip
instead of 6 for ~24 hours.

**Fix:** cleared the cache, re-ran ingest from clean. All 87 clips
back to 6 tracks.

**Lesson captured:** silent optional-dep fallbacks need a banner in
the ingest output (`[!] yamnet skipped` already prints, but the diff
in the JSON files doesn't make the regression obvious from a code
review). Filing a follow-up to add a manifest-level
`available_embedding_methods` field that the CI can assert against.

### Complete i18n coverage (PR #126)

Six hardcoded strings were still slipping through:

- `AudioPlayer` Play/Pause button label
- `AudioPlayer` 4 toast error bodies (embedding-load + MediaError codes 2/3/4)
- `App.tsx` library-load fallback
- `Header` theme-toggle button label

Routed every one through `t()`. Added 8 new keys under the existing
`error` namespace. Both locales kept at perfect parity (149 keys
each, no diff). The only remaining literals in JSX are music-note
labels (`"C"`, `"C#"`, …, `"B"`) — universal across languages.

### Documentation pass (PR #129)

Filled in docstrings on backend routers + manifest service + frameMap
helpers — focusing on rationale that isn't obvious from the
signature: why `stream_audio` doesn't validate file size, why
`get_clip` is a linear scan, why `load_embedding` is async-def with
`asyncio.to_thread`, why `buildFrameMap` defaults missing axis
values to 0.5 rather than throwing.

### ffmpeg transcoding wired into the data pipeline (PR #130 → #131)

The trailing piece of #120: some Wikimedia files are OGG-wrapped FLAC
(`Ogg data, FLAC audio`), which libsndfile + audioread cannot decode.
The downloader now detects this via a one-line `soundfile.SoundFile`
probe and transcodes through `imageio-ffmpeg`'s bundled binary to
OGG/Vorbis q5. Added `imageio-ffmpeg>=0.5` as a pipeline-only soft
dep.

This unblocked **5 NASA clips** that had been failing or skipped:

| Clip | Before | After |
|---|---|---|
| `space-mars-supercam-wind` | OGG/FLAC 2.1 MB (broken) | OGG/Vorbis 0.19 MB |
| `space-mars-microphone` | OGG/FLAC 0.86 MB (broken) | OGG/Vorbis 0.28 MB |
| `space-mars-microphone-clean` | OGG/FLAC 0.36 MB (broken) | OGG/Vorbis 0.18 MB |
| `space-mars-ingenuity-flight` | OGG/FLAC 2.5 MB (broken) | OGG/Vorbis 0.95 MB |
| `space-mars-moxie` | OGG/FLAC 2.5 MB (broken) | OGG/Vorbis 0.16 MB |

### Missing-audio sweep (PR #132 + #134)

Auditing the curation list against `data/sounds/` surfaced **13 clips**
defined as `CurationEntry` rows but never actually downloaded into the
repo. They lived in the manifest as references that would 404. All 13
are now on disk + ingested:

- 3 Perseverance clips (above — OGG/FLAC, needed the new transcoder)
- Voyager Greetings (MP3, ingested directly)
- 8 NOAA underwater (MP3, ingested directly)
- bird-nightingale (Common Nightingale OGG is 27 MB — over the 24 MB
  cap; swapped to *Luscinia luscinia* / Thrush Nightingale XC537550,
  0.6 MB — close relative, same evocative night-singing)

The audit was automated:

```python
for entry in CURATION:
    pat = Path("data/sounds")/entry.category/entry.id
    if not any(pat.with_suffix(s).exists() for s in [".ogg",".oga",".mp3",...]):
        print(entry.id)  # missing
```

Worth re-running periodically — easy to introduce more drift when
new entries land.

### Library state at end of cycle

**102 clips, 11 categories**, all with full 6-track embeddings:

| Category | Clips |
|---|---|
| amphibians_reptiles | 10 |
| birds               | 16 |
| insects             |  5 |
| mammals             | 14 |
| mechanical          |  8 |
| music               | 13 |
| nature              |  3 |
| space               | 14 |
| speeches            |  3 |
| synthetic           |  8 |
| underwater          |  8 |

The wiki (`Home`, `Render-Modes`, `Embedding-Methods`, `Cookbook`,
`API-Reference`) was also updated to match — including the
Light-painting render-mode section and the new CLAP embedding-methods
section that had been missing.

## v0.11.0 — Post-incident hardening + first interactive control (2026-05-24)

Three back-to-back deploys after the 0.10.0 recovery, each a focused
single-axis cycle:

### Typing hygiene (PR #116 → #117)

Removed 22 `as any` casts from the 9 Trail/Visualization components.
With the now-pinned R3F 8.18.0 / three 0.169.0 / @types/three 0.169.0
stack, the underlying types compose cleanly:

- `useRef<THREE.InstancedMesh>(null)` is assignable to `<instancedMesh
  ref={...}>` without coercion.
- `args={[undefined, material, count]}` is the correct shape for the
  `InstancedMesh` ctor — no `undefined as any` needed.
- The single remaining material prop without typed counterpart is
  `vertexAlphas`, now spread as `Record<string, unknown>` instead of
  `any` so the escape hatch is narrower.

One legitimate `as any` survives: `(window as any).webkitAudioContext`
in `lib/audioBus.ts` (Safari legacy fallback).

### NASA category expansion (PR #118 → #119)

Closed the trailing remainder of the audit's #43 with 5 new clips from
Wikimedia Commons (PD): three Cassini sonifications at Saturn (incl.
Enceladus), one Cassini at Jupiter (2001 flyby), and the Apollo 11 "the
Eagle has landed" voice clip. Library: 82 → 87. New space subcategories
visible in the UI: `saturn` (3), `jupiter` (1).

Two further candidates (Ingenuity helicopter, MOXIE) were attempted and
removed when the ingest step failed — Wikimedia ships both as OGG-wrapped
FLAC, and our `libsndfile` / `audioread` pipeline can't decode that
without ffmpeg transcoding. Filed as #120 follow-up.

Side-effect: the global PCA / t-SNE / UMAP projections re-fit when the
corpus changes, so all 82 existing embedding JSONs updated too. Manifest
diff is large (~99 files) and expected.

### First interactive control: playback speed + preserve-pitch (PR #121 → #122)

Issue #49 originally called for AudioWorklet PSOLA / phase-vocoder DSP.
Shipped the pragmatic half first via standard HTMLAudioElement APIs:

- **Speed slider** 0.25× .. 4× (double-click to reset) bound to
  `HTMLAudioElement.playbackRate`. The visualization stays driven by the
  canonical embedding, so the trajectory you watch is fixed — only the
  audio timing changes. Slowing down lets the user see exactly which
  segment of the 6D path corresponds to which sound.
- **Preserve-pitch checkbox** — on by default (browser phase-vocodes so
  slowing the clip does not drop pitch). Toggle off for tape-style
  behavior (slow = lower pitch, fast = higher).

Implementation: top-level non-persisted store fields (these should reset
to defaults on each page load, like `currentTime`). An effect in
`AudioPlayer` re-applies both after each clip change because
`HTMLAudioElement.load()` resets `playbackRate` and `preservesPitch`
back to 1.0 / true.

The AudioWorklet path for **pitch-shift independent of rate** stays open
as #123 follow-up — that's ~150-300 LOC of careful DSP and deserves its
own focused cycle.

### Why three small releases instead of one bundle

Each cycle is a complete, independently-deployable unit. Bundling them
into one PR would have hidden the typing pass behind the NASA data
churn (the embedding JSON diffs would dominate the review) and would
have delayed the interactive control behind the data ingest. Shipping
each as its own develop→main PR keeps the post-merge bookkeeping clear
and matches the "frequent small PRs" rule for this repo.

## v0.10.0 — Black-screen incident + fix + features restored (2026-05-23)

A multi-hour incident: every page load black-screened with a TypeError
deep inside three.js. Four PRs got reverted in a panic before the real
root cause was found.

### Diagnosis

The error stack was `Cannot read properties of undefined (reading
'length')` inside the minified three.js chunk, fired during React
reconcile. No source map was active in production, so the line pointed
into bundle internals rather than our code.

Three reverts in a row (`#88` demo tour, `#90` light-painting, `#92`
0.7.9 refactors) did not stop the crash. Reverting Bloom (`#94`) did
— which surfaced Bloom as the trigger, but did not explain *why* a
year-stable component would suddenly crash.

Bisecting deeper, we re-applied just Bloom (`#98`) and confirmed the
crash returned. Adding `frustumCulled={false}` to every lazy-init
geometry (`#96`) didn't help. Adding a one-rAF mount delay (`#100`)
didn't help either.

The real cause turned out to be a **peerDep mismatch**:

- `@react-three/postprocessing@3.0.4` declares peerDeps
  `@react-three/fiber: ^9.0.0` and `react: ^19.0`.
- The project runs `@react-three/fiber@8.18.0` + `react@18.3.1`.
- pnpm accepted the install because peerDep mismatches are *warnings*,
  not errors. The 3.x EffectComposer uses APIs not present in R3F v8's
  internal Canvas, hence the runtime TypeError on mount.

### Fix (`#102`)

Downgrade to `@react-three/postprocessing@2.19.0`, which is the latest
v2 release and declares the correct peerDeps for this stack. The two
extra defenses (`frustumCulled={false}` everywhere it was missing, plus
the rAF mount-delay on BloomPass) were kept — they harden against any
future race between Bloom's first render and lazy-init buffers.

### Restoration order

After the fix verified green in production, the reverted features were
re-applied one PR at a time, each followed by a Playwright smoke test:

- `#102` postprocessing@2.19.0 (real fix)
- `#104` URL state — shareable links via `location.hash`
- `#106` Light-painting render mode + its frustum fix
- `#108` Auto demo tour + stop 5 fix

Net effect: feature set is back to what it was at the would-be 0.9.2
(pre-incident), with three preventive code changes layered on top. The
two `0.7.9` refactors that didn't conflict cleanly with the frustum
fix (dedup-frame-mapping and drop-as-any-casts) were skipped — they
remain available to re-apply in isolation if anyone wants the code
tidiness without the race risk.

### Lessons captured

- Add a runtime version check at startup that warns when peerDep
  mismatches are present (open issue for follow-up).
- Add `@react-three/postprocessing` to a `dependencies` lock list with
  a strict major-version pin, not `^`, so pnpm cannot silently upgrade.
- For future incidents: bisect by *reverting commits one by one and
  redeploying*, not by grouping several reverts into one PR — saves
  hours of false confidence.

## v0.9.0 — CLAP track + NOAA underwater category (2026-05-22)

Two audit issues closed in one release.

### #48 phase 1 — CLAP embedding track

LAION's open implementation of CLAP (Contrastive Language-Audio
Pretraining, Wu et al. 2023) wired in as the **6th embedding track**
alongside PCA / t-SNE / UMAP / Tonnetz / YAMNet. Conceptually
identical to YAMNet:

- Pipeline: `clap_embeddings.try_clap()` lazy-loads; returns None if
  `torch` or `transformers` aren't installed. `AURALIS_SKIP_CLAP=1`
  opts out at run time.
- 512-D audio embeddings projected to 6D via corpus-wide PCA, then
  normalised to [0, 1] per axis.
- CLAP is a *global* embedding (one vector per clip, not per frame),
  so we broadcast the same vector to every frame. The 6D trail is a
  degenerate point inside CLAP space — useful for comparing clips'
  *positions* in semantic space across the library.

Pipeline now has 8 steps instead of 7. First run downloads ~600 MB
model + ~700 MB torch wheels.

Out of scope for this PR: the **text-prompt → 6D-point UI**. That
needs CLAP loaded in production (a deployment decision — more VPS
RAM, separate model service, or the HF Inference API). Will open a
phase-2 issue.

### #44 — NOAA Fisheries underwater category

New `underwater` category with 8 clips from NOAA Fisheries' "Sounds
in the Ocean" catalogue (PD under 17 U.S.C. §105). All URLs
verified live on 2026-05-22 returning HTTP 200 + audio/mpeg:

- humpback whale song, sperm whale clicks, beluga, Cuvier's beaked
  whale, killer whale, bearded seal — marine mammals
- snapping shrimp chorus — invertebrates
- Antarctic ice calving — ice

The original audit pointed at NOAA SanctSound (raw multi-hour data,
not curated clips). Switched to the NOAA Fisheries education
catalogue, which has short pre-curated PD clips ready to ingest via
the existing `url=` path in `CurationEntry`. No new downloader logic
needed.

## v0.8.0 — Light-painting render mode + NASA clips (2026-05-22)

Two audit follow-ups in one release.

### #50 — Light-painting (10th render mode)

Long-exposure photography in 3D. The whole path stays visible from
frame 0 to the cursor with additive blending — pixels where the trail
revisits itself glow brighter, so time density reads visually. The
cursor's recent `trailFrames` window decays linearly from alpha 1.0
down to a 0.15 floor, and a 5-layer halo of additive billboards at
the cursor position reinforces the write-head.

This closes the original 9-mode roadmap (the audit's external
research listed light-painting as the highest effort-to-impact
candidate). Implementation is ~210 LOC in `LightPaintingTrail.tsx`,
no new viz fields, persist version unchanged at v7.

### #43 — NASA Audio Collection (partial)

Added 4 NASA clips to the `space` category, expanding from 3 to 7:

- `space-mars-supercam-wind` — Perseverance SuperCam wind on Mars.
- `space-mars-microphone` — Perseverance mic raw ambient.
- `space-mars-microphone-clean` — same with rover fan noise removed.
- `space-voyager-greetings` — Voyager Golden Record 1977 greeting.

All four Wikimedia Commons titles were verified live against the API
on 2026-05-22. The remaining clips suggested by the external audit
(Cassini Saturn radio, InSight Marsquake, Juno Jupiter chorus) live
on NASA's PR sites rather than Wikimedia, so they're deferred until
a direct-URL ingest path exists.

Operator needs to run `scripts/local.ps1 ingest` locally to actually
download + featurize the new entries — the code commit alone doesn't
materialise the files.

## v0.7.9 — Shareable URL state + refactor cleanup (2026-05-21)

Three audit follow-ups landed together as a single release:

### #35 — URL-based state persistence
The selected clip, comparison clip, render mode, embedding track and
axis mapping now round-trip through `location.hash`. A copy-pasted
URL reproduces the exact view the sender was looking at.

Schema deliberately minimal (clipId / comparisonClipId / renderMode /
trackName / axes) — anything else (colormap, bloom, per-mode sliders)
stays in localStorage so URLs stay short and slider drags don't
thrash history. Encoding: JSON → base64url (~200 chars typical, no
gzip needed). Hydration via a ref-stashed snapshot consumed once
after `/api/library` resolves. Write-back debounced 300 ms with an
idempotency guard against the hydrate→write→hydrate loop.

### #42 — Drop `as any` casts in render-mode components
25 of 27 casts removed (typecheck still clean). The remaining 4 are
`vertexAlphas` spreads on `lineBasicMaterial` / `meshBasicMaterial`
(R3F's JSX typings don't expose the prop) — tightened from `as any`
to `as Record<string, unknown>`. The legacy Safari
`webkitAudioContext` cast in audioBus.ts stays.

### #41 — De-duplicate frame-mapping logic
SmokeTrail, BurstsTrail and the Trail6D inside Visualization6D
migrated to the shared `lib/frameMap` helpers. ~80 LOC removed
across three files; AXIS_HALF and MIN_TRAIL_FRAMES no longer
duplicated. No on-screen change.

## v0.7.8 — Surface library + audio errors via toast UI (2026-05-21)

Closes #36. Two silent failure paths get user-visible feedback:

- `/api/library` failure → top-right red toast with a Retry (window.
  location.reload) and a Dismiss. Auto-clears on a successful refetch.
- `<audio>` element `onError` → top-right amber toast with the parsed
  error reason (network / decode / unsupported / unknown). Auto-clears
  on the next successful `onPlay`.

Per-clip embedding fetch failures piggyback on the audio toast since
the user-facing symptom is the same. Two zustand slices (`library
Error` + `audioError`) + a single `<Toasts />` component mounted
globally in App.tsx. `aria-live="polite"` so screen readers announce
the error without yanking focus.

## v0.7.7 — CI + comparison persist + async I/O + language fallback (2026-05-21)

Four follow-ups landed together:

- **#39**: GitHub Actions workflow on push + PR. Two jobs: backend
  pytest, frontend typecheck+build. Concurrency group cancels
  superseded runs. pip + pnpm caches.
- **#38**: comparison clip survives reload via persisted `comparison
  ClipId` (just the id, not the full clip + embedding). Hydrated
  after the library arrives. Persist v6 → v7.
- **#40**: `/api/clip/{id}/embedding` is now async + asyncio.to_thread
  for the file read. Embedding JSONs are 100s of KB; on the event
  loop they used to stall other requests during a slow read.
  Also: corrupted-manifest fallback now `logger.exception(...)` so
  the operator sees it in journalctl (F-13).
- **#52**: i18n `fallbackLng: 'en'`. Detection order unchanged
  (localStorage → navigator.language → fallback); only first-time
  visitors on locales we don't translate (fr/de/pt/...) see English
  instead of Spanish.

## v0.7.6 — Bloom post-processing (2026-05-21)

Added a single bloom pass on top of the additive-blend render modes
(Smoke, Aurora, Comet, Galaxy, Flowfield, Bursts). They now visibly
glow at the default `bloomIntensity = 0.6`. The non-emissive modes
(Spheres, Tube, Constellation) stay sharp because the BloomPass
component returns null when intensity hits zero — no perf cost for
those modes.

Dependencies: `@react-three/postprocessing` + `postprocessing`. Bundle
delta: +17 KB gzipped on the three.js chunk (192 → 209 KB).

Configurable via a new "Bloom" slider in the right control panel.
Persist version bumped 5 → 6. Closes audit issue #47.

## v0.7.5 — Fix dropped security headers (2026-05-21)

Hotfix on top of 0.7.4. PR #53 added HSTS + CSP at the server level,
but nginx silently discards every server-level `add_header` whenever
a location block sets its own. All four of our locations override
Cache-Control, so the headers never reached the wire.

Extract the headers to `deploy/nginx-security-headers.snippet` and
`include` the snippet inside every location that has its own
`add_header` (plus at server level for any future location with no
overrides). Verified post-deploy that both headers ship on `/`,
`/assets/...` and `/api/library`. Closes #37 cleanly.

## v0.7.4 — HSTS + Content-Security-Policy headers (2026-05-21)

Two standard hardening headers that the audit flagged (F-01, F-02).

HSTS: `max-age=31536000; includeSubDomains`. No `preload` flag yet —
that requires a week of running without surprises, then registering
with hstspreload.org.

CSP: `default-src 'self'` with explicit carve-outs for `data:`
(gaussian textures), `blob:` (workers + recording), and inline R3F
styles. Locks down `object-src`, `base-uri`, `frame-ancestors`.

(See 0.7.5 for the immediate follow-up that made this actually ship.)

## v0.7.3 — Drop hardcoded maintainer email (2026-05-09)

Personal email pulled out of public source. `AURALIS_MAINTAINER_EMAIL`
env var attaches it to the Wikimedia / Freesound User-Agent at
ingest time if set; without it, the User-Agent carries only the repo
URL (Wikimedia accepts that as a contact channel via GitHub issues).
`MAINTAINER_EMAIL` env var required for first-time Let's Encrypt cert
issuance in `setup.sh`; subsequent runs skip the certbot block and
don't need it.

## v0.7.2 — Optional audio in canvas recordings (2026-05-09)

Recordings can now mux the playing audio track into the webm output.

### How
`audioBus.getRecordingStream()` lazily creates a
`MediaStreamAudioDestinationNode` from the shared `AudioContext` and
connects the existing `MediaElementAudioSourceNode` to it. A Web Audio
source can drive multiple destinations in parallel, so the speakers
keep working untouched. The recorder then receives a combined
`MediaStream` (`new MediaStream([videoTrack, audioTrack])`) and muxes
both into the same webm container at 128 kbps audio.

### UI
A single **Include audio** checkbox sits above the existing **Record
video** button. Default on; persisted in zustand (persist v5). While a
recording is in progress the checkbox is disabled to prevent
mid-stream changes. Considered two side-by-side buttons; rejected
because it duplicated the state machine and broke the single-action
visual hierarchy of the right control panel.

### Notes
- `ensureRunning()` is awaited before grabbing the recording stream,
  because most browsers create the `AudioContext` `suspended` until a
  user gesture; the record click counts as one.
- Licensing reminder added in the wiki: a few clips are CC-BY-NC-SA;
  for commercial reuse, filter to *Permissive* or *Public domain only*
  before recording (or untick **Include audio**).

## v0.7.1 — Recording guardrails + nginx rate-limit + cache fix (2026-05-09)

Hardening pass on top of 0.7.0 after observing two issues in
production: (1) a stale `index.html` from a previous deploy was being
served from browser cache, leaving the page white because the
hash-named bundles it referenced no longer existed on disk; (2) no
limits on how long or how big a client-side recording could grow.

### Recording guardrails (client-side)
`videoRecorder.startCanvasRecording` now takes a `maxBytes` option +
`onAutoStop` callback. The cumulative chunk size is tracked in
`ondataavailable`; when the cap is hit the recorder stops itself and
the consumer is notified. `RecordButton` wires both: 20 minutes of wall
clock OR 500 MB of cumulative chunks, whichever comes first. The
20-minute cap is generous on purpose — the user owns their machine.

A race condition in the original code was fixed at the same time:
`recorder.onstop` is now wired *before* `recorder.start()`, so the
size-cap path (which calls `recorder.stop()` from inside
`ondataavailable`) cannot resolve before the listener exists.

### nginx rate-limit + Cache-Control: no-cache
The vhost (`deploy/auralis.fasl-work.com.conf`) gained:
- Per-IP `limit_req_zone` for `/api/` (20 r/s burst 40) and `/audio/`
  (10 r/s burst 20), to absorb prefetching while blocking scrapers.
- `Cache-Control: no-cache, must-revalidate` on the SPA shell. The
  hash-named `/assets/` bundles stay `public, immutable`. This kills
  the white-page-after-deploy symptom permanently.

### deploy/update.sh sync
`update.sh` now copies `deploy/auralis.fasl-work.com.conf` to
`/etc/nginx/sites-available/` on each deploy when it differs, runs
`nginx -t`, then reloads. Aborts on bad config.

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

**Six-dimensional axis mapping.** Original specification: "let the user
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
