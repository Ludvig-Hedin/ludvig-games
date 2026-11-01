#!/usr/bin/env python3
"""Package Pace as a standalone HTML app plus clean editable source.

Only Python's standard library is required. Paths resolve relative to this
script, so the caller's working directory does not affect the input files.
"""

from __future__ import annotations

import argparse
import base64
import re
import sys
import zipfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST = PROJECT_ROOT / "dist"
APP_SCRIPTS = ("engine.js", "content.js", "progress.js", "app.js")
EXCLUDED_PARTS = {".git", ".openai", "node_modules", "__pycache__"}
EXCLUDED_FILES = {"qa-responsive.html"}


def read_required(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"Required package file is missing: {path}")
    return path.read_text(encoding="utf-8")


def replace_one(pattern: str, replacement: str, source: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, source, flags=re.IGNORECASE)
    if count != 1:
        raise ValueError(f"Expected exactly one {label}; found {count}.")
    return updated


def standalone_html() -> str:
    html = read_required(DIST / "index.html")
    css = read_required(DIST / "styles.css")
    css = re.sub(r"</style", r"<\\/style", css, flags=re.IGNORECASE)
    html = replace_one(
        r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])(?=[^>]*\bhref=["\'](?:\./)?styles\.css["\'])[^>]*>',
        "<style>\n" + css + "\n</style>",
        html,
        "styles.css link",
    )

    for filename in APP_SCRIPTS:
        script = read_required(DIST / filename)
        # Prevent a literal closing-script sequence in a JS string from ending
        # its HTML element early. The slash escape is valid JavaScript.
        script = re.sub(r"</script", r"<\\/script", script, flags=re.IGNORECASE)
        pattern = r'<script\b(?=[^>]*\bsrc=["\'](?:\./)?' + re.escape(filename) + r'["\'])[^>]*>\s*</script\s*>'
        html = replace_one(pattern, "<script>\n" + script + "\n</script>", html, filename + " script")

    icon = base64.b64encode(read_required(DIST / "icon.svg").encode("utf-8")).decode("ascii")
    html = replace_one(
        r'<link\b(?=[^>]*\brel=["\']icon["\'])[^>]*>',
        '<link rel="icon" href="data:image/svg+xml;base64,' + icon + '" type="image/svg+xml">',
        html,
        "favicon link",
    )
    # A file:// standalone copy does not use the hosted manifest or its paths.
    html = re.sub(r'\s*<link\b(?=[^>]*\brel=["\']manifest["\'])[^>]*>', "", html, flags=re.IGNORECASE)

    if re.search(r'<script\b[^>]*\bsrc\s*=', html, flags=re.IGNORECASE):
        raise ValueError("Standalone output still contains an external script.")
    if re.search(r'<link\b[^>]*\brel=["\']stylesheet["\']', html, flags=re.IGNORECASE):
        raise ValueError("Standalone output still contains an external stylesheet.")
    return html


def source_files():
    for dirname in ("dist", "tests"):
        directory = PROJECT_ROOT / dirname
        if not directory.is_dir():
            raise FileNotFoundError(f"Required source directory is missing: {directory}")
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(PROJECT_ROOT)
            if not path.is_file() or path.is_symlink():
                continue
            if any(part.startswith(".") or part in EXCLUDED_PARTS for part in relative.parts):
                continue
            if path.name in EXCLUDED_FILES or path.suffix in {".pyc", ".pyo", ".zip", ".tar", ".gz"}:
                continue
            yield path, relative
    for relative in (Path("package.json"), Path("README.md"), Path("scripts/package-download.py")):
        path = PROJECT_ROOT / relative
        if not path.is_file():
            raise FileNotFoundError(f"Required source file is missing: {path}")
        yield path, relative


def create_package(output: Path) -> int:
    html = standalone_html()
    readme = read_required(PROJECT_ROOT / "README.md")
    files = list(source_files())
    output = output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    try:
        with zipfile.ZipFile(temporary, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            archive.writestr("Pace/index.html", html)
            archive.writestr("Pace/README.md", readme)
            for path, relative in files:
                archive.write(path, "Pace/source/" + relative.as_posix())
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()
    return len(files) + 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a standalone Pace.zip download with editable source.")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT.parent / "Pace.zip", help="ZIP destination (default: the project parent's Pace.zip)")
    args = parser.parse_args()
    try:
        count = create_package(args.output)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        return 1
    output = args.output.expanduser().resolve()
    print(f"Created {output} ({output.stat().st_size:,} bytes; {count} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
