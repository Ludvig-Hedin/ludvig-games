/* Shared, test-only purchase and restore sheet. Free games work if this file or its API is unavailable. */
(() => {
  'use strict';
  if (window.LudvigStore) return;
  const ENTITLEMENTS = ['ritkaos', 'pigeon', 'karts'];
  const STORAGE = 'ludvig:licenses:test';
  const ALLOWED_BASES = new Set([location.origin, 'http://127.0.0.1:4322', 'http://localhost:4322', 'https://ludvig-games-store-test.ludvighedin.workers.dev']);
  const proposed = typeof window.__LUDVIG_STORE_API === 'string' ? window.__LUDVIG_STORE_API.replace(/\/$/, '') : location.origin;
  const base = ALLOWED_BASES.has(proposed) ? proposed : location.origin;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const COPY = {
    ritkaos: 'Five word packs, Blind draw, Speed round, Telephone, brushes and palettes.',
    pigeon: 'Sun hat, Beanie, Crown and Top hat. Snow, Cinnamon, Midnight and Mint feather looks.',
    karts: 'Midnight, Sunshine, Ice blue and Cherry colours. Racing stripes and Checker panels.',
    bundle: 'Ritkaos+, the Pigeon style pack and the Karts style pack listed here. Future packs are separate.',
  };
  let catalog = null, owned = new Set(), dialog, selected = 'pigeon', busy = false, focusBefore, revision = 0;
  const listeners = new Set();
  const readKeys = () => {
    try { const data = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(data) ? [...new Set(data.filter(k => typeof k === 'string' && UUID.test(k)))].slice(-4) : []; }
    catch { return []; }
  };
  const saveKeys = keys => { try { localStorage.setItem(STORAGE, JSON.stringify(keys.slice(-4))); } catch { /* The receipt remains the recovery source. */ } };
  const publish = () => {
    const state = Object.freeze({ owned: [...owned], environment: 'test', ready: catalog?.ready === true });
    for (const fn of listeners) { try { fn(state); } catch { /* One game callback must not break restore. */ } }
    window.dispatchEvent(new CustomEvent('ludvig:store', { detail: state }));
  };
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  async function api(path, options = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const r = await fetch(base + path, { ...options, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      if (!r.headers.get('content-type')?.includes('application/json')) throw { status: r.status, code: 'temporarily-unavailable' };
      const text = await r.text();
      if (text.length > 20000) throw { code: 'temporarily-unavailable' };
      const data = JSON.parse(text);
      if (!r.ok || data.ok === false) throw { status: r.status, code: data.error };
      return data;
    } catch (error) { throw error?.code ? error : { code: 'temporarily-unavailable' }; }
    finally { clearTimeout(timeout); }
  }
  async function validate(key) {
    const data = await api('/api/licenses/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    if (data.ok !== true || data.environment !== 'test' || !Array.isArray(data.entitlements) || data.entitlements.some(id => !ENTITLEMENTS.includes(id))) throw { code: 'temporarily-unavailable' };
    return data.entitlements;
  }
  async function restore() {
    const version = ++revision, initial = readKeys(), checked = new Set(initial);
    const next = new Set(), keep = [];
    if (catalog?.environment === 'test' && catalog.ready === true) {
      for (const key of initial) {
        try { for (const id of await validate(key)) next.add(id); keep.push(key); }
        catch (e) { if (e.status !== 422) keep.push(key); }
      }
      if (revision !== version) return;
      // Another tab can add a code while these requests are in flight. Only
      // discard keys this operation actually checked and found invalid.
      saveKeys(readKeys().filter(key => !checked.has(key) || keep.includes(key)));
    }
    if (revision !== version) return;
    owned = next; publish();
  }
  function message(text) { if (dialog) dialog.querySelector('[role=status]').textContent = text; }
  const errorText = error => error.status === 422 ? 'That code did not work for this store. Check the code in your receipt.'
    : error.status === 429 ? 'Too many checks right now. Please try again in a minute.'
    : 'Could not check the code right now. It has not been removed from your saved codes.';
  function checkout(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && u.hostname.endsWith('.lemonsqueezy.com') && /^\/(?:checkout\/)?buy\/[0-9a-f-]{36}$/i.test(u.pathname) && !u.username && !u.password && !u.hash ? u.href : ''; }
    catch { return ''; }
  }
  function buildDialog() {
    const style = node('style');
    style.textContent = '.lg-store{box-sizing:border-box;width:min(460px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;padding:24px;border:1px solid #d9ded7;border-radius:12px;background:#faf9f5;color:#263c32;font:14px/1.5 system-ui,sans-serif;text-align:left;z-index:10000}.lg-store::backdrop{background:rgba(0,0,0,.5)}.lg-store *{box-sizing:border-box}.lg-store h2{margin:0 35px 8px 0;font-size:24px;letter-spacing:-.5px}.lg-store p{margin:8px 0}.lg-store .lg-muted{font-size:12px;color:#657067}.lg-store button,.lg-store input,.lg-store select,.lg-store a{font:inherit}.lg-store button,.lg-store input,.lg-store select{min-height:44px;border-radius:6px;border:1px solid #b6c1b7;padding:10px}.lg-store button{cursor:pointer;background:#263c32;color:#fff}.lg-store button:disabled{opacity:.5;cursor:default}.lg-store .lg-close{position:absolute;right:12px;top:12px;width:36px;min-height:36px;padding:0;background:transparent;color:#263c32;border:0;font-size:23px}.lg-store select,.lg-store input{width:100%;background:white;color:#263c32;margin:5px 0 10px}.lg-store input{user-select:text}.lg-store a{color:#263c32}.lg-store .lg-buy{display:block;text-align:center;background:#263c32;color:white;padding:11px;border-radius:6px;text-decoration:none;margin:14px 0}.lg-store form{margin-top:22px}.lg-store label{display:block;font-weight:600}.lg-store [role=status]{min-height:22px;margin-top:12px}.lg-store :focus-visible{outline:3px solid #c77737;outline-offset:3px}';
    document.head.append(style);
    style.textContent += '.lg-store [hidden]{display:none!important}';
    dialog = node('dialog', '', 'lg-store');
    dialog.setAttribute('aria-labelledby', 'lg-store-title');
    const close = node('button', '×', 'lg-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close purchase options'); close.onclick = () => dialog.close();
    const title = node('h2', 'Game extras'); title.id = 'lg-store-title';
    const mode = node('p', 'Test mode. No real payment.', 'lg-muted');
    const label = node('label', 'Choose a pack'); label.htmlFor = 'lg-store-product';
    const select = node('select'); select.id = 'lg-store-product'; select.onchange = () => { selected = select.value; render(); };
    const details = node('p'); details.dataset.details = '';
    const buy = node('a', ''); buy.className = 'lg-buy'; buy.target = '_blank'; buy.rel = 'noopener noreferrer'; buy.referrerPolicy = 'no-referrer';
    const availability = node('p', '', 'lg-muted'); availability.dataset.availability = '';
    const form = node('form'), keyLabel = node('label', 'Code from your receipt'); keyLabel.htmlFor = 'lg-store-key';
    const key = node('input'); key.id = 'lg-store-key'; key.type = 'text'; key.autocomplete = 'off'; key.spellcheck = false; key.maxLength = 80; key.placeholder = 'Paste your license code';
    const apply = node('button', 'Restore purchase'); apply.type = 'submit';
    const status = node('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const recovery = node('a', 'Find your receipt and code'); recovery.href = 'https://app.lemonsqueezy.com/my-orders'; recovery.target = '_blank'; recovery.rel = 'noopener noreferrer';
    form.append(keyLabel, key, apply);
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      const value = key.value.trim().toLowerCase();
      if (!UUID.test(value)) { message('Paste the full license code from your receipt.'); return; }
      if (catalog?.ready !== true || catalog.environment !== 'test') { message('Purchases are not configured yet. Please try again later.'); return; }
      busy = true; apply.disabled = true; message('Checking your code…');
      try {
        const entitlements = await validate(value);
        revision++; // An older startup/other-tab refresh must not erase this purchase.
        const keys = readKeys().filter(k => k !== value); keys.push(value); saveKeys(keys);
        for (const id of entitlements) owned.add(id);
        key.value = ''; publish(); render();
        message('Purchase restored. Your extras are available in the matching games.');
      } catch (e) { message(errorText(e)); }
      finally { busy = false; apply.disabled = false; }
    };
    dialog.append(close, title, mode, label, select, details, buy, availability, form, status, recovery);
    dialog.addEventListener('close', () => focusBefore?.focus?.());
    document.body.append(dialog);
  }
  function render() {
    if (!dialog) return;
    const select = dialog.querySelector('select'), previous = select.value;
    select.replaceChildren();
    const offers = catalog?.products || [
      { id: 'ritkaos', name: 'Ritkaos+', price: 59 }, { id: 'pigeon', name: 'Pigeon style pack', price: 39 },
      { id: 'karts', name: 'Karts style pack', price: 39 }, { id: 'bundle', name: 'Three-pack bundle', price: 99 },
    ];
    for (const offer of offers) { const option = node('option', `${offer.name} · ${offer.price} kr`); option.value = offer.id; select.append(option); }
    select.value = offers.some(p => p.id === selected) ? selected : previous || 'bundle';
    const offer = offers.find(p => p.id === select.value);
    dialog.querySelector('[data-details]').textContent = COPY[offer?.id] || '';
    const buy = dialog.querySelector('.lg-buy'), url = catalog?.ready === true && catalog.environment === 'test' ? checkout(offer?.checkout) : '';
    buy.hidden = !url;
    if (url) { buy.href = url; buy.textContent = `Test checkout · ${offer.price} kr`; }
    else buy.removeAttribute('href');
    const bought = offer?.id === 'bundle' ? ENTITLEMENTS.every(id => owned.has(id)) : owned.has(offer?.id);
    if (bought) { buy.hidden = true; dialog.querySelector('[data-availability]').textContent = 'You already have these extras on this device.'; }
    else dialog.querySelector('[data-availability]').textContent = url ? 'One payment for the listed items. Existing free content stays free.' : 'Buying is not available yet. Free play is unchanged.';
  }
  window.LudvigStore = Object.freeze({
    owns: id => owned.has(id),
    subscribe(fn) { if (typeof fn !== 'function') return () => {}; listeners.add(fn); fn({ owned: [...owned], environment: 'test', ready: catalog?.ready === true }); return () => listeners.delete(fn); },
    open(id) { selected = ['bundle', ...ENTITLEMENTS].includes(id) ? id : 'bundle'; if (!dialog) buildDialog(); focusBefore = document.activeElement; render(); if (!dialog.open) dialog.showModal(); },
  });
  window.addEventListener('storage', event => { if (event.key === STORAGE || event.key === null) { revision++; restore(); } });
  api('/api/store').then(data => {
    if (data.environment !== 'test' || !Array.isArray(data.products)) return;
    catalog = data; render(); return restore();
  }).catch(() => { owned = new Set(); publish(); });
})();
