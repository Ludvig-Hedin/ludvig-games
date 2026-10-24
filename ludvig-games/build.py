"""Build the catalog and isolated game pages using only the standard library."""
import html
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "public"
ORIGIN = "https://games.ludvighedin.com"
# Cookie-free Cloudflare Web Analytics for the hub pages and the full-screen games at /<slug>/. The token is public by design.
ANALYTICS = """<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "118fef9f1df14c9884feec8d298b6afd"}'></script>"""


def escape(value):
    return html.escape(str(value), quote=True)


FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap">"""
# Owner rule (2026-10-23): no long-press selection or callouts and no double-tap zoom on phones; form fields stay usable.
TOUCH_STYLE = ("<style>html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;"
               "-webkit-tap-highlight-color:transparent}html{touch-action:manipulation}"
               "input,textarea,select,[contenteditable],[contenteditable] *{-webkit-user-select:text;user-select:text;"
               "-webkit-touch-callout:default}</style>")
AUTHOR = {"@type": "Person", "name": "Ludvig Hedin", "url": "https://www.ludvighedin.com"}
SITE_DESCRIPTION = "Free experimental browser games made by Ludvig Hedin. No accounts, no installs: pick a game and play."
# Obvious genres only; games that match nothing get no genre.
GENRES = [(r"\b(race|races|racing|kart|karts)\b", "Racing"), (r"\brhythm\b|\bto the beat\b", "Rhythm"),
          (r"\btrivia\b", "Trivia"), (r"\bguess\b", "Puzzle"), (r"\bshooter\b", "Shooter"),
          (r"\btowers\b", "Tower defense"), (r"\bfly a\b|\bflight\b", "Flight simulation")]


def escape(value):
    return html.escape(str(value), quote=True)


def jsonld(value):
    return f'<script type="application/ld+json">{script_json(value)}</script>'


def document(title, description, path, body, image=None, scripts=(), structured=None):
    """A hub page (catalog, My records, 404) in the dark portfolio style."""
    script = "".join(f'<script src="{src}" defer></script>' for src in scripts)
    share_image = f'<meta property="og:image" content="{ORIGIN}{image}">' if image else ""
    twitter_card = "summary_large_image" if image else "summary"
    data = jsonld(structured) if structured else ""
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  {TOUCH_STYLE}
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#080808">
  <meta name="color-scheme" content="dark">
  <title>{escape(title)}</title>
  <meta name="description" content="{escape(description)}">
  <link rel="canonical" href="{ORIGIN}{path}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Ludvig Games">
  <meta property="og:title" content="{escape(title)}">
  <meta property="og:description" content="{escape(description)}">
  <meta property="og:url" content="{ORIGIN}{path}">
  {share_image}
  <meta name="twitter:card" content="{twitter_card}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  {FONTS}
  <link rel="stylesheet" href="/assets/site.css">
  {data}
  {script}
  {ANALYTICS}
</head>
<body>{body}</body>
</html>'''


def player_range(players):
    """(lowest, highest) from "1 player", "1–4 players", "2–12 players"."""
    match = re.match(r"\s*(\d+)(?:\s*[–-]\s*(\d+))?", players or "")
    if not match:
        return (1, 1)
    low = int(match.group(1))
    return (low, int(match.group(2) or low))


# The Mac app (desktop/ in the games repo). A fixed asset name, so this link always gets the newest release.
MAC_DOWNLOAD = "https://github.com/Ludvig-Hedin/ludvig-games/releases/latest/download/Ludvig-Games-mac-arm64.dmg"


def masthead():
    return f'''<header class="masthead">
    <a class="wordmark" href="/">Ludvig Games</a>
    <nav class="masthead-nav" aria-label="Site"><a class="nav-button" href="/me/">My records</a><a class="nav-button nav-button-primary" href="{MAC_DOWNLOAD}">Download for Mac</a></nav>
  </header>'''


FOOTER = '<footer class="footer">© 2026 Ludvig Hedin</footer>'


def multiplayer(game):
    """2+ players: "players" starts with a range ("1–4") or a number above 1."""
    return player_range(game["players"])[1] > 1


def alternate_name(game):
    former = game.get("formerName")
    return former if isinstance(former, str) and former.strip().lower() != game["name"].strip().lower() else None


def game_card(game, position):
    name = escape(game["name"])
    external = game["external"]
    href = external or f'/{game["slug"]}/'
    attrs = ' target="_blank" rel="noopener"' if external else ""
    load = 'fetchpriority="high"' if position < 3 else 'loading="lazy"'
    if game.get("preview", True):
        preview = f'<img class="card-image" src="/assets/previews/{game["slug"]}.webp" alt="{name} gameplay screenshot" width="960" height="600" {load} decoding="async">'
    else:
        preview = '<div class="card-image card-image-empty" aria-hidden="true"></div>'
    # Only a tiny player count for multiplayer games; no device text.
    meta = [game["players"]] if multiplayer(game) else []
    if game["paused"]:
        meta.append("Paused")
    meta_line = f'<p class="card-meta">{escape(" · ".join(meta))}</p>' if meta else ""
    mark = '<span class="card-external" aria-hidden="true"> ↗</span><span class="visually-hidden"> (opens in a new tab)</span>' if external else ""
    search = " ".join(str(v) for v in (game["name"], game.get("formerName") or "", game["description"], game.get("category") or "")).lower()
    data = (f' data-search="{escape(search)}" data-players="{"2" if multiplayer(game) else "1"}"'
            f' data-dims="{escape((game.get("dims") or "").lower())}" data-category="{escape(category_group(game))}"'
            f' data-name="{escape(game["name"].lower())}" data-order="{position}"')
    return f'''<article class="card"{data}>
  <a class="card-link" href="{escape(href)}"{attrs}>
    {preview}
    <h3 class="card-name">{name}{mark}</h3>
    <p class="card-line">{escape(game['description'])}</p>
    {meta_line}
  </a>
</article>'''


# Owner decision 24 Oct 2026: far fewer category filters. Each game keeps its own category in games.json;
# the catalog groups them under these broader names, in this order.
CATEGORY_GROUPS = {
    "Action": ["Action", "Fighting", "Shooter", "Stealth"],
    "Arcade": ["Arcade", "Platformer", "Runner", "Rhythm", "Music", "Flight"],
    "Sports & racing": ["Sports", "Racing"],
    "Puzzle": ["Puzzle", "Physics", "Trivia"],
    "Board & cards": ["Board", "Cards", "Strategy"],
    "Party": ["Party"],
    "Adventure": ["Adventure", "Open world", "Horror"],
    "Chill": ["Chill", "Idle", "Sandbox"],
}
GROUP_OF = {name: group for group, names in CATEGORY_GROUPS.items() for name in names}


def category_group(game):
    return GROUP_OF.get(game.get("category") or "", "")


def categories(games):
    """Category groups that have games, in CATEGORY_GROUPS order."""
    used = {category_group(game) for game in games}
    return [group for group in CATEGORY_GROUPS if group in used]


def filter_bar(games):
    """Search and four dropdowns: players, 2D/3D, category and order. Hidden until hub.js runs, so without
    JavaScript every game is simply listed."""
    option = lambda value, label: f'<option value="{escape(value)}">{escape(label)}</option>'
    select = lambda key, label, options: (
        f'<label class="filter-select"><span class="visually-hidden">{label}</span>'
        f'<select id="filter-{key}" data-filter="{key}">{"".join(option(v, t) for v, t in options)}</select></label>')
    aliases = json.dumps(GROUP_OF, ensure_ascii=False)
    return f'''<form class="filters" id="filters" role="search" aria-label="Filter games" data-cat-aliases="{escape(aliases)}" hidden>
      <label class="filter-search-wrap"><span class="visually-hidden">Search games</span>
        <input class="filter-search" id="filter-q" type="search" name="q" placeholder="Search games" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
      <div class="filter-row">
        {select("players", "Players", [("", "Any players"), ("1", "1 player"), ("2", "2+ players")])}
        {select("dims", "2D or 3D", [("", "2D and 3D"), ("2d", "2D"), ("3d", "3D")])}
        {select("cat", "Category", [("", "All categories")] + [(c, c) for c in categories(games)])}
        {select("sort", "Order", [("", "Best first"), ("az", "A–Z"), ("group", "By category")])}
      </div>
    </form>
    <p class="filter-status visually-hidden" id="filter-status" role="status"></p>
    <div class="filter-empty" id="filter-empty" hidden><p>No games match.</p><button class="link-button" type="button" id="filter-clear">Clear filters</button></div>'''


def game_seo(game):
    """SEO and share tags for a game served full screen at /<slug>/."""
    slug = game["slug"]
    title = f"{game['name']} · Free browser game · Ludvig Games"
    url = f"{ORIGIN}/{slug}/"
    image = f"{ORIGIN}/assets/previews/{slug}.webp" if game.get("preview", True) else None
    low, high = player_range(game["players"])
    modes = (["https://schema.org/SinglePlayer"] if low == 1 else []) + (["https://schema.org/MultiPlayer"] if high > 1 else [])
    data = {"@context": "https://schema.org", "@type": "VideoGame", "name": game["name"], "description": game["description"],
            "url": url, "playMode": modes[0] if len(modes) == 1 else modes, "applicationCategory": "Game",
            "operatingSystem": "Web browser", "author": AUTHOR, "isAccessibleForFree": True}
    if alternate_name(game):
        data["alternateName"] = alternate_name(game)
    if game.get("category"):
        data["genre"] = game["category"]
    if image:
        data["image"] = image
    genre = next((label for pattern, label in GENRES if re.search(pattern, game["description"], re.IGNORECASE)), None)
    if genre and "genre" not in data:
        data["genre"] = genre
    tags = [f"<title>{escape(title)}</title>",
            f'<meta name="description" content="{escape(game["description"])}">',
            f'<link rel="canonical" href="{url}">',
            '<meta property="og:type" content="website">', '<meta property="og:site_name" content="Ludvig Games">',
            f'<meta property="og:title" content="{escape(title)}">',
            f'<meta property="og:description" content="{escape(game["description"])}">',
            f'<meta property="og:url" content="{url}">',
            f'<meta name="twitter:card" content="{"summary_large_image" if image else "summary"}">']
    if image:
        tags.insert(7, f'<meta property="og:image" content="{image}">')
    return "".join(tags) + jsonld(data)


# Tags the generated SEO block replaces in the /<slug>/ copy (only inside <head>).
OWN_SEO = re.compile(r'''<title\b[^>]*>.*?</title\s*>|<meta\s[^>]*(?:name|property)\s*=\s*["']?(?:description|og:[\w:]+|twitter:[\w:]+)["']?[^>]*>|<link\s[^>]*rel\s*=\s*["']?canonical["']?[^>]*>''', re.IGNORECASE | re.DOTALL)


AUDIO_RESUME = '<script src="/assets/audio-resume.js"></script>'
LUDVIG = '<script src="/assets/ludvig.js"></script>'
SCORE_BRIDGE = '<script src="/assets/score-bridge.js"></script>'
FORMATS = {"int", "float1", "time-ms", "time-s", "money"}
BOARD_ID = r"[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)?"
# Where pages reach the hub API (leaderboards and room signaling), from the env var LUDVIG_API_BASE. Empty means
# same origin (local preview, scripts/serve.ts). In production it is the API Worker on the Free account, e.g.
# https://ludvig-games-api.<sub>.workers.dev (docs/free-account-plan.md). Locally http://127.0.0.1:<port> works.
API_BASE = re.compile(r"(?:https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|http://(?:127\.0\.0\.1|localhost))(?::\d{1,5})?")


def api_base():
    base = os.environ.get("LUDVIG_API_BASE", "").strip().rstrip("/")
    if base and not API_BASE.fullmatch(base):
        raise ValueError(f"LUDVIG_API_BASE must be an https:// origin (or http://127.0.0.1:<port>), not {base!r}")
    return base


def ludvig_script(base):
    """The platform client as published: the source, with the API base set first when it is not same-origin."""
    source = (ROOT / "assets" / "ludvig.js").read_text()
    return f"window.__LUDVIG_API={json.dumps(base)};\n{source}" if base else source


def write_worker_boards(boards):
    """The API Worker has no static files, so it gets the board config bundled (worker/boards.gen.mjs)."""
    path = ROOT / "worker" / "boards.gen.mjs"
    text = ("// Generated by build.py from scores.json and games.json (same as public/assets/boards.json). Do not edit.\n"
            f"export default {json.dumps(boards, separators=(',', ':'), ensure_ascii=False)};\n")
    if not path.is_file() or path.read_text() != text:
        path.write_text(text)


# Boards a game lists in games.json without a scores.json entry get these rules.
DEFAULT_BOARD = {"label": "Score", "order": "desc", "format": "int", "min": 0, "max": 1_000_000_000}


def script_json(value):
    """JSON that is safe inside an inline <script>."""
    text = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
    return text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def bridge_config(slug, boards):
    """Only this game's boards, and only what the bridge needs."""
    keep = ("key", "match", "path", "order", "min", "max")
    return {board_id: {k: b[k] for k in keep if k in b} for board_id, b in boards.items()
            if b["game"] == slug and "key" in b}


def inject_platform(path, game, boards, seo=False):
    """Before any game script: iOS sound recovery, the platform client, this game's config and, when configured,
    the score bridge. The full-screen copy at /<slug>/ also gets SEO tags (replacing the game's own) and the
    cookie-free analytics beacon; the /games/<slug>/ copy points its canonical to /<slug>/."""
    slug = game["slug"]
    text = path.read_text()
    match = re.search(r"<head(?:\s[^>]*)?>", text, re.IGNORECASE)
    if not match:
        raise ValueError(f"Missing <head> in {path}")
    head_end = re.search(r"</head\s*>", text[match.end():], re.IGNORECASE)
    head_end = match.end() + head_end.start() if head_end else match.end()
    head = text[match.end():head_end]
    if seo:
        head = OWN_SEO.sub("", head)
    else:
        head = re.sub(r"<link\s[^>]*rel\s*=\s*[\"']?canonical[\"']?[^>]*>", "", head, flags=re.IGNORECASE)
    # Cloudflare sends text/html without a charset, so declare UTF-8 before the injected scripts push the game's own tag past 1024 bytes.
    injected = '<meta charset="utf-8">' + TOUCH_STYLE + (game_seo(game) if seo else f'<link rel="canonical" href="{ORIGIN}/{slug}/">')
    injected += AUDIO_RESUME + LUDVIG
    ids = [board_id for board_id, b in boards.items() if b["game"] == slug]
    config = {"slug": slug, "name": game["name"], "boards": ids, "button": game.get("lbButton", "br") if ids else "none"}
    scores = bridge_config(slug, boards)
    inline = f"window.__LUDVIG_GAME={script_json(config)};"
    if scores:
        inline += f"window.__LUDVIG_SCORES={script_json(scores)};"
    injected += f"<script>{inline}</script>" + (SCORE_BRIDGE if scores else "")
    if seo:
        injected += ANALYTICS
    if not re.search(r"<link\s[^>]*rel\s*=\s*[\"']?(?:shortcut\s+)?icon", head, re.IGNORECASE):
        # Without an icon the browser asks for /favicon.ico and logs a 404 in every game.
        injected += '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'
    path.write_text(text[:match.end()] + injected + head + text[head_end:])


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value and abs(value) != float("inf")


def load_boards(games):
    """Leaderboards from scores.json plus games.json "boards" lists, for published local games, in catalog order."""
    path = ROOT / "scores.json"
    config = json.loads(path.read_text()) if path.is_file() else {}
    if not isinstance(config, dict):
        raise ValueError("scores.json must be an object")
    local = {game["slug"]: game for game in games if not game["external"]}
    found = {}
    skipped = []
    for board_id, entry in config.items():
        where = f"scores.json {board_id}"
        if not re.fullmatch(BOARD_ID, board_id) or not isinstance(entry, dict):
            raise ValueError(f"Invalid board: {where}")
        if entry.get("order") not in ("asc", "desc") or entry.get("format") not in FORMATS:
            raise ValueError(f"order must be asc/desc and format one of {sorted(FORMATS)}: {where}")
        if not (number(entry.get("min")) and number(entry.get("max")) and entry["min"] < entry["max"]):
            raise ValueError(f"min and max must be numbers with min < max: {where}")
        if not isinstance(entry.get("label"), str) or not 0 < len(entry["label"]) <= 40:
            raise ValueError(f"label must be a short string: {where}")
        if entry.get("match", "exact") not in ("exact", "prefix", "regex"):
            raise ValueError(f"match must be exact, prefix or regex: {where}")
        for field in ("key", "path", "mode"):
            if field in entry and not (isinstance(entry[field], str) and entry[field]):
                raise ValueError(f"{field} must be a non-empty string: {where}")
        slug = board_id.split(":")[0]
        if slug not in local:
            skipped.append(board_id)
            continue
        found[board_id] = entry
    if skipped:
        print(f"Note: {len(skipped)} scores.json boards belong to hidden or external games and are not published.")
    for slug, game in local.items():
        for board_id in game.get("boards", []):
            if board_id not in found:
                print(f"Note: {slug} lists board {board_id} without a scores.json entry; using default rules.")
                found[board_id] = dict(DEFAULT_BOARD)
    boards = {}
    for slug, game in local.items():
        scoped = "game-storage.js" in (ROOT / "source-games" / slug / "index.html").read_text(errors="ignore")
        for board_id, entry in found.items():
            if board_id.split(":")[0] != slug:
                continue
            board = {"game": slug, "gameName": game["name"]}
            board.update({k: entry[k] for k in ("label", "order", "format", "min", "max", "mode", "key", "match", "path") if k in entry})
            board["match"] = entry.get("match", "exact")
            board["scoped"] = scoped
            boards[board_id] = board
    return boards


def records_page():
    body = f'''<a class="skip" href="#records">Skip to records</a>
<div class="shell">
  {masthead()}
  <main class="records" id="records">
    <h1 class="page-title">My records</h1>
    <div class="records-name" data-name-edit></div>
    <p class="records-status" id="records-status" role="status">Loading your records…</p>
    <ul class="records-list" id="records-list"></ul>
  </main>
  {FOOTER}
</div>'''
    return document("My records · Ludvig Games", "Your best scores and ranks across Ludvig Games.", "/me/", body,
                    scripts=("/assets/ludvig.js", "/assets/scores-ui.js"))


def lastmod(path):
    return time.strftime("%Y-%m-%d", time.gmtime(path.stat().st_mtime))


def llms_txt(games):
    lines = ["# Ludvig Games", "", f"> {SITE_DESCRIPTION}", "",
             "Each game runs full screen in the browser on desktop and phone. Leaderboards and \"My records\" use an anonymous nickname, no account.",
             "", "## Games", ""]
    for game in games:
        url = game["external"] or f"{ORIGIN}/{game['slug']}/"
        former = f", formerly {alternate_name(game)}" if alternate_name(game) else ""
        lines.append(f"- [{game['name']}]({url}): {game['description']} ({game['players']}{former})")
    lines += ["", "## Pages", "", f"- [All games]({ORIGIN}/)", f"- [My records]({ORIGIN}/me/): your best scores on this device",
              "- [Ludvig Hedin](https://www.ludvighedin.com): the designer who made these games", ""]
    return "\n".join(lines)


def render(output):
    OUT = output
    catalog = json.loads((ROOT / "games.json").read_text())
    slugs = set()
    for game in catalog:
        slug = game["slug"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in slugs:
            raise ValueError(f"Invalid or duplicate slug: {slug}")
        if slug in ("games", "assets", "me", "api", "mp"):
            raise ValueError(f"Slug collides with a site path: {slug}")
        slugs.add(slug)
        if not isinstance(game.get("hidden", False), bool):
            raise ValueError(f"hidden must be a boolean: {slug}")
        if not isinstance(game.get("allowExternalLinks", False), bool):
            raise ValueError(f"allowExternalLinks must be a boolean: {slug}")
        if not isinstance(game.get("allowForms", False), bool):
            raise ValueError(f"allowForms must be a boolean: {slug}")
        if not isinstance(game.get("preview", True), bool):
            raise ValueError(f"preview must be a boolean: {slug}")
        listed = game.get("boards", [])
        if not isinstance(listed, list) or not all(
                isinstance(b, str) and re.fullmatch(BOARD_ID, b) and b.split(":")[0] == slug for b in listed):
            raise ValueError(f'boards must be a list of "{slug}" or "{slug}:<mode>" ids: {slug}')
        if "category" in game and not (isinstance(game["category"], str) and game["category"].strip()):
            raise ValueError(f"category must be a non-empty string: {slug}")
        if game.get("dims", "2D") not in ("2D", "3D"):
            raise ValueError(f"dims must be 2D or 3D: {slug}")
        if "quality" in game and not (isinstance(game["quality"], int) and not isinstance(game["quality"], bool) and 1 <= game["quality"] <= 10):
            raise ValueError(f"quality must be a whole number 1-10: {slug}")
        if "formerName" in game and not isinstance(game["formerName"], str):
            raise ValueError(f"formerName must be a string: {slug}")
        if game.get("lbButton", "br") not in ("tl", "tr", "bl", "br", "none"):
            raise ValueError(f"lbButton must be tl, tr, bl, br or none: {slug}")
        if game["external"] and not game["external"].startswith("https://"):
            raise ValueError(f"External URL must use HTTPS: {slug}")
    games = [game for game in catalog if not game.get("hidden", False)]
    for game in games:
        slug = game["slug"]
        if not game["external"] and not (ROOT / "source-games" / slug / "index.html").is_file():
            raise ValueError(f"Missing game: {slug}")
        if game.get("preview", True) and not (ROOT / "assets" / "previews" / f"{slug}.webp").is_file():
            raise ValueError(f"Missing preview: {slug}")
    OUT.mkdir(exist_ok=True)
    assets = OUT / "assets"
    previews = assets / "previews"
    previews.mkdir(parents=True)
    base = api_base()
    for asset in ["site.css", "favicon.svg", "game-storage.js", "audio-resume.js",
                  "score-bridge.js", "scores-ui.js", "hub.js"]:
        shutil.copy2(ROOT / "assets" / asset, assets / asset)
    (assets / "ludvig.js").write_text(ludvig_script(base))
    boards = load_boards(games)
    # Read by the hub pages (labels, formats, local records) and bundled into the API Worker (validation, ordering).
    (assets / "boards.json").write_text(json.dumps(boards, separators=(",", ":"), ensure_ascii=False))
    write_worker_boards(boards)
    for game in games:
        if not game.get("preview", True):
            continue
        preview = f"{game['slug']}.webp"
        shutil.copy2(ROOT / "assets" / "previews" / preview, previews / preview)
    for game in games:
        if game["external"]:
            continue
        # The game itself is the page at /<slug>/. The /games/<slug>/ copy stays for games with absolute asset
        # paths and old links. Editable source is kept locally, never included in the published game.
        for target, seo in ((OUT / game["slug"], True), (OUT / "games" / game["slug"], False)):
            shutil.copytree(ROOT / "source-games" / game["slug"], target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("editable", "tests", "README.md", "QA.md"))
            inject_platform(target / "index.html", game, boards, seo=seo)
    # Best first; ties keep catalog order (sorted() is stable).
    shown = sorted(games, key=lambda g: -g.get("quality", 0))
    cards = "\n".join(game_card(game, index) for index, game in enumerate(shown))
    body = f'''<a class="skip" href="#games">Skip to games</a>
<div class="shell">
  {masthead()}
  <main>
    <h1 class="intro">Experimental browser games made by Ludvig</h1>
    {filter_bar(games)}
    <div id="games-root"><section class="cards" id="games" aria-label="Games">{cards}</section></div>
  </main>
  {FOOTER}
</div>'''
    urls = [g["external"] or f"{ORIGIN}/{g['slug']}/" for g in shown]
    structured = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "@id": f"{ORIGIN}/#website", "name": "Ludvig Games", "url": f"{ORIGIN}/",
         "description": SITE_DESCRIPTION, "author": {"@id": "https://www.ludvighedin.com/#person"}},
        {**AUTHOR, "@id": "https://www.ludvighedin.com/#person", "jobTitle": "UX/UI designer"},
        {"@type": "ItemList", "name": "Games", "numberOfItems": len(games), "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": url, "name": g["name"],
             **({"alternateName": alternate_name(g)} if alternate_name(g) else {})} for i, (g, url) in enumerate(zip(shown, urls))]}]}
    (OUT / "index.html").write_text(document("Ludvig Games · Free experimental browser games", SITE_DESCRIPTION, "/", body,
                                             image="/assets/previews/flappy-first-person.webp", structured=structured,
                                             scripts=("/assets/hub.js",)))
    error = f'''<div class="shell">
  {masthead()}
  <main class="empty"><h1 class="page-title">Game not found</h1><p>Pick something else to play.</p><a href="/">All games</a></main>
  {FOOTER}
</div>'''
    (OUT / "404.html").write_text(document("Page not found · Ludvig Games", "Return to all games.", "/404", error))
    (OUT / "me").mkdir()
    (OUT / "me" / "index.html").write_text(records_page())
    local = [g for g in games if not g["external"]]
    sources = {g["slug"]: lastmod(ROOT / "source-games" / g["slug"] / "index.html") for g in local}
    entries = [("/", max(sources.values(), default=time.strftime("%Y-%m-%d")))] + [(f"/{g['slug']}/", sources[g["slug"]]) for g in local]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                     + "".join(f"<url><loc>{ORIGIN}{p}</loc><lastmod>{d}</lastmod></url>" for p, d in entries) + "</urlset>\n")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /games/\nDisallow: /api/\nDisallow: /mp/\nSitemap: {ORIGIN}/sitemap.xml\n")
    (OUT / "llms.txt").write_text(llms_txt(games))
    # Cloudflare static-asset headers, matching the security headers in vercel.json.
    (OUT / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n")
    (OUT / ".assetsignore").write_text(".ludvig-games-generated\n")
    (OUT / ".ludvig-games-generated").write_text("Generated by build.py. Edit source files, not this folder.\n")
    print(f"Built {len(games)} catalog entries and {len(local)} full-screen games. API: {base or 'same origin'}.")


def build():
    if OUT.is_symlink():
        raise ValueError("public must be a real generated folder, not a symlink")
    if OUT.exists() and not (OUT / ".ludvig-games-generated").is_file():
        raise ValueError("Refusing to replace public without its generated-folder marker")
    # Prepare everything before replacing the generated folder. Old routes and
    # previews disappear when games are removed from the catalog.
    with tempfile.TemporaryDirectory(prefix=".ludvig-games-build-", dir=ROOT) as temporary:
        output = Path(temporary) / "public"
        previous = Path(temporary) / "previous"
        render(output)
        if OUT.exists():
            OUT.rename(previous)
        try:
            output.rename(OUT)
        except OSError:
            if previous.exists():
                previous.rename(OUT)
            raise


def refresh(slugs):
    """Copy only these games into the existing public folder (local testing while others edit)."""
    if not (OUT / ".ludvig-games-generated").is_file():
        raise ValueError("Run a full build first")
    catalog = {g["slug"]: g for g in json.loads((ROOT / "games.json").read_text())}
    games = [g for g in catalog.values() if not g.get("hidden", False)]
    boards = load_boards(games)
    for slug in slugs:
        game = catalog[slug]
        if game.get("hidden", False) or game.get("external"):
            # Hidden games must never reach public/, and external games have no local copy.
            print(f"Skipped {slug}: hidden or external")
            continue
        game.setdefault("external", None)
        for target, seo in ((OUT / slug, True), (OUT / "games" / slug, False)):
            shutil.copytree(ROOT / "source-games" / slug, target, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("editable", "tests", "README.md", "QA.md"))
            inject_platform(target / "index.html", game, boards, seo=seo)
        print(f"Refreshed {slug}")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--only":
        refresh(sys.argv[2:])
    else:
        build()
