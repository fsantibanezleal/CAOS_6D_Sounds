"""One-off helper: search Wikimedia Commons for audio files.

Run as ``python data-pipeline/wm_search.py "term1" "term2" ...`` to print up
to 6 candidate file titles per term. The output is what we paste into
``curated_downloads.py``.

Stays small so it can be invoked ad-hoc during library curation.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = (
    "Auralis/0.1 (https://github.com/fsantibanezleal/CAOS_6D_Sounds; "
    "fsantibanez@gmail.com)"
)


def search(query: str, limit: int = 6) -> list[str]:
    qs = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": f"{query} .ogg",
            "srnamespace": 6,  # File: namespace
            "srlimit": limit,
        }
    )
    req = urllib.request.Request(
        f"{API}?{qs}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.load(resp)
    hits = payload.get("query", {}).get("search", [])
    titles = []
    for hit in hits:
        t = hit["title"]
        if t.endswith((".ogg", ".oga", ".opus")):
            titles.append(t)
    return titles


def main() -> int:
    queries = sys.argv[1:]
    if not queries:
        print(
            "usage: python data-pipeline/wm_search.py \"<query1>\" \"<query2>\" ...",
            file=sys.stderr,
        )
        return 1
    for query in queries:
        print(f"\n== {query} ==")
        try:
            for title in search(query):
                print(f"  {title}")
            time.sleep(0.5)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERR {exc}")
            time.sleep(2)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
