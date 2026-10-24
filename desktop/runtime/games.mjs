// Every server the app runs, with a fixed port so invite links and QR codes stay the same between launches.
// `site` is the game's public address; links to it inside the app are sent to the local copy instead.
// LUDVIG_PORT_OFFSET moves every port, so a development check can run beside the installed app.
const OFFSET = Number((typeof process !== "undefined" && process.env.LUDVIG_PORT_OFFSET) || 0);

export const HUB = { id: "hub", name: "Ludvig Games", port: 47800 + OFFSET, site: "https://games.ludvighedin.com" };

export const GAMES = [
  { id: "ritkaos", name: "Ritkaos", port: 47801 },
  { id: "salvo", name: "Salvo", port: 47802 },
  { id: "hangd", name: "Hängd", port: 47803 },
  { id: "little-links", name: "Little Links", port: 47804 },
  { id: "color-clash", name: "Color Clash", port: 47805 },
  { id: "ludo", name: "Ludo", port: 47806 },
  { id: "air-hockey", name: "Air Hockey", port: 47807 },
  { id: "hoop-rush", name: "Hoop Rush", port: 47808 },
  { id: "gravity-arena", name: "Gravity Arena", port: 47809 },
  { id: "ox", name: "OX", port: 47810 },
  { id: "table-tennis", name: "Table Tennis", port: 47811 },
  { id: "chess", name: "Chess", port: 47812 },
  { id: "mind-games", name: "Mind Games", port: 47813 },
].map((g) => ({ ...g, port: g.port + OFFSET, site: `https://${g.id}.ludvighedin.com` }));

export const ALL = [HUB, ...GAMES];
