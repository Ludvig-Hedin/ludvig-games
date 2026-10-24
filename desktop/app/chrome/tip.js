const $ = (id) => document.getElementById(id);

function render(s) {
  const tip = s.tip;
  if (!tip) return;
  $("title").textContent = `Play ${tip.name} with friends`;
  $("hint").textContent = tip.hint || "";
  $("local").textContent = tip.local ? `Or on this Mac: ${tip.local}` : "";
  $("foot").textContent = tip.qr ? "Friends on this Wi‑Fi scan the code to open it." : "Connect to Wi‑Fi so others can join. No internet needed.";
  $("qr").innerHTML = tip.qr || "";
  // Tell the app how tall the card is, so its window fits it exactly.
  requestAnimationFrame(() => window.app.tipSize(Math.ceil($("tip").getBoundingClientRect().height)));
}

$("close").addEventListener("click", () => window.app.dismissTip());
window.app.onState(render);
window.app.state().then(render);
