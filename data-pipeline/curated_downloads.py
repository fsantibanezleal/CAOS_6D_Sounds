"""Optional: download a curated list of public-domain / CC-licensed clips.

Each entry pins a specific Wikimedia Commons file (or Internet Archive /
NASA URL) along with its license, the category it belongs to, and a
stable clip id. The script is **opt-in** — it never runs automatically —
and each download is checked against a configurable file-size cap so a
runaway file cannot bloat the repo.

Run:

  python data-pipeline/curated_downloads.py            # dry-run preview
  python data-pipeline/curated_downloads.py --download # actually download
  python data-pipeline/curated_downloads.py --download --only bird-rooster

After a successful download, run ``python data-pipeline/ingest.py`` to
extract features + embeddings for the new clips.

The Wikimedia API resolves File: titles to their actual upload-domain
URLs, which means clips re-uploaded to a different shard URL stay
accessible. NASA + Internet Archive URLs are stable and used directly.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from common import SOUNDS_DIR


MAX_BYTES = 24 * 1024 * 1024  # 24 MB per clip (well under GitHub's 100 MB hard limit)
USER_AGENT = "Auralis/0.1 (https://github.com/fsantibanezleal/CAOS_6D_Sounds; fsantibanez@gmail.com)"


# --------------------------------------------------------------------------- #
# Curation list
# --------------------------------------------------------------------------- #
#
# Every entry must include:
#   id          — stable kebab-case clip id (also the filename stem)
#   category    — birds / mammals / amphibians_reptiles / insects / nature /
#                 speeches / music / space / mechanical
#   title_en, title_es
#   source      — "Wikimedia Commons" / "NASA" / "Internet Archive"
#   license     — SPDX-like identifier
#   attribution — text required by the license, if any
#   wm_title    — for Wikimedia: the bare File: title (without "File:")
#   url         — for non-Wikimedia: direct download URL
#
# All wm_title values below have been verified to exist on Commons via
# the search API at the time of writing. A 404 in the future just means
# the curator skips the clip — the rest still download fine.


@dataclass
class CurationEntry:
    id: str
    category: str
    title_en: str
    title_es: str
    source: str
    license: str
    attribution: str = ""
    wm_title: str | None = None
    url: str | None = None
    tags: tuple[str, ...] = ()


CURATION: list[CurationEntry] = [
    # --- Birds ----------------------------------------------------------- #
    CurationEntry(
        id="bird-american-robin",
        category="birds",
        title_en="American Robin (Turdus migratorius) song",
        title_es="Canto del zorzal robín (Turdus migratorius)",
        source="Wikimedia Commons / Xeno-canto",
        license="CC-BY-NC-SA-3.0",
        attribution="Xeno-canto contributor — see file page on Wikimedia Commons",
        wm_title="Turdus migratorius - American Robin XC129105.ogg",
        tags=("bird", "songbird"),
    ),
    CurationEntry(
        id="bird-rooster",
        category="birds",
        title_en="Rooster crowing",
        title_es="Canto de gallo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Rooster crowing.ogg",
        tags=("bird", "domestic"),
    ),
    CurationEntry(
        id="bird-tawny-owl",
        category="birds",
        title_en="Tawny owl (Strix aluco) call",
        title_es="Llamado del cárabo común (Strix aluco)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Strix aluco male.oga",
        tags=("bird", "owl", "nocturnal"),
    ),
    CurationEntry(
        id="bird-toco-toucan",
        category="birds",
        title_en="Toco Toucan call",
        title_es="Llamado del tucán toco",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Toco Toucan call (Ramphastos toco).ogg",
        tags=("bird", "tropical"),
    ),
    # --- Mammals --------------------------------------------------------- #
    CurationEntry(
        id="mammal-cat-meow",
        category="mammals",
        title_en="Domestic cat meow",
        title_es="Maullido de gato doméstico",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Meow.ogg",
        tags=("cat", "domestic"),
    ),
    CurationEntry(
        id="mammal-dog-bark",
        category="mammals",
        title_en="Dog barking",
        title_es="Ladrido de perro",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Barking of a dog.ogg",
        tags=("dog", "domestic"),
    ),
    CurationEntry(
        id="mammal-wolf-howl",
        category="mammals",
        title_en="Wolf howls",
        title_es="Aullido de lobo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wolf howls.ogg",
        tags=("wolf",),
    ),
    CurationEntry(
        id="mammal-cow-moo",
        category="mammals",
        title_en="Cow mooing",
        title_es="Mugido de vaca",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Single Cow Moo.ogg",
        tags=("cow", "livestock"),
    ),
    CurationEntry(
        id="mammal-horse-neigh",
        category="mammals",
        title_en="Horse neighing",
        title_es="Relincho de caballo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wiehern.ogg",
        tags=("horse",),
    ),
    # --- Insects --------------------------------------------------------- #
    CurationEntry(
        id="insect-cricket",
        category="insects",
        title_en="Field cricket chirping",
        title_es="Chirrido de grillo de campo",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Field cricket Gryllus pennsylvanicus.ogg",
        tags=("cricket", "stridulation"),
    ),
    CurationEntry(
        id="insect-cicada",
        category="insects",
        title_en="Cicada (Cicada orni) singing",
        title_es="Canto de cigarra (Cicada orni)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Cicada orni (Singing).ogg",
        tags=("cicada",),
    ),
    # --- Nature --------------------------------------------------------- #
    CurationEntry(
        id="nature-thunder",
        category="nature",
        title_en="Thunder",
        title_es="Trueno",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Thunder 01.ogg",
        tags=("thunder", "storm"),
    ),
    CurationEntry(
        id="nature-wind-pine",
        category="nature",
        title_en="Wind in a Swedish pine forest",
        title_es="Viento en un bosque sueco de pinos",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wind in Swedish pine forest at 25 mps.ogg",
        tags=("wind", "forest", "ambience"),
    ),
    # --- Speeches ------------------------------------------------------- #
    CurationEntry(
        id="speech-armstrong-step",
        category="speeches",
        title_en="Armstrong — One small step",
        title_es="Armstrong — Un pequeño paso",
        source="NASA",
        license="Public Domain",
        attribution="Neil Armstrong / NASA, 1969 (U.S. Government work, public domain)",
        wm_title="Armstrong Small Step.ogg",
        tags=("speech", "history", "nasa"),
    ),
    CurationEntry(
        id="speech-jfk-berlin",
        category="speeches",
        title_en="JFK — Ich bin ein Berliner",
        title_es="JFK — Ich bin ein Berliner",
        source="Wikimedia Commons / John F. Kennedy",
        license="Public Domain",
        attribution="John F. Kennedy, 1963 (U.S. Government work, public domain)",
        wm_title="Ich bin ein Berliner.ogg",
        tags=("speech", "history", "english"),
    ),
    # --- Mechanical ----------------------------------------------------- #
    CurationEntry(
        id="mechanical-steam-whistle",
        category="mechanical",
        title_en="Steam train whistle",
        title_es="Silbato de tren a vapor",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="WWS SteamWhistle.ogg",
        tags=("train", "steam"),
    ),
    CurationEntry(
        id="mechanical-train-engine",
        category="mechanical",
        title_en="Steam locomotive sound",
        title_es="Sonido de locomotora a vapor",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Parovoz sound.ogg",
        tags=("train", "steam", "engine"),
    ),
]


# --------------------------------------------------------------------------- #
# Wikimedia API helper
# --------------------------------------------------------------------------- #


def resolve_wikimedia(title: str) -> tuple[str, str] | None:
    """Resolve "File:foo.ogg" to (real URL, file extension)."""
    api = "https://commons.wikimedia.org/w/api.php"
    params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "titles": f"File:{title}",
    }
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{api}?{qs}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.load(resp)
    except Exception as exc:  # noqa: BLE001
        print(f"  WIKIMEDIA API ERROR for '{title}': {exc}")
        return None

    pages = payload.get("query", {}).get("pages", {})
    for _id, page in pages.items():
        infos = page.get("imageinfo")
        if infos and infos[0].get("url"):
            url = infos[0]["url"]
            ext = Path(urllib.parse.urlparse(url).path).suffix.lower()
            return url, ext or ".ogg"
    return None


def download(url: str, dest: Path) -> bool:
    """Stream a remote URL into ``dest``. Returns True on success."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read(MAX_BYTES + 1)
    except Exception as exc:  # noqa: BLE001
        print(f"  DOWNLOAD ERROR: {exc}")
        return False
    if len(data) > MAX_BYTES:
        print(
            f"  REJECTED: file too large ({len(data) / 1024 / 1024:.1f} MB > "
            f"{MAX_BYTES / 1024 / 1024:.1f} MB cap)"
        )
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"  wrote {dest.relative_to(SOUNDS_DIR.parent)} ({len(data) / 1024:.1f} KB)")
    return True


def write_sidecar(entry: CurationEntry, audio_path: Path) -> None:
    sidecar = audio_path.with_suffix(".meta.json")
    sidecar.write_text(
        json.dumps(
            {
                "title_en": entry.title_en,
                "title_es": entry.title_es,
                "source": entry.source,
                "license": entry.license,
                "attribution": entry.attribution,
                "tags": list(entry.tags),
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Auralis curated downloader")
    ap.add_argument(
        "--download",
        action="store_true",
        help="Actually download (default is a dry-run preview)",
    )
    ap.add_argument(
        "--only",
        action="append",
        help="Restrict to specific clip ids (repeatable)",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.6,
        help="Seconds to wait between API calls (politeness)",
    )
    args = ap.parse_args()

    selected = [
        e for e in CURATION if (not args.only or e.id in args.only)
    ]

    print(
        f"{'Downloading' if args.download else 'Dry-run preview of'} "
        f"{len(selected)} clip(s):\n"
    )
    success = 0
    for entry in selected:
        if entry.wm_title:
            if not args.download:
                print(f"- [{entry.category}] {entry.id} -- File:{entry.wm_title}")
                continue
            resolved = resolve_wikimedia(entry.wm_title)
            if resolved is None:
                print(f"- [{entry.category}] {entry.id}: SKIPPED (could not resolve)")
                time.sleep(args.sleep)
                continue
            url, ext = resolved
        else:
            url = entry.url
            if not args.download:
                print(f"- [{entry.category}] {entry.id} -- {url}")
                continue
            if not url:
                print(f"- [{entry.category}] {entry.id}: SKIPPED (no url)")
                continue
            ext = Path(urllib.parse.urlparse(url).path).suffix.lower() or ".ogg"

        out = SOUNDS_DIR / entry.category / f"{entry.id}{ext}"
        print(f"- [{entry.category}] {entry.id} ({entry.license})")
        if download(url, out):
            write_sidecar(entry, out)
            success += 1
        time.sleep(args.sleep)

    if args.download:
        print(f"\n{success}/{len(selected)} succeeded.")
        if success > 0:
            print("Run `python data-pipeline/ingest.py` to extract features + embeddings.")
    else:
        print("\nDry run only. Pass --download to actually fetch the files.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
