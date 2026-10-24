#!/usr/bin/env python3
"""Build a single offline HTML file using only the Python standard library."""
from pathlib import Path
root=Path(__file__).resolve().parent
names=['flight.js','render.js','world.js','audio.js','game.js']
code='\n\n'.join((root/'src'/name).read_text() for name in names)
assert '</script' not in code.lower(), 'Escape closing script tags in source first.'
html=(root/'template.html').read_text().replace('/*__GAME_CODE__*/',code)
(root/'index.html').write_text(html)
print(f'Built index.html · {len(html):,} characters · offline, no dependencies')
