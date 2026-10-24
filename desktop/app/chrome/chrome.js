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
  const badge = $("together-count");
  badge.hidden = !s.devices.length || Boolean(s.joined);
  badge.textContent = String(s.devices.length);
  renderUpdate(s.update);

  $("panel").hidden = !s.panel;
  $("backdrop").hidden = !s.panel;
  if (!s.panel) return;

  $("joined").hidden = !s.joined;
  if (s.joined) $("joined-text").textContent = `You're playing on ${s.joined.name}. Scores and rooms are on that Mac.`;

  const canShare = Boolean(s.shareUrl);
  $("invite").hidden = !canShare;
  $("offline").hidden = canShare;
  if (canShare) {
    const copy = shareCopy(s);
    $("share-title").textContent = copy.title;
    $("share-sub").textContent = copy.sub;
    $("share-sub").hidden = !copy.sub;
    $("steps").classList.toggle("single", copy.steps.length === 1);
    $("steps").replaceChildren(...copy.steps.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }));
    $("qr").innerHTML = s.qr || "";
    $("url").textContent = s.shareUrl.replace(/^http:\/\//, "");
    $("url").title = s.shareUrl;
  }

  $("devices-title").hidden = Boolean(s.joined);
  $("devices").hidden = Boolean(s.joined);
  $("devices").replaceChildren(...s.devices.map((d) => {
    const li = document.createElement("li");
    const who = document.createElement("span");
    who.className = "who";
    const dot = document.createElement("i");
    dot.className = "dot";
    const name = document.createElement("span");
    name.textContent = d.kind;
    who.append(dot, name);
    const where = document.createElement("em");
    where.textContent = d.game ? `in ${d.game}` : "in All games";
    li.append(who, where);
    return li;
  }));
  $("devices-empty").hidden = Boolean(s.joined) || s.devices.length > 0;

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

const quote = (steps) => steps.map((x) => `“${x}”`).join(", then ");

/** Panel wording for where the host is: start page, a game, an open room or a one-player game. */
function shareCopy(s) {
  const ctx = s.context;
  const room = s.room && ctx && s.room.game === ctx.id ? s.room : null;
  if (!ctx || ctx.id === "hub") {
    return {
      title: "Invite friends on this Wi‑Fi",
      sub: "They scan the code and get the same games in their browser. Nothing to install.",
      steps: ["Everyone opens the same game.", "Pick a game for 2+ players and follow its Play together steps here."],
    };
  }
  const name = ctx.name || "this game";
  const t = ctx.together;
  if (!t) {
    return {
      title: `${name} is a one-player game`,
      sub: "Friends can scan the code to open the games and pick one for 2+ players.",
      steps: [],
    };
  }
  const online = t.online;
  if (room && room.kind === "invite") {
    return { title: "Scan to join your room", sub: `Room ${room.code} · ${name}`, steps: ["Friends on this Wi‑Fi scan the code and land in your room."] };
  }
  if (room && room.kind === "mp" && online && online.inviteParam) {
    return { title: "Scan to join your room", sub: `Room ${room.code} · ${name}`, steps: ["Friends on this Wi‑Fi scan the code. The game opens with your room code filled in, ready to join."] };
  }
  if (room && room.kind === "mp") {
    const steps = [`Friends scan the code to open ${name}.`];
    if (room.quick || (online && online.quickMatch)) steps.push(`They tap ${quote(online ? online.steps : ["Play online"])}. Everyone on this Wi‑Fi lands in the same room.`);
    else steps.push(`They tap ${quote(online ? online.steps : ["Play online"])} and enter ${room.code}.`);
    return { title: `Room ${room.code}`, sub: name, steps };
  }
  const steps = [];
  if (online) {
    steps.push(`Everyone scans the code to open ${name}.`);
    steps.push(t.hint || `Tap ${quote(online.steps)}.`);
    if (online.inviteParam) steps.push("When you open a room, this code changes to join it directly.");
  }
  if (t.local) steps.push(`Or on this Mac: tap ${quote(t.local.steps || [])}${t.local.how ? ` (${t.local.how})` : ""}.`);
  return { title: `Play ${name} together`, sub: online ? "" : "This game is played on one device.", steps };
}

function renderUpdate(u) {
  const button = $("update");
  button.hidden = !u;
  if (!u) return;
  const label = {
    available: `Update to ${u.version}`,
    manual: `Version ${u.version} is out`,
    downloading: `Updating ${Math.round((u.progress || 0) * 100)}%`,
    ready: "Restart to update",
    failed: "Update failed, try again",
  }[u.status];
  button.textContent = label;
  button.disabled = u.status === "downloading";
  button.classList.toggle("is-ready", u.status === "ready");
}

$("update").addEventListener("click", () => window.app.update());
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
