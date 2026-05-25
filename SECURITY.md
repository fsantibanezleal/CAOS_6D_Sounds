# Security policy

## Scope

Auralis is a small, single-page audio visualization app. It serves
public PD / CC-licensed audio clips and pre-computed embeddings as
static JSON. There is no user authentication, no user data, no
write API.

The deployed instance at <https://auralis.fasl-work.com> is the only
"production". Everything else is the public source code in this repo
and its wiki.

## What I care about

If you've found:

- An XSS / SCO via the `location.hash` URL-state codec
- A way to crash the backend with a crafted request
- A way to fetch a file outside `data/sounds/` via `/audio/{id}`
- Missing or weakly-configured TLS / nginx security headers
- An exposed secret in the repo (any branch, any tag) or in the
  embedded data files

Please report it via a private email to the address listed in
`LICENSE` or by opening a private security advisory in this repo:
<https://github.com/fsantibanezleal/CAOS_6D_Sounds/security/advisories/new>.

For everything else, a public GitHub issue is fine.

## What I do NOT care about (please don't report)

- Browser fingerprinting / privacy concerns from third-party
  resources — there are none; the app makes only same-origin
  requests.
- Self-XSS via DevTools console.
- Issues that require physical / local access to the user's machine.
- Issues that only affect deprecated browsers (anything older than
  Chrome 110 / Firefox 110 / Safari 16).

## Response time

This is a personal project with no SLA. Realistically I respond to
security reports within a week, fix critical issues within a few
days of confirmation, and deploy non-critical fixes alongside the
next regular release.
