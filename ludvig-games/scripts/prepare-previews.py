"""Prepare only selected visible game pages for localhost thumbnail capture.

This is not a production build. After capturing thumbnails, run build.py to
replace public with the complete, validated catalog.
"""
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build

catalog = json.loads((ROOT / "games.json").read_text())
selected = sys.argv[1:]
if not selected:
    raise SystemExit("Name the exact visible game slugs to prepare")
output = ROOT / "public"
if output.is_symlink() or not (output / ".ludvig-games-generated").is_file():
    raise SystemExit("A real generated public folder is required")
for slug in selected:
    game = next((g for g in catalog if g["slug"] == slug), None)
    if not game or game.get("hidden", False) or game["external"]:
        raise SystemExit(f"Not a visible local game: {slug}")
    source = ROOT / "source-games" / slug
    shutil.copytree(source, output / "games" / slug, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("editable", "tests", "README.md", "QA.md"))
    page = output / slug
    page.mkdir(exist_ok=True)
    (page / "index.html").write_text(build.player_page(game))
    print(f"Prepared {slug} for localhost preview capture")
