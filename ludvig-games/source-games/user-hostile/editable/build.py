#!/usr/bin/env python3
"""Build the single-file game. Standard library only.

Optional: place an official Three.js r160 UMD build at src/three.min.js.
If present, Three.js is embedded. Otherwise the game requests it from
public CDNs without blocking play. The built-in native WebGL renderer
provides offline 3D; a final 2D fallback works without WebGL.
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parent
css = (root / 'src/styles.css').read_text()
js = (root / 'src/game.js').read_text().replace('/*__NATIVE_3D__*/', (root / 'src/native-3d.js').read_text())
html = (root / 'src/template.html').read_text()
vendor = root / 'src/three.min.js'
if vendor.exists() and vendor.stat().st_size > 10000:
    library = vendor.read_text()
    # Preserve the upstream licence header; suppress only the legacy build notice.
    library = re.sub(r'^console\.warn\([^\n]+\),\s*', '', library, count=1)
    js = library + '\n;\n' + js
html = html.replace('/*__STYLES__*/', css).replace('/*__GAME__*/', js.replace('</script', '<\\/script'))
(root / 'index.html').write_text(html)
print(f'Built {root / "index.html"} ({len(html.encode()):,} bytes)')
