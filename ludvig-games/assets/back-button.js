/* "All games" button in every game: a small round button in the corner from games.json backButton (data-corner).
   Not shown inside the Mac app, whose window has its own All games button. */
(() => {
  'use strict';
  const corner = (document.currentScript && document.currentScript.dataset.corner) || 'tl';
  if (corner === 'none' || /\bElectron\//.test(navigator.userAgent) || window.top !== window) return;
  const place = () => {
    const link = document.createElement('a');
    link.href = '/';
    link.setAttribute('aria-label', 'All games');
    link.title = 'All games';
    link.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
    const edge = 'max(12px, env(safe-area-inset-%s))';
    const [v, h] = [corner[0] === 't' ? 'top' : 'bottom', corner[1] === 'l' ? 'left' : 'right'];
    link.style.cssText = [
      'position:fixed', 'z-index:2147483000', `${v}:${edge.replace('%s', v)}`, `${h}:${edge.replace('%s', h)}`,
      'width:36px', 'height:36px', 'display:grid', 'place-items:center', 'border-radius:50%',
      'background:rgba(12,12,12,.55)', 'color:#fff', 'box-shadow:0 0 0 1px rgba(255,255,255,.18)',
      'opacity:.72', 'transition:opacity 150ms ease', 'text-decoration:none', '-webkit-tap-highlight-color:transparent',
    ].join(';');
    link.addEventListener('mouseenter', () => { link.style.opacity = '1'; });
    link.addEventListener('mouseleave', () => { link.style.opacity = '.72'; });
    link.addEventListener('focus', () => { link.style.opacity = '1'; });
    // Keys pressed while the button has focus belong to the game, except Enter (open) and Tab.
    link.addEventListener('keydown', event => { if (event.key !== 'Enter' && event.key !== 'Tab') link.blur(); });
    document.body.append(link);
  };
  if (document.body) place();
  else addEventListener('DOMContentLoaded', place);
})();
