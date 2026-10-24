"""Fetch the game's existing open-licensed typefaces from Google Fonts."""
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist' / 'assets' / 'fonts'
DEST.mkdir(parents=True, exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
URL = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..700&family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap'

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as response:
        return response.read()

css = fetch(URL).decode()
faces = []
seen = set()
for block in re.findall(r'@font-face\s*\{[^}]+\}', css):
    if 'U+0000-00FF' not in block:
        continue
    url = re.search(r'url\(([^)]+)\)', block).group(1)
    family = re.search(r"font-family: '([^']+)'", block).group(1)
    style = re.search(r'font-style: ([^;]+)', block).group(1)
    filename = family.lower().replace(' ', '-') + '-' + style + '.woff2'
    if filename not in seen:
        content = fetch(url)
        if content[:4] != b'wOF2':
            raise ValueError('Expected WOFF2 font data')
        (DEST / filename).write_bytes(content)
        seen.add(filename)
    faces.append(block.replace(url, './assets/fonts/' + filename))
if len(seen) != 3:
    raise ValueError('Expected three Latin font families/styles')
for family, directory in [('DM-Sans', 'dmsans'), ('Playfair-Display', 'playfairdisplay')]:
    (DEST / (family + '-OFL.txt')).write_bytes(fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/' + directory + '/OFL.txt'))
(ROOT / 'dist' / 'fonts.css').write_text('/* Locally bundled SIL Open Font License fonts. */\n' + '\n'.join(faces) + '\n')
print('Bundled', len(seen), 'WOFF2 fonts and both licenses.')
