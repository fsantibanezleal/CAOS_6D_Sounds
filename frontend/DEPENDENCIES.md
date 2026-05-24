# Frontend dependency policy

## Why the R3F / three.js / postprocessing versions are pinned exactly

These five packages move together and silently break the app when their
majors get out of sync:

| Package | Pinned | Why |
|---|---|---|
| `three` | `0.169.0` | The underlying 3D engine. Every other entry here is keyed to this exact minor. |
| `@types/three` | `0.169.0` | Must match the runtime `three` version exactly or TypeScript misses members. |
| `@react-three/fiber` | `8.18.0` | Latest v8 (React 18 era). v9 needs React 19; we stay on React 18. |
| `@react-three/drei` | `9.122.0` | Latest drei v9 compatible with R3F v8. |
| `@react-three/postprocessing` | `2.19.0` | Latest v2 compatible with R3F v8. **v3 silently broke the app for hours on 2026-05-23** because pnpm accepted its `peerDependencies: { @react-three/fiber: ^9, react: ^19 }` as a warning rather than an error. See `docs/development_history.md` v0.10.0. |
| `postprocessing` | `6.39.1` | The lower-level lib that `@react-three/postprocessing` re-exports. Pinned to keep transitively consistent. |

## What this means in practice

- **No `^`** on any of those six packages.
- `pnpm update` will NOT bump them. Use an explicit `pnpm add <pkg>@<version>` if you really want to move.
- Before bumping any of them, verify the new version's `peerDependencies` against this project's React (`^18.3.1`) and R3F (`8.18.0`) majors. A mismatch on R3F or React causes the kind of mount-time crash documented in v0.10.0.

## What is *not* pinned

`react`, `react-dom`, `react-i18next`, `i18next*`, `zustand`, `vite`, `typescript` etc. stay on `^minor.patch` because:

- They've been stable across patch/minor bumps in our usage.
- A regression in any of them is loud and quick to bisect (errors are in our code paths, not deep inside a render library).
- Pinning them too would force a manual upgrade dance for every security patch.

## How to bump a pinned package safely

1. Check the new version's `peerDependencies` matches our React + R3F majors.
2. Run `pnpm add <pkg>@<new-version>`.
3. `pnpm typecheck && pnpm build`.
4. `pnpm preview`, open in a real browser (not Playwright headless), confirm the canvas renders without console errors.
5. Smoke-test every render mode (Spheres → Smoke → Bursts → Constellation → Aurora → Comet → Tube → Galaxy → Flowfield → Light-painting).
6. Deploy + post-deploy smoke from the live URL.
