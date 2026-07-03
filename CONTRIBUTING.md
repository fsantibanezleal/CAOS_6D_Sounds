# Contributing

Thanks for your interest in this project. It is maintained by Felipe Santibanez-Leal. Contributions,
issues, and suggestions are welcome.

## Reporting issues

Please open a GitHub issue before starting non-trivial work, so intent is visible and effort is not
duplicated. A good issue states:

- What you observed (or want), with steps to reproduce for a bug.
- The environment (OS, versions) when relevant.
- One logical topic per issue.

## Development flow

This project uses a three-level branch flow:

1. Branch from `develop` as `task/<short-slug>`.
2. Commit in small, focused units (one logical change per commit).
3. Open a pull request from your `task/<slug>` branch **into `develop`** (never straight into `main`).
4. `develop` is promoted to `main` via its own pull request when a change is release-ready.

`main` is the deployed/released branch; it is never committed to directly.

## Pull requests

- Reference the issue it addresses (for example `Fixes #123`).
- Describe what changed and how you verified it.
- Keep pull requests small and frequent rather than large and batched.
- Do not disable commit hooks or force-push shared branches.

## Code conventions

- Code, identifiers, comments, and commit messages are written in **English**.
- User-facing UI strings may be localized (bilingual where the product is bilingual).
- Match the style of the surrounding code (naming, formatting, comment density).
- Add or update tests and documentation alongside the change.

## Local setup

See the project `README.md` for how to install dependencies and run the app and its tests locally.
Dependencies are installed into an isolated environment (a project-local virtualenv for Python, a local
`node_modules` for Node), never globally.

## License of contributions

By contributing, you agree that your contributions are licensed under the same license as this repository
(see `LICENSE`).
