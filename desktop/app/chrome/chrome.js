const $ = (id) => document.getElementById(id);
let current = null;

function render(s) {
  current = s;
  const { r, g, b } = s.tint;
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
  document.documentElement.style.setProperty("--tint", `${r} ${g} ${b}`);
  document.documentElement.style.setProperty("--ink", light ? "#111111" : "#f2f2f2");
  $("home").hidden = s.onHome || s.status !== "ready";
  $("host").hidden = !s.joined;
  if (s.joined) $("host").textContent = `On ${s.joined.name}`;
  $("together").setAttribute("aria-expanded", String(s.panel));

  $("panel").hidden = !s.panel;
  $("backdrop").hidden = !s.panel;
  if (!s.panel) return;

  $("joined").hidden = !s.joined;
  if (s.joined) $("joined-text").textContent = `You're playing on ${s.joined.name}. Scores and rooms are on that Mac.`;

  const canShare = Boolean(s.shareUrl);
  $("invite").hidden = !canShare;
  $("offline").hidden = canShare;
  if (canShare) {
    $("qr").innerHTML = s.qr || "";
    $("url").textContent = s.shareUrl.replace(/^http:\/\//, "");
    $("url").title = s.shareUrl;
  }

  const others = s.nearby.filter((p) => !s.joined || p.address !== s.joined.address);
  const list = $("nearby");
  list.replaceChildren(
    ...others.map((p) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = p.name;
      const join = document.createElement("button");
      join.className = "secondary";
      join.textContent = "Join";
      join.addEventListener("click", () => window.app.join(p.id));
      li.append(name, join);
      return li;
    }),
  );
  $("nearby-empty").hidden = others.length > 0;
}

$("records").addEventListener("click", () => window.app.records());
$("home").addEventListener("click", () => window.app.home());
$("together").addEventListener("click", () => window.app.panel(!current.panel));
$("host").addEventListener("click", () => window.app.panel(true));
$("backdrop").addEventListener("click", () => window.app.panel(false));
$("leave").addEventListener("click", () => window.app.leave());
$("copy").addEventListener("click", () => {
  if (!current.shareUrl) return;
  window.app.copy(current.shareUrl);
  $("copy").textContent = "Copied";
  setTimeout(() => ($("copy").textContent = "Copy"), 1400);
});

window.app.onState(render);
window.app.state().then(render);
