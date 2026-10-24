import * as THREE from 'three';

function seeded(seed = 17) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

export function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function basketballTexture(color = '#d86527') {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const random = seeded(14);
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const px = x + random() * 2, py = y + random() * 2;
        ctx.fillStyle = `rgba(35,12,3,${0.08 + random() * 0.11})`;
        ctx.beginPath(); ctx.ellipse(px, py, 1.45, 1.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,228,189,.13)';
        ctx.beginPath(); ctx.ellipse(px - .45, py - .5, .7, .5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    function seams(width, stroke) {
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      for (const p of [0, .5, 1]) {
        ctx.beginPath(); ctx.moveTo(w * p, 0); ctx.lineTo(w * p, h); ctx.stroke();
      }
      for (const center of [.25, .75]) {
        ctx.beginPath();
        for (let y = 0; y <= h; y += 2) {
          const x = w * (center + .12 * Math.sin((y / h - .5) * Math.PI * 2));
          if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    seams(12, 'rgba(55,23,11,.46)');
    seams(7.5, '#251c17');
    seams(2.5, '#1a1715');
    ctx.save(); ctx.translate(w * .36, h * .35); ctx.rotate(.08);
    ctx.fillStyle = 'rgba(44,22,13,.76)'; ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial'; ctx.fillText('HOOP RUSH', 0, 0);
    ctx.font = '9px Arial'; ctx.fillText('OFFICIAL ARCADE BALL', 0, 15); ctx.restore();
  });
}

export function deckTexture() {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    const random = seeded(28);
    ctx.fillStyle = '#252c35'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 21000; i++) {
      ctx.fillStyle = `rgba(209,218,229,${random() * .045})`;
      ctx.fillRect(random() * w, random() * h, 1, 1 + random() * 3);
    }
    ctx.strokeStyle = '#49515b'; ctx.lineWidth = 2;
    for (let y = 8; y < h; y += 6) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(w - 8, y); ctx.stroke(); }
    ctx.strokeStyle = '#bf552e'; ctx.lineWidth = 5;
    ctx.strokeRect(28, 22, w - 56, h - 44);
    ctx.strokeStyle = 'rgba(255,126,67,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, h * .25, w * .28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2, h * .53); ctx.lineTo(w / 2, h * .94); ctx.stroke();
    ctx.fillStyle = 'rgba(230,228,222,.14)'; ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center';
    ctx.save(); ctx.translate(w / 2, h * .78); ctx.rotate(Math.PI); ctx.fillText('RUSH', 0, 0); ctx.restore();
  });
}

export function floorTexture() {
  const texture = canvasTexture(1024, 1024, (ctx, w, h) => {
    const random = seeded(49);
    ctx.fillStyle = '#181d26'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 30000; i++) {
      ctx.fillStyle = `rgba(163,178,198,${random() * .025})`;
      ctx.fillRect(random() * w, random() * h, random() * 22 + 1, .7);
    }
    ctx.strokeStyle = '#242a33'; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 128) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      for (let y = (x / 128 % 2) * 256; y <= h; y += 512) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 128, y); ctx.stroke();
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

export function shadowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.75)');
    gradient.addColorStop(.35, 'rgba(0,0,0,.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  });
}

export function textTexture(text, {color = '#f3eee7', background = 'transparent', width = 1024, height = 256, font = '900 110px Arial', tracking = 0, subtitle = ''} = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    if (background !== 'transparent') { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
    ctx.fillStyle = color; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (tracking) {
      const lengths = [...text].map(c => ctx.measureText(c).width + tracking);
      let x = (w - lengths.reduce((a, b) => a + b, 0) + tracking) / 2;
      ctx.textAlign = 'left';
      [...text].forEach((c, i) => { ctx.fillText(c, x, h * (subtitle ? .39 : .5)); x += lengths[i]; });
    } else ctx.fillText(text, w / 2, h * (subtitle ? .4 : .5));
    if (subtitle) {
      ctx.textAlign = 'center'; ctx.font = '500 22px Arial'; ctx.globalAlpha = .65;
      ctx.fillText(subtitle, w / 2, h * .79);
    }
  });
}

export function arcadeScreen(title, color) {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#070c15'; ctx.fillRect(0, 0, w, h);
    const gradient = ctx.createRadialGradient(w / 2, h * .5, 0, w / 2, h * .5, 150);
    gradient.addColorStop(0, `${color}55`); gradient.addColorStop(1, '#070c1500');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `${color}44`; ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(w / 2, h * .44); ctx.lineTo(i * w / 7, h); ctx.stroke(); }
    for (let y = h * .62; y < h; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(w / 2, h * .4, 55, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '900 29px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#f6f3e9'; ctx.fillText(title, w / 2, h * .43);
    ctx.font = '10px monospace'; ctx.fillStyle = color; ctx.fillText('PRESS START', w / 2, h * .83);
    ctx.fillStyle = '#00000022'; for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  });
}
