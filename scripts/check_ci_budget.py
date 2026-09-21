"""ADR-0074 gate: CI and CD are cheap checks, run only for develop and main.

Fails when a workflow:
  - triggers on pull_request, on a schedule, or on a push to a branch other than
    develop/main/master;
  - has no top-level concurrency group;
  - has a job without timeout-minutes;
  - installs the training stack (precompute lane, pipeline requirements, torch & co.);
  - runs a training, pipeline, bake or benchmark entry point;
  - runs a test suite in a product repo (one with data-pipeline/): tests run locally.
Stdlib only, so it runs before any install.
Usage: python scripts/check_ci_budget.py [repo_dir]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
TRUNKS = {"develop", "main", "master"}
STACK_INSTALL = re.compile(
    r"download\.pytorch\.org|(pip|uv)\s+(pip\s+)?install\b[^\n#]*("
    r"requirements-precompute|data-pipeline/requirements|"
    r"\b(torch|torchvision|tensorflow|jax|jaxlib|transformers|lightning)\b)"
)
PIPELINE_RUN = re.compile(
    r"data-pipeline/\S+\.py|\brun_all\b|\bprecompute\b|\bbenchmark\b|stages\.train|--epochs\b|"
    r"\bcompare_bakes\b|\bbake\b|lab\.pipeline\b|-m\s+\S+\.pipeline\b"
)
PYTEST = re.compile(r"(^|[\s;&|])(python\s+-m\s+)?pytest\b")


def check_workflow(path: Path, product: bool) -> list[str]:
    errs: list[str] = []
    text = path.read_text(encoding="utf-8")
    name = path.relative_to(ROOT).as_posix()
    if re.search(r"^\s{2}pull_request(_target)?\s*:", text, re.M):
        errs.append(f"{name}: pull_request trigger (ADR-0074 rule 4)")
    if re.search(r"^\s{2}schedule\s*:", text, re.M):
        errs.append(f"{name}: schedule trigger (ADR-0074 rule 4)")
    for m in re.finditer(r"^\s{4}branches\s*:\s*\[([^\]]*)\]", text, re.M):
        bad = {b.strip().strip("'\"") for b in m.group(1).split(",")} - TRUNKS - {""}
        if bad:
            errs.append(f"{name}: triggers on branches {sorted(bad)} (ADR-0074 rule 4)")
    if not re.search(r"^concurrency\s*:", text, re.M):
        errs.append(f"{name}: no top-level concurrency group (ADR-0074 rule 5)")

    in_jobs, job, has_timeout, reusable = False, None, False, False
    jobs: list[tuple[str, bool, bool]] = []
    for line in text.splitlines():
        if re.match(r"^jobs\s*:", line):
            in_jobs = True
            continue
        if in_jobs and re.match(r"^\S", line):
            in_jobs = False
        if not in_jobs:
            continue
        m = re.match(r"^  ([A-Za-z0-9_-]+)\s*:\s*$", line)
        if m:
            if job:
                jobs.append((job, has_timeout, reusable))
            job, has_timeout, reusable = m.group(1), False, False
        elif re.match(r"^    timeout-minutes\s*:", line):
            has_timeout = True
        elif re.match(r"^    uses\s*:", line):
            reusable = True
    if job:
        jobs.append((job, has_timeout, reusable))
    for j, t, r in jobs:
        if not t and not r:
            errs.append(f"{name}: job '{j}' has no timeout-minutes (ADR-0074 rule 5)")

    for i, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s.startswith("#"):
            continue
        if STACK_INSTALL.search(line):
            errs.append(f"{name}:{i}: installs the training stack (ADR-0074 rule 2)")
            continue
        is_cmd = re.match(r"^\s*(-\s*)?run\s*:", line) or re.match(r"^\s{10,}\S", line)
        if not is_cmd:
            continue
        if PIPELINE_RUN.search(line):
            errs.append(f"{name}:{i}: trains, bakes or runs the pipeline (ADR-0074 rule 1)")
        elif product and PYTEST.search(re.sub(r"^\s*(-\s*)?run\s*:", "", line)):
            errs.append(f"{name}:{i}: runs the test suite in CI; tests run locally (ADR-0074 rule 3)")
    return errs


def main() -> int:
    product = (ROOT / "data-pipeline").is_dir()
    errs: list[str] = []
    for wf in sorted((ROOT / ".github" / "workflows").glob("*.y*ml")):
        errs += check_workflow(wf, product)
    for e in errs:
        print(f"::error::{e}")
    if not errs:
        print("ci budget: OK")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
