"""Build EPOCH as a single offline HTML file, without any network dependency."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent
html=(root/'index.html').read_text()
notice=root/'THIRD-PARTY-NOTICES.txt'
if notice.exists(): html=html.replace('<head>', '<!--\n'+notice.read_text()+'\n-->\n<head>', 1)
html=html.replace('<link rel="stylesheet" href="style.css">','<style>\n'+(root/'style.css').read_text()+'\n</style>')
for name in ['three.min.js','sim.js','audio.js','models.js','scene.js','game.js']:
    code=(root/name).read_text().replace('</script','<\\/script')
    html=html.replace(f'<script src="{name}"></script>',f'<script>\n/* Bundled: {name} */\n{code}\n</script>')
target=root.parent/'EPOCH-Endless-War.html'
target.write_text(html)
print(target, target.stat().st_size, 'bytes')
