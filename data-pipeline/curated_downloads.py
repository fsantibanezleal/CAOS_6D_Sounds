"""Optional: download a curated list of public-domain / CC-licensed clips.

Each entry pins a specific Wikimedia Commons file (or Internet Archive /
NASA URL) along with its license, the category it belongs to, an
optional subcategory, and a stable clip id. The script is **opt-in** —
it never runs automatically — and each download is checked against a
configurable file-size cap so a runaway file cannot bloat the repo.

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
import os
from dataclasses import dataclass
from pathlib import Path

from common import SOUNDS_DIR


MAX_BYTES = 24 * 1024 * 1024  # 24 MB per clip (well under GitHub's 100 MB hard limit)

# Wikimedia's User-Agent policy asks for a project URL and a contact, so
# downstream operators can reach the maintainer if a script misbehaves.
# The repo URL satisfies the policy on its own (issues are a valid contact
# channel); set AURALIS_MAINTAINER_EMAIL to attach a personal email if you
# want to be paged directly.
_contact = os.environ.get("AURALIS_MAINTAINER_EMAIL", "").strip()
USER_AGENT = (
    "Auralis/0.1 (https://github.com/fsantibanezleal/CAOS_6D_Sounds"
    + (f"; {_contact}" if _contact else "")
    + ")"
)


@dataclass
class CurationEntry:
    id: str
    category: str
    subcategory: str  # finer grouping for the UI selector
    title_en: str
    title_es: str
    source: str
    license: str
    attribution: str = ""
    wm_title: str | None = None
    url: str | None = None
    tags: tuple[str, ...] = ()


# --------------------------------------------------------------------------- #
# Curation list — ~60 verified entries
# --------------------------------------------------------------------------- #
CURATION: list[CurationEntry] = [
    # ===================================================================== #
    # BIRDS
    # ===================================================================== #
    CurationEntry(
        id="bird-american-robin",
        category="birds",
        subcategory="songbirds",
        title_en="American Robin (Turdus migratorius) song",
        title_es="Canto del zorzal robín (Turdus migratorius)",
        source="Wikimedia Commons / Xeno-canto",
        license="CC-BY-NC-SA-3.0",
        attribution="Xeno-canto contributor — see file page on Wikimedia Commons",
        wm_title="Turdus migratorius - American Robin XC129105.ogg",
        tags=("songbird",),
    ),
    CurationEntry(
        id="bird-blackbird",
        category="birds",
        subcategory="songbirds",
        title_en="Common Blackbird (Turdus merula) song",
        title_es="Canto del mirlo común (Turdus merula)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Common Blackbird song (Turdus merula).ogg",
        tags=("songbird",),
    ),
    CurationEntry(
        id="bird-nightingale",
        category="birds",
        subcategory="songbirds",
        title_en="Common Nightingale song",
        title_es="Canto del ruiseñor común",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Common Nightingale's song 1.ogg",
        tags=("songbird",),
    ),
    CurationEntry(
        id="bird-house-sparrow",
        category="birds",
        subcategory="songbirds",
        title_en="House Sparrow chirping",
        title_es="Gorrión común piando",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="House Sparrows chirping.ogg",
        tags=("songbird",),
    ),
    CurationEntry(
        id="bird-rooster",
        category="birds",
        subcategory="domestic",
        title_en="Rooster crowing",
        title_es="Canto de gallo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Rooster crowing.ogg",
        tags=("domestic",),
    ),
    CurationEntry(
        id="bird-tawny-owl",
        category="birds",
        subcategory="raptors",
        title_en="Tawny owl (Strix aluco) call",
        title_es="Llamado del cárabo común (Strix aluco)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Strix aluco male.oga",
        tags=("owl", "nocturnal"),
    ),
    CurationEntry(
        id="bird-toco-toucan",
        category="birds",
        subcategory="tropical",
        title_en="Toco Toucan call",
        title_es="Llamado del tucán toco",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Toco Toucan call (Ramphastos toco).ogg",
        tags=("tropical",),
    ),
    CurationEntry(
        id="bird-kingfisher",
        category="birds",
        subcategory="waterfowl",
        title_en="Belted Kingfisher call",
        title_es="Llamado del martín pescador norteño",
        source="Wikimedia Commons / Xeno-canto",
        license="CC-BY-NC-SA-3.0",
        attribution="Xeno-canto contributor",
        wm_title="Megaceryle alcyon - Belted Kingfisher XC132872.ogg",
        tags=("water",),
    ),
    CurationEntry(
        id="bird-kookaburra",
        category="birds",
        subcategory="tropical",
        title_en="Laughing Kookaburra call",
        title_es="Llamado del kookaburra",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="LaughingKookaburra.ogg",
        tags=("kookaburra",),
    ),
    CurationEntry(
        id="bird-cuckoo",
        category="birds",
        subcategory="songbirds",
        title_en="Cuckoo singing on a tree",
        title_es="Cuco cantando en un árbol",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Cuckoo singing on a tree.ogg",
        tags=("cuckoo",),
    ),
    CurationEntry(
        id="bird-peacock",
        category="birds",
        subcategory="tropical",
        title_en="Peacock call (Pavo cristatus)",
        title_es="Llamado de pavo real (Pavo cristatus)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Pavo cristatus (call).ogg",
        tags=("tropical",),
    ),
    CurationEntry(
        id="bird-woodpecker",
        category="birds",
        subcategory="woodpeckers",
        title_en="Great Spotted Woodpecker drumming",
        title_es="Pico picapinos tamborileando",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Great Spotted Woodpecker drum.ogg",
        tags=("woodpecker", "percussive"),
    ),
    CurationEntry(
        id="bird-magpie-robin",
        category="birds",
        subcategory="songbirds",
        title_en="Oriental Magpie-Robin song",
        title_es="Canto del shama oriental",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Magpie robin.ogg",
        tags=("songbird",),
    ),
    # NOTE: `bird-anna-hummingbird` (Calypte anna XC109852) — Skeleton
    # container; libsndfile crash. Tried alternative XC files but
    # all the Anna's hummingbird recordings on Wikimedia have the
    # same issue. Removed.
    CurationEntry(
        id="bird-northern-raven",
        category="birds",
        subcategory="corvids",
        title_en="Northern raven (Corvus corax)",
        title_es="Cuervo común (Corvus corax)",
        source="Wikimedia Commons / Xeno-canto",
        license="CC-BY-NC-SA-3.0",
        attribution="Xeno-canto contributor",
        wm_title="Corvus corax - Northern Raven - XC101590.ogg",
        tags=("raven", "corvid"),
    ),
    CurationEntry(
        id="bird-wild-turkey",
        category="birds",
        subcategory="domestic",
        title_en="Wild turkey gobble",
        title_es="Llamado del pavo salvaje",
        source="Wikimedia Commons / Xeno-canto",
        license="CC-BY-NC-SA-3.0",
        attribution="Xeno-canto contributor",
        wm_title="Meleagris gallopavo - Wild Turkey XC134155.ogg",
        tags=("turkey",),
    ),
    CurationEntry(
        id="bird-mallard-duck",
        category="birds",
        subcategory="waterfowl",
        title_en="Mallard duck quack",
        title_es="Graznido de pato real",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Pekin duck & mallard.ogg",
        tags=("duck", "waterfowl"),
    ),

    # ===================================================================== #
    # MAMMALS
    # ===================================================================== #
    CurationEntry(
        id="mammal-cat-meow",
        category="mammals",
        subcategory="domestic",
        title_en="Domestic cat meow",
        title_es="Maullido de gato doméstico",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Meow.ogg",
        tags=("domestic", "cat"),
    ),
    CurationEntry(
        id="mammal-dog-bark",
        category="mammals",
        subcategory="domestic",
        title_en="Dog barking",
        title_es="Ladrido de perro",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Barking of a dog.ogg",
        tags=("domestic", "dog"),
    ),
    CurationEntry(
        id="mammal-wolf-howl",
        category="mammals",
        subcategory="canids",
        title_en="Wolf howls",
        title_es="Aullido de lobo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wolf howls.ogg",
        tags=("wild",),
    ),
    CurationEntry(
        id="mammal-cow-moo",
        category="mammals",
        subcategory="livestock",
        title_en="Cow mooing",
        title_es="Mugido de vaca",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Single Cow Moo.ogg",
        tags=("livestock",),
    ),
    CurationEntry(
        id="mammal-horse-neigh",
        category="mammals",
        subcategory="livestock",
        title_en="Horse neighing",
        title_es="Relincho de caballo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wiehern.ogg",
        tags=("livestock",),
    ),
    CurationEntry(
        id="mammal-sheep-bleat",
        category="mammals",
        subcategory="livestock",
        title_en="Sheep bleating",
        title_es="Balido de oveja",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Sheep bleating.ogg",
        tags=("livestock",),
    ),
    CurationEntry(
        id="mammal-pig-grunt",
        category="mammals",
        subcategory="livestock",
        title_en="Pig grunting",
        title_es="Gruñido de cerdo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Pig grunt - Erdie.ogg",
        tags=("livestock",),
    ),
    CurationEntry(
        id="mammal-elephant-trumpet",
        category="mammals",
        subcategory="wild",
        title_en="Elephant trumpeting",
        title_es="Barrito de elefante",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Elephant voice - trumpeting.ogg",
        tags=("wild",),
    ),
    CurationEntry(
        id="mammal-bear-growl",
        category="mammals",
        subcategory="wild",
        title_en="Bear growling",
        title_es="Gruñido de oso",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Bear growl.ogg",
        tags=("wild",),
    ),
    CurationEntry(
        id="mammal-howler-monkey",
        category="mammals",
        subcategory="primates",
        title_en="Mantled Howler Monkey call",
        title_es="Aullido del mono aullador negro",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Mantled Howler Monkey (Alouatta palliata) (W ALOUATTA PALLIATA R1 C2).ogg",
        tags=("primate",),
    ),
    CurationEntry(
        id="mammal-deer-call",
        category="mammals",
        subcategory="wild",
        title_en="Red deer roaring (rut)",
        title_es="Berreo del ciervo común",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Hirsch roehrt.ogg",
        tags=("wild",),
    ),
    # NOTE: `mammal-goat-bleat` removed — Skeleton container, libsndfile crash.
    CurationEntry(
        id="mammal-bat-echolocation",
        category="mammals",
        subcategory="wild",
        title_en="Bat echolocation calls",
        title_es="Ecolocalización de murciélagos",
        source="Wikimedia Commons",
        license="CC-BY-3.0",
        attribution="Yannick Dauby (CC-BY)",
        wm_title="Yannick Dauby - Bats echolocation (CC by).ogg",
        tags=("wild", "ultrasonic"),
    ),
    CurationEntry(
        id="mammal-humpback-whale",
        category="mammals",
        subcategory="marine",
        title_en="Humpback whale song",
        title_es="Canto de ballena jorobada",
        source="Wikimedia Commons / PLOS",
        license="CC-BY-4.0",
        attribution="From a PLOS ONE supplement (CC-BY)",
        wm_title="Humpback-Whale-Song-and-Foraging-Behavior-on-an-Antarctic-Feeding-Ground-pone.0051214.s002.oga",
        tags=("marine", "cetacean"),
    ),
    CurationEntry(
        id="mammal-killer-whale",
        category="mammals",
        subcategory="marine",
        title_en="Killer whale (orca) calls",
        title_es="Llamados de orca",
        source="Wikimedia Commons",
        license="Public Domain",
        attribution="NOAA / Wikimedia Commons (public domain)",
        wm_title="Killer whale residents broadband.ogg",
        tags=("marine", "cetacean", "orca"),
    ),

    # ===================================================================== #
    # AMPHIBIANS / REPTILES
    # ===================================================================== #
    CurationEntry(
        id="amphibian-tree-frog-hyla",
        category="amphibians_reptiles",
        subcategory="frogs",
        title_en="European tree frog (Hyla arborea) call",
        title_es="Llamado de la rana de San Antonio (Hyla arborea)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Hyla arborea (HS).ogg",
        tags=("frog",),
    ),
    CurationEntry(
        id="amphibian-common-toad",
        category="amphibians_reptiles",
        subcategory="toads",
        title_en="Common toad (Bufo bufo) call",
        title_es="Llamado del sapo común",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Common Toad (Bufo bufo) (W BUFO BUFO R3 C2).ogg",
        tags=("toad",),
    ),
    CurationEntry(
        id="amphibian-frog-chorus",
        category="amphibians_reptiles",
        subcategory="ambient",
        title_en="Night chorus of frogs and toads",
        title_es="Coro nocturno de ranas y sapos",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Night Chorus of Frogs and Toads in Niger Delta.ogg",
        tags=("frog", "toad", "ambient"),
    ),
    CurationEntry(
        id="reptile-alligator",
        category="amphibians_reptiles",
        subcategory="reptiles",
        title_en="American alligator bellow",
        title_es="Bramido de aligátor americano",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Alligatorbellowedit.ogg",
        tags=("reptile",),
    ),
    CurationEntry(
        id="amphibian-bufo-bufo-call",
        category="amphibians_reptiles",
        subcategory="toads",
        title_en="Common toad (Bufo bufo) call",
        title_es="Llamado del sapo común (Bufo bufo)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Bufo bufo call1.ogg",
        tags=("toad",),
    ),
    CurationEntry(
        id="amphibian-bufo-viridis-mating",
        category="amphibians_reptiles",
        subcategory="toads",
        title_en="European green toad mating call (Bufo viridis)",
        title_es="Llamado de apareamiento del sapo verde",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Bufo-viridis-mating-call.ogg",
        tags=("toad", "mating"),
    ),
    CurationEntry(
        id="amphibian-spring-peeper",
        category="amphibians_reptiles",
        subcategory="frogs",
        title_en="Spring peeper (Pseudacris crucifer)",
        title_es="Rana primavera silbadora (Pseudacris crucifer)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Spring Peeper (Pseudacris crucifer).ogg",
        tags=("frog", "peeper"),
    ),
    CurationEntry(
        id="amphibian-cope-gray-treefrog",
        category="amphibians_reptiles",
        subcategory="frogs",
        title_en="Cope's gray tree frog (Hyla chrysoscelis)",
        title_es="Rana arborícola gris de Cope (Hyla chrysoscelis)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Hyla chrysoscelis call.ogg",
        tags=("frog", "tree-frog"),
    ),
    CurationEntry(
        id="reptile-rattlesnake",
        category="amphibians_reptiles",
        subcategory="reptiles",
        title_en="Rattlesnake rattle",
        title_es="Cascabel de serpiente cascabel",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Rattlesnake.ogg",
        tags=("snake", "rattle"),
    ),
    CurationEntry(
        id="reptile-tokay-gecko",
        category="amphibians_reptiles",
        subcategory="reptiles",
        title_en="Tokay gecko mating call (Gekko gecko)",
        title_es="Llamado de apareamiento del gecko tokay",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Mating call of a male Tokay gecko (Gekko gecko).ogg",
        tags=("gecko", "lizard"),
    ),

    # ===================================================================== #
    # INSECTS
    # ===================================================================== #
    CurationEntry(
        id="insect-cricket",
        category="insects",
        subcategory="orthoptera",
        title_en="Field cricket chirping",
        title_es="Chirrido de grillo de campo",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Field cricket Gryllus pennsylvanicus.ogg",
        tags=("cricket",),
    ),
    CurationEntry(
        id="insect-cicada",
        category="insects",
        subcategory="hemiptera",
        title_en="Cicada (Cicada orni) singing",
        title_es="Canto de cigarra (Cicada orni)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Cicada orni (Singing).ogg",
        tags=("cicada",),
    ),
    CurationEntry(
        id="insect-cicada-chorus",
        category="insects",
        subcategory="hemiptera",
        title_en="Chorus of cicadas",
        title_es="Coro de cigarras",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Chorus Cicada singing.ogg",
        tags=("cicada", "ambient"),
    ),
    CurationEntry(
        id="insect-bumblebee",
        category="insects",
        subcategory="hymenoptera",
        title_en="Bumblebee buzz (Bombus)",
        title_es="Zumbido de abejorro (Bombus)",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Bombus buzz.ogg",
        tags=("bee", "bumblebee"),
    ),
    CurationEntry(
        id="insect-honeybee-hive",
        category="insects",
        subcategory="hymenoptera",
        title_en="Honeybee hive ambience",
        title_es="Ambiente de colmena de abejas",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Honeybee-hive.ogg",
        tags=("bee", "hive", "ambient"),
    ),
    # NOTE: `insect-tree-cricket` removed — Wikimedia ships it as
    # Ogg/Theora video, libsndfile cannot read it. See
    # `wip/auralis/known-issues.md` in CAOS_MANAGE.

    # ===================================================================== #
    # NATURE
    # ===================================================================== #
    CurationEntry(
        id="nature-thunder",
        category="nature",
        subcategory="weather",
        title_en="Thunder",
        title_es="Trueno",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Thunder 01.ogg",
        tags=("thunder", "storm"),
    ),
    # NOTE: `nature-rain-thunder` removed — Skeleton v4.0 container
    # crashes libsndfile (STATUS_STACK_OVERFLOW on Windows).
    CurationEntry(
        id="nature-wind-pine",
        category="nature",
        subcategory="ambient",
        title_en="Wind in a Swedish pine forest",
        title_es="Viento en un bosque sueco de pinos",
        source="Wikimedia Commons",
        license="CC-BY-SA-4.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Wind in Swedish pine forest at 25 mps.ogg",
        tags=("wind", "forest"),
    ),
    # NOTE: `nature-mountain-stream` (>24 MB) and `nature-shallow-river`
    # (Skeleton container, libsndfile crash) removed.
    CurationEntry(
        id="nature-ice-cracking",
        category="nature",
        subcategory="weather",
        title_en="Ice cracking",
        title_es="Hielo crujiendo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Sound of cracking ice.ogg",
        tags=("ice", "winter"),
    ),

    # ===================================================================== #
    # SPEECHES (US gov work — public domain)
    # ===================================================================== #
    CurationEntry(
        id="speech-armstrong-step",
        category="speeches",
        subcategory="us-historical",
        title_en="Armstrong — One small step",
        title_es="Armstrong — Un pequeño paso",
        source="NASA",
        license="Public Domain",
        attribution="Neil Armstrong / NASA, 1969 (U.S. Government work)",
        wm_title="Armstrong Small Step.ogg",
        tags=("history", "nasa"),
    ),
    CurationEntry(
        id="speech-jfk-berlin",
        category="speeches",
        subcategory="us-historical",
        title_en="JFK — Ich bin ein Berliner",
        title_es="JFK — Ich bin ein Berliner",
        source="Wikimedia Commons / John F. Kennedy",
        license="Public Domain",
        attribution="John F. Kennedy, 1963 (U.S. Government work)",
        wm_title="Ich bin ein Berliner.ogg",
        tags=("history",),
    ),
    CurationEntry(
        id="speech-fdr-pearl-harbor",
        category="speeches",
        subcategory="us-historical",
        title_en="FDR — Day of Infamy (Pearl Harbor)",
        title_es="FDR — Día de la Infamia (Pearl Harbor)",
        source="Wikimedia Commons",
        license="Public Domain",
        attribution="Franklin D. Roosevelt, 1941 (U.S. Government work)",
        wm_title="FDR's Speech to the Congress regarding the naval attack on Pearl Harbor.ogg",
        tags=("history",),
    ),

    # ===================================================================== #
    # MUSIC
    # ===================================================================== #
    CurationEntry(
        id="music-vivaldi-spring-allegro",
        category="music",
        subcategory="classical",
        title_en="Vivaldi — Four Seasons, Spring (Allegro)",
        title_es="Vivaldi — Las Cuatro Estaciones, Primavera (Allegro)",
        source="Wikimedia Commons",
        license="CC-BY-3.0",
        attribution="John Harrison violin (CC-BY)",
        wm_title="Vivaldi - Four Seasons 1 Spring mvt 1 Allegro - John Harrison violin.oga",
        tags=("classical", "violin", "baroque"),
    ),
    CurationEntry(
        id="music-vivaldi-summer-presto",
        category="music",
        subcategory="classical",
        title_en="Vivaldi — Four Seasons, Summer (Presto)",
        title_es="Vivaldi — Las Cuatro Estaciones, Verano (Presto)",
        source="Wikimedia Commons",
        license="CC-BY-3.0",
        attribution="John Harrison violin (CC-BY)",
        wm_title="Vivaldi - Four Seasons 2 Summer mvt 3 Presto - John Harrison violin.oga",
        tags=("classical", "violin", "baroque"),
    ),
    CurationEntry(
        id="music-bach-cello-prelude",
        category="music",
        subcategory="classical",
        title_en="Bach — Cello Suite No.1 (Prelude)",
        title_es="Bach — Suite para violonchelo Nº1 (Preludio)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="John Michel cello (CC-BY-SA)",
        wm_title="JOHN MICHEL CELLO-J S BACH CELLO SUITE 1 in G Prelude.ogg",
        tags=("classical", "cello", "baroque"),
    ),
    CurationEntry(
        id="music-bach-violin-allemanda",
        category="music",
        subcategory="classical",
        title_en="Bach — Partita No.2 (Allemanda)",
        title_es="Bach — Partita Nº2 (Allemanda)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Partita No.2 J.S.Bach (Allemanda).ogg",
        tags=("classical", "violin", "baroque"),
    ),
    CurationEntry(
        id="music-gregorian-chant",
        category="music",
        subcategory="vocal",
        title_en="Gregorian chant — Rorate Caeli",
        title_es="Canto gregoriano — Rorate Caeli",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Rorate Caeli ~ Gregorian Chant.ogg",
        tags=("vocal", "sacred"),
    ),
    CurationEntry(
        id="music-jazz-violin-solo",
        category="music",
        subcategory="jazz",
        title_en="Jazz violin solo",
        title_es="Solo de violín jazz",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="00 Jazz Violin Solo.ogg",
        tags=("jazz", "violin"),
    ),
    CurationEntry(
        id="music-music-box-rag",
        category="music",
        subcategory="vintage",
        title_en="Luckey Roberts — The Music Box Rag (1914)",
        title_es="Luckey Roberts — The Music Box Rag (1914)",
        source="Wikimedia Commons / Public Domain",
        license="Public Domain",
        attribution="Luckey Roberts, 1914 (public domain)",
        wm_title="Luckey Roberts - The Music Box Rag (1914).ogg",
        tags=("ragtime", "vintage"),
    ),
    CurationEntry(
        id="music-darkies-dream-banjo",
        category="music",
        subcategory="vintage",
        title_en="Banjo — The Darkies Dream (1898, public domain)",
        title_es="Banjo — The Darkies Dream (1898, dominio público)",
        source="Wikimedia Commons",
        license="Public Domain",
        attribution="1898 recording (public domain)",
        wm_title="The Darkies Dream 1898.ogg",
        tags=("banjo", "vintage", "ragtime"),
    ),
    CurationEntry(
        id="music-didgeridoo",
        category="music",
        subcategory="world",
        title_en="Didgeridoo solo",
        title_es="Solo de didgeridoo",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Didgeridoo sound.ogg",
        tags=("world", "drone"),
    ),
    CurationEntry(
        id="music-pentatonic-c",
        category="music",
        subcategory="reference",
        title_en="Pentatonic scale (C major)",
        title_es="Escala pentatónica (Do mayor)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Pentatonic Scale C major.ogg",
        tags=("scale", "reference"),
    ),
    CurationEntry(
        id="music-rock-drum-beat",
        category="music",
        subcategory="modern",
        title_en="Rock drum beat (hi-hat)",
        title_es="Patrón de batería rock (hi-hat)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Rock beat hi hat.ogg",
        tags=("drums", "rhythm"),
    ),
    CurationEntry(
        id="music-bach-flute-allemande",
        category="music",
        subcategory="classical",
        title_en="Bach — Partita for Solo Flute, Allemande",
        title_es="Bach — Partita para flauta sola, Allemande",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Bach - Partita For Solo Flute - Modern Flute - 1. Allemande.ogg",
        tags=("classical", "flute", "baroque"),
    ),
    CurationEntry(
        id="music-violin-pizzicato-scale",
        category="music",
        subcategory="reference",
        title_en="Violin pizzicato (G major scale)",
        title_es="Pizzicato de violín (escala Sol mayor)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Violin pizzicato on G major scale.ogg",
        tags=("violin", "scale", "pizzicato", "reference"),
    ),

    # ===================================================================== #
    # SPACE
    # ===================================================================== #
    CurationEntry(
        id="space-apollo-13-problem",
        category="space",
        subcategory="apollo",
        title_en="Apollo 13 — \"We've had a problem\"",
        title_es="Apollo 13 — \"Hemos tenido un problema\"",
        source="NASA",
        license="Public Domain",
        attribution="NASA, 1970 (U.S. Government work)",
        wm_title="Apollo13-wehaveaproblem edit 1.ogg",
        tags=("nasa", "apollo"),
    ),
    CurationEntry(
        id="space-apollo-8-genesis",
        category="space",
        subcategory="apollo",
        title_en="Apollo 8 — Genesis reading",
        title_es="Apollo 8 — Lectura del Génesis",
        source="NASA",
        license="Public Domain",
        attribution="NASA, 1968 (U.S. Government work)",
        wm_title="Apollo 8 genesis reading.ogg",
        tags=("nasa", "apollo"),
    ),
    CurationEntry(
        id="space-apollo-17-strolling",
        category="space",
        subcategory="apollo",
        title_en="Apollo 17 — Strolling on the Moon",
        title_es="Apollo 17 — Paseando por la Luna",
        source="NASA",
        license="Public Domain",
        attribution="NASA, 1972 (U.S. Government work)",
        wm_title="Apollo 17 - Strolling on the moon one day.ogg",
        tags=("nasa", "apollo"),
    ),

    # ===================================================================== #
    # MECHANICAL
    # ===================================================================== #
    CurationEntry(
        id="mechanical-steam-whistle",
        category="mechanical",
        subcategory="trains",
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
        subcategory="trains",
        title_en="Steam locomotive sound",
        title_es="Sonido de locomotora a vapor",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Parovoz sound.ogg",
        tags=("train", "steam", "engine"),
    ),
    CurationEntry(
        id="mechanical-grandfather-clock",
        category="mechanical",
        subcategory="clocks",
        title_en="Grandfather clock ticking",
        title_es="Reloj de pie haciendo tic-tac",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Grandfather Clock Ticking.ogg",
        tags=("clock", "ticking"),
    ),
    CurationEntry(
        id="mechanical-typewriter",
        category="mechanical",
        subcategory="office",
        title_en="Typewriter",
        title_es="Máquina de escribir",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="WWS Typewriter.ogg",
        tags=("typewriter", "office"),
    ),
    CurationEntry(
        id="mechanical-doorbell-ding-dong",
        category="mechanical",
        subcategory="household",
        title_en="Doorbell ding-dong",
        title_es="Timbre ding-dong",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Doorbell-classic-dingdong.ogg",
        tags=("doorbell", "household"),
    ),
    # NOTE: `mechanical-helicopter` removed — Wikimedia ships it as
    # Theora video container; libsndfile cannot read it.
    CurationEntry(
        id="mechanical-car-horn-doppler",
        category="mechanical",
        subcategory="vehicles",
        title_en="Car horn (Doppler effect)",
        title_es="Bocina de auto (efecto Doppler)",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Speeding-car-horn doppler effect sample.ogg",
        tags=("car", "doppler"),
    ),
    CurationEntry(
        id="mechanical-lawnmower",
        category="mechanical",
        subcategory="vehicles",
        title_en="Lawnmower",
        title_es="Cortacésped",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="WWS Lawnmower.ogg",
        tags=("engine", "garden"),
    ),
    CurationEntry(
        id="mechanical-alarm-clock",
        category="mechanical",
        subcategory="clocks",
        title_en="Mechanical alarm clock ringing",
        title_es="Despertador mecánico sonando",
        source="Wikimedia Commons",
        license="CC-BY-SA-3.0",
        attribution="Wikimedia Commons contributors",
        wm_title="Alarmclock-mechanical.ogg",
        tags=("alarm", "clock", "ring"),
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
        with urllib.request.urlopen(req, timeout=60) as resp:
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
                "subcategory": entry.subcategory,
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
        "--skip-existing",
        action="store_true",
        help="Skip clips that already have an audio file under data/sounds/",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.5,
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
    skipped = 0
    for entry in selected:
        # Skip if --skip-existing and an audio file already exists for this id
        if args.skip_existing:
            existing = sorted(
                (SOUNDS_DIR / entry.category).glob(f"{entry.id}.*")
            )
            if any(p.suffix.lower() in {".ogg", ".oga", ".opus"} for p in existing):
                print(f"- [{entry.category}] {entry.id}: already present, skipping")
                skipped += 1
                continue

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
        print(f"- [{entry.category}/{entry.subcategory}] {entry.id} ({entry.license})")
        if download(url, out):
            write_sidecar(entry, out)
            success += 1
        time.sleep(args.sleep)

    if args.download:
        print(f"\n{success}/{len(selected) - skipped} succeeded ({skipped} skipped).")
        if success > 0:
            print("Run `python data-pipeline/ingest.py` to extract features + embeddings.")
    else:
        print("\nDry run only. Pass --download to actually fetch the files.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.exit(main())
