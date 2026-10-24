"""Ritkaos TikTok edit: guess-the-drawing hook, freeze before the reveal, end card."""
import os, subprocess
FPS = 30
src = list(range(35, 216)) + [215] * 45 + list(range(216, 366)) + [365] * 60
os.makedirs('seq', exist_ok=True)
for f in os.listdir('seq'): os.remove(os.path.join('seq', f))
for i, s in enumerate(src): os.link(f'frames/f{s:05d}.jpg', f'seq/s{i:05d}.jpg')
total = len(src) / FPS; freeze = 181 / FPS; reveal = (181 + 45) / FPS; end = (len(src) - 60) / FPS
FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
def line(text, t0, t1, y, size, color='white', box=True):
    text = text.replace("'", '’').replace(':', '\\:').replace('?', '\\?') if False else text.replace("'", '’').replace(':', '\\:')
    a = f"if(lt(t,{t0}+0.12),(t-{t0})/0.12,if(gt(t,{t1}-0.12),({t1}-t)/0.12,1))"
    yy = f"{y}+20*max(0,1-(t-{t0})/0.12)"
    style = ':box=1:boxcolor=black@0.82:boxborderw=22' if box else ':borderw=10:bordercolor=black'
    return (f"drawtext=fontfile='{FONT}':text='{text}':fontsize={size}:fontcolor={color}{style}"
            f":x='(w-text_w)/2':y='{yy}':alpha='{a}':enable='between(t,{t0},{t1})'")
def pair(a, b, t0, t1, color='white', size=70, y=150):
    return [line(a, t0, t1, y, size, color), line(b, t0 + 0.2, t1, y + 104, size, color)]
caps = (pair('MY FRIEND IS', 'DRAWING SOMETHING', 0.0, 2.8, size=62)
      + pair('CAN YOU GUESS', 'WHAT IT IS?', 2.8, freeze)
      + pair('COMMENT YOUR', 'GUESS NOW', freeze, reveal, '#C8F560', 76)
      + [line('RITKAOS', end, total, 150, 96, '#C8F560'),
         line('free party game for 2 to 12', end + 0.2, total, 290, 46),
         line('ritkaos.ludvighedin.com', end + 0.4, total, 380, 52)])
vf = ','.join(caps + ['format=yuv420p'])
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', 'seq/s%05d.jpg', '-vf', vf, '-r', str(FPS),
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', 'ritkaos-tiktok.mp4'], check=True)
print(f'{total:.1f}s')
