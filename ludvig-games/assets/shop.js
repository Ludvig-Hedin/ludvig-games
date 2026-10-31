/* Catalogue controls share the same checkout and licence flow as the games. */
(() => {
  'use strict';
  const store = window.LudvigStore;
  const status = document.querySelector('[data-shop-status]');
  const buttons = [...document.querySelectorAll('[data-store-offer]')];
  const restore = document.querySelector('[data-store-restore]');
  if (!store || !status || !restore) return;

  for (const button of buttons) button.addEventListener('click', () => store.open(button.dataset.storeOffer));
  restore.addEventListener('click', () => store.open('bundle'));
  store.subscribe(state => {
    const owned = new Set(state.owned);
    const ready = state.ready === true;
    for (const button of buttons) {
      const id = button.dataset.storeOffer;
      const hasPack = id === 'bundle' ? ['ritkaos', 'pigeon', 'karts'].every(pack => owned.has(pack)) : owned.has(id);
      button.disabled = !ready;
      button.textContent = hasPack ? 'View purchase' : id === 'bundle' ? 'Buy bundle' : 'Buy pack';
    }
    restore.disabled = !ready;
    status.textContent = !ready ? 'Buying is not available yet. Free play is unchanged.'
      : state.environment === 'test' ? 'Test mode. No real payment.' : '';
    status.hidden = !status.textContent;
  });
})();
