/* Play together dialog on the hub pages: opens from the header button, closes with Esc, the close button or a
   click outside. */
(() => {
  'use strict';
  const dialog = document.getElementById('together');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  for (const button of document.querySelectorAll('[data-together-open]')) {
    button.addEventListener('click', () => dialog.showModal());
  }
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
})();
