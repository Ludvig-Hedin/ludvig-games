/* Cubeville game logic: worlds, course layouts, progression and the online protocol.
   Pure ES module (no DOM, no three.js) so it runs in node: tests/logic.test.mjs. */

export const GAME_ID = 'cubeville';
export const MAX_PLAYERS = 8;
export const RACE_WINS_BOARD = 'cubeville:race-wins';
export const PROGRESS_KEY = 'cubeville-progress-v1';

/* ---------- Worlds ---------- */

// The first six are the original worlds (ids, copy and boards unchanged). `par` is the time for the third star.
export const WORLDS = [
  {id:'obby',title:'Obby Rush',by:'The sky is the starting line.',genre:'Parkour',tag:'FAN FAVORITE',players:'12.4K',likes:98,par:20,description:'Hop between rainbow islands, catch the coins, and reach the gold platform. Checkpoints save your place. Your next jump is always a little higher.'},
  {id:'tower',title:'Tower Climb',by:'A little higher. One more try.',genre:'Parkour',tag:'REACH NEW HEIGHTS',players:'8.2K',likes:96,par:25,description:'Take the spiral route into the clouds. Follow the coins around the tower, activate both checkpoints, and conquer the gold summit.'},
  {id:'build',title:'Build Battle',by:"Builder’s Run · Construction parkour",genre:'Adventure',tag:'BUILDER’S RUN',players:'6.7K',likes:94,par:22,description:'Play Builder’s Run: a construction-themed parkour course through colorful blocks and towering cranes. Climb the unfinished skyline to its gold rooftop.'},
  {id:'hangout',title:'Lobby Hangout',by:'Take the scenic route.',genre:'Social',tag:'TAKE IT EASY',players:'4.1K',likes:97,par:12,description:'Explore a peaceful plaza with a fountain, garden benches, and a few friendly locals. Pick up coins on your way to the gold terrace.'},
  {id:'lava',title:'Lava Parkour',by:'The floor is very, very lava.',genre:'Parkour',tag:'WATCH YOUR STEP',players:'9.3K',likes:95,par:22,description:'Cross basalt stepping stones above a sea of lava. Find safe checkpoints and make the final leap to gold. Missing a jump costs health, but your checkpoint is waiting.'},
  {id:'spawn',title:'Spawn World',by:'Every adventure starts somewhere.',genre:'Adventure',tag:'EXPLORE',players:'3.8K',likes:99,par:18,description:'Discover a chain of floating garden islands. Wide platforms make this a friendly first adventure. Follow the golden coins all the way to the lookout.'},
  {id:'shuttle',title:'Sky Shuttle',by:'Moving platforms',genre:'Parkour',mech:'moving',players:'5.9K',likes:95,par:40,sky:0xbfe3f5,ground:0x9cc8e0,description:'Ride sliding platforms and rising lifts across the sky. Time each jump and the gold platform is yours.'},
  {id:'factory',title:'Conveyor Factory',by:'Conveyor belts',genre:'Parkour',mech:'conveyor',players:'4.6K',likes:93,par:35,sky:0xc9cdd8,ground:0x7f8796,description:'Run across moving belts. Some push you forward, some push you back, and some push you off the side.'},
  {id:'windy',title:'Windy Peaks',by:'Wind fans',genre:'Parkour',mech:'wind',players:'5.1K',likes:96,par:35,sky:0xcfe8f3,ground:0xdfeaf0,description:'Fans lift you to the next peak. Side winds try to blow you off the narrow bridges.'},
  {id:'crumble',title:'Crumble Bridge',by:'Disappearing tiles',genre:'Parkour',mech:'crumble',players:'6.3K',likes:94,par:25,sky:0xf3dcc8,ground:0xc98f6a,description:'Tiles fall a moment after you step on them. Keep moving and do not look back.'},
  {id:'clock',title:'Clockwork Gates',by:'Timed doors',genre:'Parkour',mech:'doors',players:'3.9K',likes:92,par:40,sky:0xd9d3ec,ground:0x8f89b8,description:'Gates open and close on a beat. Wait for the green light, then run.'},
  {id:'bounce',title:'Bounce Garden',by:'Bounce pads',genre:'Parkour',mech:'bounce',players:'7.4K',likes:97,par:30,sky:0xd6f1de,ground:0x8fcf9f,description:'Bounce pads launch you to high ledges. Steer in the air and aim for the next pad.'},
  {id:'summit',title:'Summit Marathon',by:'Checkpoints',genre:'Adventure',mech:'marathon',players:'2.7K',likes:96,par:75,sky:0xc9dcf0,ground:0xa9bdd6,description:'The long one. Every mechanic in one climb, with six checkpoints to save your progress.'}
];
export const worldById = id => WORLDS.find(w => w.id === id) || null;
export const RACE_WORLDS = WORLDS.filter(w => w.id !== 'hangout').map(w => w.id);

/* ---------- Course building ----------
   `api` is provided by the renderer (index.html) or a recorder in tests. Coordinates describe TOP surfaces.
   Every builder returns { spawn, goal, checkpoints, path, bounds, title, description }. */

export function buildCourse(api, gameId) {
  if (gameId === 'plaza') return buildPlaza(api);
  if (LAYOUTS[gameId]) return buildLayout(api, gameId);
  return buildClassic(api, gameId);
}

// The six original courses, unchanged except that they now record a route for race progress.
function buildClassic(api, gameId) {
  const checkpoints = [];
  const checkpoint = (x, y, z) => {
    api.checkpoint(x, y, z);
    checkpoints.push([x, y + 0.04, z]);
  };
  const spawnMarker = () => {
    api.decorBox(0, 0.035, 6, 4.4, 0.07, 4.4, 0xe8f7ff);
    api.decorBox(0, 0.075, 6, 2.9, 0.015, 2.9, 0x299bff);
  };
  const sceneryIsland = (x, z, color = 0x79d48f, size = 9) => {
    api.block(x, -1.6, z, size, 3.8, size, color);
    api.tree(x, -1.6, z, 0.85);
  };
  const clouds = (length = 95) => {
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      api.cloud(side * (24 + (i % 3) * 9), 8 + (i % 4) * 5,
        5 - (i / 9) * length, 0.8 + (i % 3) * 0.35);
    }
  };

  if (gameId === 'hangout') {
    api.block(0, 0, -17, 52, 3, 64, 0x86d694);
    api.decorBox(0, 0.035, -13, 9, 0.06, 52, 0xe2d8c3);
    api.decorBox(0, 0.065, -13, 0.18, 0.015, 49, 0xffffff);
    spawnMarker();
    api.sign(-7, 1.1, 7, 'LOBBY HANGOUT', 0x42bd88);
    for (const side of [-1, 1]) {
      for (const z of [5, -10, -25, -41]) api.tree(side * 21, 0, z, 1.1);
      for (const z of [-5, -24]) {
        api.block(side * 12, 0.9, z, 4.8, 0.25, 1.4, 0xc79058);
        api.decorBox(side * 12, 1.5, z - 0.65, 4.8, 1.15, 0.2, 0xdeac71);
        api.decorBox(side * 13.6, 0.4, z, 0.22, 0.8, 1.1, 0x44556b);
        api.decorBox(side * 10.4, 0.4, z, 0.22, 0.8, 1.1, 0x44556b);
      }
    }
    // A small fountain and flower boxes leave the central walking lane clear.
    api.block(13, 0.7, -14, 7, 0.7, 7, 0xe5e8f0);
    api.decorBox(13, 0.74, -14, 5.6, 0.08, 5.6, 0x6ad1ee);
    api.decorBox(13, 1.75, -14, 0.5, 2.1, 0.5, 0x7ddffa);
    for (const x of [-14, 14]) {
      api.block(x, 0.65, -34, 5.5, 0.65, 2, 0xf0c395);
      for (let i = 0; i < 5; i++)
        api.decorBox(x - 2 + i, 1, -34, 0.55, 0.65, 0.55,
          [0xff7f91, 0xffc960, 0xae8fe5][i % 3]);
    }
    api.block(0, 0.4, -30, 11, 0.4, 3, 0xc4becf);
    api.block(0, 0.8, -32.5, 12, 0.8, 3, 0xd7d1df);
    for (const z of [0, -9, -18, -27]) api.coin(0, 1.35, z);
    checkpoint(0, 0, -23);
    api.coin(0, 2.55, -35);
    api.goal(0, 1.2, -40, 16, 12);
    clouds(70);
    return {spawn: [0, 0.08, 6], goal: [0, 1.2, -40], checkpoints,
      path: [[0, 0, 6], [0, 0, -23], [0, 0.8, -32.5], [0, 1.2, -40]],
      bounds: {minX: -80, maxX: 80, minZ: -95, maxZ: 35, killY: -11},
      title: 'Lobby Hangout', description: 'Take a stroll through the plaza and reach the gold terrace.'};
  }

  const routes = {
    obby: {
      title: 'Obby Rush', sign: 'OBBY RUSH', description: 'Follow the floating rainbow to the gold platform.',
      palette: [0x69c7fa, 0xbc92f1, 0xff93ac, 0xffca72, 0x85dab3], checks: [3, 6],
      pads: [[0, 0.55, -10, 7, 7], [-3, 1.15, -19, 7, 7], [1, 1.7, -28, 7, 7],
        [4, 2.2, -37, 9, 8], [0, 2.8, -47, 8, 7], [-4, 3.4, -56, 7, 7],
        [-1, 4, -65, 9, 8], [3, 4.6, -74, 7, 7], [0, 5.2, -84, 12, 10]]
    },
    tower: {
      title: 'Tower Climb', sign: 'TOWER CLIMB', description: 'Climb the spiral. Two checkpoints catch your progress.',
      palette: [0xb6a1f4, 0x9791e7, 0x83baf1, 0x75d6d6], checks: [4, 8],
      pads: [[0, 0.6, -10, 8, 8], [-6, 1.65, -18, 8, 8], [-10, 2.7, -27, 8, 8],
        [-6, 3.75, -36, 8, 8], [3, 4.8, -40, 9, 8], [12, 5.85, -35, 8, 8],
        [16, 6.9, -26, 8, 8], [11, 7.95, -17, 8, 8], [2, 9, -13, 9, 8],
        [-6, 10.05, -18, 8, 8], [-9, 11.1, -27, 8, 8], [-3, 12.15, -34, 8, 8],
        [5, 13.2, -32, 12, 10]]
    },
    build: {
      title: "Builder's Run", sign: "BUILDER'S RUN", description: 'Jump across the construction yard to finish the build.',
      palette: [0xf4c46a, 0x69becb, 0xed9f76, 0x8dadd3], checks: [3, 6],
      pads: [[0, 0.45, -10, 8, 7], [4, 1, -19, 8, 7], [-2, 1.65, -28, 8, 8],
        [-6, 2.3, -38, 9, 8], [1, 3, -48, 8, 8], [7, 3.65, -58, 8, 8],
        [2, 4.4, -68, 9, 8], [-4, 5.15, -78, 8, 8], [0, 5.9, -89, 12, 10]]
    },
    lava: {
      title: 'Lava Parkour', sign: 'LAVA PARKOUR', description: 'Stay on the basalt islands. The lava sends you to your checkpoint.',
      palette: [0x66677f, 0x78748d, 0x626780, 0x898093], checks: [2, 5],
      pads: [[0, 0.45, -10, 8, 7], [3, 1, -19, 7, 7], [-1, 1.5, -28, 8, 8],
        [-6, 2.05, -38, 8, 8], [0, 2.6, -48, 9, 8], [6, 3.2, -58, 8, 8],
        [2, 3.85, -68, 7, 8], [-4, 4.5, -78, 8, 8], [0, 5.15, -89, 12, 10]]
    },
    spawn: {
      title: 'Spawn World', sign: 'SPAWN WORLD', description: 'Explore the garden islands and find the gold lookout.',
      palette: [0x82d99b, 0x95df95, 0x72caa0, 0xafd98b], checks: [1, 3],
      pads: [[0, 0.3, -13, 12, 11], [5, 0.7, -28, 13, 13], [-2, 1.2, -43, 13, 13],
        [2, 1.7, -58, 14, 13], [0, 2.25, -74, 17, 15]]
    }
  };
  const id = routes[gameId] ? gameId : 'obby';
  const config = routes[id];
  const startColor = id === 'lava' ? 0x6b6a83 : id === 'build' ? 0xead7af : 0x7bdaac;
  api.block(0, 0, 4, id === 'spawn' ? 20 : 16, 3.2, id === 'spawn' ? 18 : 16, startColor);
  spawnMarker();
  api.sign(-5.6, 1.2, 5, config.sign, config.palette[0]);
  api.coin(0, 1.4, -1);
  const lastIndex = config.pads.length - 1;
  config.pads.forEach(([x, y, z, w, d], i) => {
    const finish = i === lastIndex;
    const color = finish ? 0xffd166 : config.palette[i % config.palette.length];
    const thickness = id === 'build' ? y + 7 : id === 'lava' ? 2.4 : 1.25;
    if (finish) {
      api.goal(x, y, z, w, d);
      return;
    }
    // Rotating details sit on a static, square collision pad, keeping every landing predictable.
    if (id === 'obby' && i === 5) api.spin(x, y, z, w, d, color);
    else api.block(x, y, z, w, thickness, d, color);
    api.coin(x, y + 1.35, z);
    if (config.checks.includes(i)) checkpoint(x, y, z + 1.2);
    if (id === 'build' && !finish) {
      api.decorBox(x, y - 0.13, z + d / 2 + 0.018, w * 0.9, 0.16, 0.04, 0xffe494);
      for (let rib = -1; rib <= 1; rib++)
        api.decorBox(x + rib * w * 0.28, y - thickness / 2, z + d / 2 + 0.025,
          0.08, thickness * 0.84, 0.05, 0x547283);
    }
    if (id === 'spawn') {
      api.tree(x - w / 2 + 1.6, y, z - 1.5, 0.75);
      if (i % 2 === 0) api.tree(x + w / 2 - 1.6, y, z - 2, 0.8);
      api.coin(x, y + 1.35, z + d / 2 - 1.5);
    }
  });

  if (id === 'tower') {
    for (const x of [-21, 23]) {
      api.decorBox(x, -0.5, -28, 2, 27, 2, 0x817ca8);
      api.decorBox(x, 13.2, -28, 3.5, 0.5, 3.5, 0xc9bcf1);
    }
    api.decorBox(1, -8, -26, 53, 1.2, 55, 0xaaa4ce);
    clouds(64);
  } else if (id === 'build') {
    for (const [x, z, height] of [[21, -32, 18], [-22, -72, 22]]) {
      api.decorBox(x, height / 2 - 6, z, 1.5, height, 1.5, 0xf6b93f);
      api.decorBox(x - Math.sign(x) * 7, height - 6, z, 18, 0.8, 1.2, 0xf6b93f);
      api.decorBox(x - Math.sign(x) * 14, height - 9, z, 0.12, 6, 0.12, 0x586677);
      api.decorBox(x - Math.sign(x) * 14, height - 12, z, 1.4, 0.6, 1.4, 0x586677);
    }
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? 1 : -1) * (23 + (i % 3) * 3);
      api.decorBox(x, -3, -8 - i * 13, 8, 9 + i % 3, 7, config.palette[i % 4]);
    }
    clouds();
  } else if (id === 'lava') {
    api.hazard(0, -2.8, -40, 90, 3.5, 135, {color: 0xff6239});
    for (let i = 0; i < 10; i++) {
      const x = (i % 2 ? 1 : -1) * (19 + (i % 3) * 5);
      api.block(x, -0.2 + i % 3, -5 - i * 10, 7, 8, 8, 0x514d66);
      api.decorBox(x, -0.1 + i % 3, -5 - i * 10, 2, 0.12, 2, 0xff9256);
    }
    clouds();
  } else {
    for (let i = 0; i < 6; i++) sceneryIsland((i % 2 ? 1 : -1) * (23 + i % 3 * 4), -12 - i * 13);
    if (id === 'spawn') api.decorBox(0, -7.5, -35, 130, 0.7, 145, 0x79cfe9);
    clouds();
  }
  const end = config.pads[lastIndex];
  return {spawn: [0, 0.08, 6], goal: end.slice(0, 3), checkpoints,
    path: [[0, 0, 6], ...config.pads.map(([x, y, z]) => [x, y, z])],
    bounds: {minX: -85, maxX: 85, minZ: -135, maxZ: 40, killY: -11},
    title: config.title, description: config.description};
}

/* New worlds are segment lists laid out front to back. Each segment starts `gap` after the previous one ends
   and sits `dy` above the previous top. Kinds: pad, goal, mover (sine on x/y/z), belt (conveyor), fan (updraft),
   bridge (narrow, side wind), tile (falls after you step on it), gate (pad with timed doors), bounce. */
const DEFAULTS = {x: 0, w: 7, d: 7, gap: 2.5, dy: 0.3};
const zig = (n, opts, amp = 1.2) => Array.from({length: n}, (_, i) => ({k: 'tile', x: i % 2 ? amp : -amp, ...opts}));
export const LAYOUTS = {
  shuttle: {palette: [0x7cc7f0, 0x9fb7f7, 0x86e0d0, 0xc2a8f2], accent: 0xffb86b, decor: 'sky', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'mover', axis: 'x', amp: 3.2, period: 5, w: 5, d: 5, dy: 0.4, gap: 3},
    {k: 'pad', dy: 0.4, gap: 3},
    {k: 'mover', axis: 'x', amp: 3.6, period: 5.5, phase: 0.5, w: 5, d: 5, dy: 0.4, gap: 3},
    {k: 'pad', x: -3, dy: 0.3, gap: 3, cp: true},
    {k: 'mover', axis: 'y', amp: 1.6, period: 4.5, x: -3, w: 5, d: 5, dy: 0, gap: 3},
    {k: 'pad', x: -3, dy: 2.2},
    {k: 'mover', axis: 'x', amp: 3, period: 4.8, phase: 0.25, x: 0, w: 5, d: 5, dy: 0.3, gap: 3},
    {k: 'pad', x: 2, dy: 0.3, gap: 3, cp: true},
    {k: 'mover', axis: 'z', amp: 2.5, period: 5, x: 2, w: 5, d: 5, dy: 0.3, gap: 5.5},
    {k: 'pad', x: 2, dy: 0.3, gap: 5.5},
    {k: 'mover', axis: 'y', amp: 1.6, period: 4, phase: 0.5, w: 5, d: 5, dy: 0, gap: 3},
    {k: 'pad', dy: 2.2},
    {k: 'mover', axis: 'x', amp: 4, period: 6, w: 5, d: 5, dy: 0.3, gap: 3},
    {k: 'goal', dy: 0.4, gap: 3}
  ]},
  factory: {palette: [0x8a93a6, 0xa3acbb, 0xd9a35b, 0x7c8799], accent: 0xffc94a, decor: 'factory', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'belt', w: 6, d: 12, dy: 0.3, dir: [0, 1], speed: 3.5},
    {k: 'pad'},
    {k: 'belt', w: 12, d: 6, dy: 0.2, dir: [1, 0], speed: 4},
    {k: 'pad', cp: true},
    {k: 'belt', w: 6, d: 14, dy: 0.2, dir: [0, -1], speed: 6},
    {k: 'pad', gap: 3.5},
    {k: 'belt', w: 12, d: 6, dy: 0.2, dir: [-1, 0], speed: 4.5},
    {k: 'pad', x: 3, cp: true},
    {k: 'belt', x: 3, w: 6, d: 14, dir: [0, 1], speed: 4.5},
    {k: 'pad', x: 3},
    {k: 'belt', w: 8, d: 6, dir: [1, 0], speed: 5},
    {k: 'belt', w: 8, d: 6, gap: 1.5, dir: [-1, 0], speed: 5},
    {k: 'belt', w: 8, d: 6, gap: 1.5, dir: [1, 0], speed: 5},
    {k: 'goal', dy: 0.4}
  ]},
  windy: {palette: [0xd8e6ee, 0xa8d4c8, 0xb9c8e8, 0xe9e2cf], accent: 0x7e8fa8, decor: 'peaks', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'fan', w: 5, d: 5, dy: 0, height: 7},
    {k: 'pad', dy: 5.2, gap: 2, cp: true},
    {k: 'bridge', w: 3, d: 14, dy: 0.2, wind: [3, 0]},
    {k: 'pad', dy: 0.2},
    {k: 'fan', w: 5, d: 5, dy: 0, height: 6.6},
    {k: 'pad', x: -3, dy: 5, gap: 2},
    {k: 'fan', x: -3, w: 5, d: 5, dy: 0, height: 6.6},
    {k: 'pad', dy: 5, gap: 2, cp: true},
    {k: 'bridge', w: 3, d: 12, dy: 0.2, wind: [-3.5, 0]},
    {k: 'pad', dy: 0.2},
    {k: 'bridge', w: 3, d: 10, dy: 0.2, wind: [3.5, 0]},
    {k: 'goal', dy: 0.4}
  ]},
  crumble: {palette: [0xd9a873, 0xc98f5e, 0xe3bd8a, 0xb9876a], accent: 0xf0c27a, decor: 'canyon', segs: [
    {k: 'pad', dy: 0.5},
    ...zig(5, {w: 3.5, d: 3.5, dy: 0.15, gap: 1.6}),
    {k: 'pad', dy: 0.2, gap: 1.8, cp: true},
    ...zig(6, {w: 3.2, d: 3.2, dy: 0.1, gap: 1.4}, 2),
    {k: 'pad', dy: 0.2, gap: 1.8, cp: true},
    ...zig(5, {w: 3, d: 3, dy: 0.35, gap: 1.8}, 0),
    {k: 'goal', dy: 0.3, gap: 2}
  ]},
  clock: {palette: [0x8c86b8, 0xa79fcf, 0x7d93c4, 0x9a8fc0], accent: 0xe9d36c, decor: 'gears', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'gate', d: 10, gates: [{dz: 0, period: 3.2, open: 0.5, phase: 0}]},
    {k: 'gate', d: 10, gates: [{dz: 0, period: 3.2, open: 0.5, phase: 0.5}]},
    {k: 'pad', cp: true},
    {k: 'gate', d: 14, gates: [{dz: 3.5, period: 2.8, open: 0.5, phase: 0}, {dz: -3.5, period: 2.8, open: 0.5, phase: 0.3}]},
    {k: 'pad', x: -3},
    {k: 'gate', x: -3, d: 10, gates: [{dz: 0, period: 2.2, open: 0.45, phase: 0.2}]},
    {k: 'pad', cp: true},
    {k: 'mover', axis: 'x', amp: 3, period: 5, w: 5, d: 5, gap: 3},
    {k: 'gate', d: 12, gap: 3, gates: [{dz: 3, period: 3, open: 0.45, phase: 0}, {dz: -3, period: 3, open: 0.45, phase: 0.33}]},
    {k: 'gate', d: 10, gates: [{dz: 0, period: 1.8, open: 0.5, phase: 0}]},
    {k: 'goal', dy: 0.4}
  ]},
  bounce: {palette: [0x8fd6a3, 0xb6e39b, 0x9fd7c7, 0xc5e6a8], accent: 0xff7fae, decor: 'garden', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'bounce', w: 4, d: 4, dy: 0, power: 16},
    {k: 'pad', dy: 3.4},
    {k: 'bounce', w: 4, d: 4, dy: -1.5, power: 16},
    {k: 'pad', dy: 4, gap: 3, cp: true},
    {k: 'bounce', x: -2.5, w: 4, d: 4, dy: -0.5, power: 12.5},
    {k: 'bounce', x: 2.5, w: 4, d: 4, dy: 0, gap: 3, power: 12.5},
    {k: 'bounce', x: -2.5, w: 4, d: 4, dy: 0, gap: 3, power: 12.5},
    {k: 'pad', dy: 1.6, gap: 3, cp: true},
    {k: 'bounce', w: 4, d: 4, dy: 0, power: 18},
    {k: 'pad', dy: 5.4},
    {k: 'bounce', w: 4, d: 4, dy: -1, power: 14},
    {k: 'goal', dy: 2.6, gap: 3}
  ]},
  summit: {palette: [0xa5b8d6, 0xc7d3e6, 0x9ec2b8, 0xd8c7e8], accent: 0xffb86b, decor: 'peaks', segs: [
    {k: 'pad', dy: 0.5},
    {k: 'mover', axis: 'x', amp: 3, period: 5, w: 5, d: 5, dy: 0.4, gap: 3},
    {k: 'pad', dy: 0.4, gap: 3, cp: true},
    {k: 'belt', w: 6, d: 12, dir: [0, 1], speed: 3.5},
    {k: 'pad'},
    ...zig(3, {w: 3.5, d: 3.5, dy: 0.15, gap: 1.6}),
    {k: 'pad', dy: 0.2, gap: 1.8, cp: true},
    {k: 'bounce', w: 4, d: 4, dy: 0, power: 16},
    {k: 'pad', dy: 3.4},
    {k: 'gate', d: 10, gates: [{dz: 0, period: 3, open: 0.5, phase: 0}]},
    {k: 'pad', cp: true},
    {k: 'fan', w: 5, d: 5, dy: 0, height: 7},
    {k: 'pad', dy: 5.2, gap: 2},
    {k: 'bridge', w: 3, d: 12, dy: 0.2, wind: [3, 0]},
    {k: 'pad', dy: 0.2, cp: true},
    {k: 'mover', axis: 'y', amp: 1.6, period: 4.5, w: 5, d: 5, dy: 0, gap: 3},
    {k: 'pad', dy: 2.2},
    {k: 'belt', w: 12, d: 6, dy: 0.2, dir: [1, 0], speed: 4.5},
    {k: 'pad', cp: true},
    ...zig(4, {w: 3.2, d: 3.2, dy: 0.1, gap: 1.4}, 2),
    {k: 'mover', axis: 'x', amp: 3.5, period: 5.5, w: 5, d: 5, gap: 2.5},
    {k: 'pad', gap: 3, cp: true},
    {k: 'bounce', w: 4, d: 4, dy: 0, power: 16},
    {k: 'goal', dy: 3.6}
  ]}
};

/** Absolute placement of a layout: [{...segment, top, z}] in order. Used by the builder and the tests. */
export function placeSegments(segs) {
  let edge = -4, y = 0;
  return segs.map(raw => {
    const s = {...DEFAULTS, ...(raw.k === 'goal' ? {w: 12, d: 10} : {}), ...raw};
    const top = y + s.dy, z = edge - s.gap - s.d / 2;
    edge = z - s.d / 2; y = top;
    return {...s, top, z};
  });
}

function buildLayout(api, id) {
  const world = worldById(id), def = LAYOUTS[id], placed = placeSegments(def.segs);
  const checkpoints = [], path = [[0, 0, 6]];
  const color = i => def.palette[i % def.palette.length];
  api.block(0, 0, 4, 16, 3.2, 16, def.palette[0]);
  api.decorBox(0, 0.035, 6, 4.4, 0.07, 4.4, 0xe8f7ff);
  api.decorBox(0, 0.075, 6, 2.9, 0.015, 2.9, 0x299bff);
  api.sign(-5.6, 1.2, 5, world.title.toUpperCase(), def.accent);
  api.coin(0, 1.4, -1);
  let goal = null, tile = 0;
  placed.forEach((s, i) => {
    const {x, top, z, w, d} = s;
    const coin = (cy = top + 1.35, cz = z) => { if (s.coin !== false) api.coin(x, cy, cz); };
    switch (s.k) {
      case 'goal': api.goal(x, top, z, w, d); goal = [x, top, z]; break;
      case 'pad': api.block(x, top, z, w, 1.25, d, color(i)); coin(); break;
      case 'mover': api.mover({x, top, z, w, d, color: def.accent, axis: s.axis, amp: s.amp, period: s.period, phase: s.phase || 0}); break;
      case 'belt': api.conveyor({x, top, z, w, d, dir: s.dir, speed: s.speed}); coin(); break;
      case 'fan': api.fan({x, top, z, w, d, height: s.height}); coin(top + 4); break;
      case 'bridge':
        api.block(x, top, z, w, 0.9, d, color(i));
        api.wind({x, y: top, z, w: w + 10, h: 5.5, d, px: s.wind[0], pz: s.wind[1]});
        coin(); break;
      case 'tile': api.crumble({x, top, z, w, d, color: def.accent}); if (tile++ % 2) coin(); break;
      case 'gate':
        api.block(x, top, z, w, 1.25, d, color(i));
        for (const g of s.gates) api.door({x, top, z: z + g.dz, w, h: 3.4, d: 0.6, period: g.period, open: g.open, phase: g.phase || 0});
        coin(top + 1.35, z + d / 2 - 1.5); break;
      case 'bounce': api.bounce({x, top, z, w, d, power: s.power}); coin(top + 3.2); break;
      default: break;
    }
    if (s.cp) { api.checkpoint(x, top, z + 1.2); checkpoints.push([x, top + 0.04, z + 1.2]); }
    path.push([x, top, z]);
  });
  const endZ = placed[placed.length - 1].z, maxTop = Math.max(...placed.map(s => s.top));
  decorate(api, def.decor, endZ, maxTop, def.palette);
  return {spawn: [0, 0.08, 6], goal, checkpoints, path,
    bounds: {minX: -85, maxX: 85, minZ: endZ - 45, maxZ: 40, killY: -11},
    title: world.title, description: world.description};
}

function decorate(api, kind, endZ, maxTop, palette) {
  const length = -endZ;
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    api.cloud(side * (26 + (i % 3) * 9), 9 + (i % 4) * 5 + maxTop * 0.5, 5 - (i / 11) * length, 0.8 + (i % 3) * 0.35);
  }
  const count = Math.max(6, Math.round(length / 14));
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1, z = -8 - i * (length / count), x = side * (24 + (i % 3) * 4);
    if (kind === 'factory') {
      api.decorBox(x, -4 + (i % 3), z, 6, 14 + (i % 3) * 3, 6, palette[i % palette.length]);
      api.decorBox(x, 5 + (i % 3) * 2.5, z, 1.4, 6, 1.4, 0x5d6575);
    } else if (kind === 'peaks') {
      api.peak(x * 1.3, -12, z, 9 + (i % 3) * 3, 16 + (i % 4) * 4 + maxTop * 0.4);
    } else if (kind === 'canyon') {
      api.decorBox(side * 30, -6 + (i % 3) * 2, z, 10, 16 + (i % 3) * 3, 12, palette[i % palette.length]);
    } else if (kind === 'gears') {
      api.gear(side * 22, 4 + (i % 3) * 3, z, 2.5 + (i % 2), i % 2 ? 0.4 : -0.3);
    } else if (kind === 'garden') {
      api.block(x, -1.6, z, 8, 3.8, 8, 0x86d694); api.tree(x, -1.6, z, 0.9);
    } else {
      api.block(x, -1.6, z, 8, 3.8, 8, palette[i % palette.length]); api.tree(x, -1.6, z, 0.8);
    }
  }
  if (kind === 'factory') api.decorBox(0, -9, endZ / 2, 140, 0.8, length + 90, 0x6e7584);
}

// Online hangout between rounds: open square, fountain, podium for the top three, a few cubes to hop on.
function buildPlaza(api) {
  api.block(0, 0, 0, 46, 3, 46, 0x86d694);
  api.decorBox(0, 0.03, 0, 30, 0.05, 30, 0xe2d8c3);
  api.decorBox(0, 0.035, 14, 4.4, 0.07, 4.4, 0xe8f7ff);
  api.decorBox(0, 0.075, 14, 2.9, 0.015, 2.9, 0x299bff);
  api.block(0, 0.7, 0, 6, 0.7, 6, 0xe5e8f0);
  api.decorBox(0, 0.74, 0, 4.8, 0.08, 4.8, 0x6ad1ee);
  api.decorBox(0, 1.75, 0, 0.5, 2.1, 0.5, 0x7ddffa);
  const podium = [[0, 1.5, -15], [-3.2, 1.0, -15], [3.2, 0.6, -15]];
  [0xffd166, 0xd7dce6, 0xe3a46c].forEach((c, i) => { const [x, y, z] = podium[i]; api.block(x, y, z, 3, y, 3, c); });
  for (const [x, z] of [[-19, -19], [19, -19], [-19, 19], [19, 19], [-19, 0], [19, -8]]) api.tree(x, 0, z, 1.05);
  for (const side of [-1, 1]) {
    api.block(side * 10, 0.9, 8, 4.8, 0.25, 1.4, 0xc79058);
    api.decorBox(side * 10, 1.5, 8.65, 4.8, 1.15, 0.2, 0xdeac71);
  }
  [[15, 0.8, 10], [15, 1.6, 6.5], [15, 2.4, 3], [15, 3.2, -0.5]].forEach(([x, y, z], i) => api.block(x, y, z, 2.6, 0.8, 2.6, [0xff93ac, 0xffca72, 0x85dab3, 0x69c7fa][i]));
  for (const x of [-14, 14]) {
    api.block(x, 0.65, -10, 5.5, 0.65, 2, 0xf0c395);
    for (let i = 0; i < 5; i++) api.decorBox(x - 2 + i, 1, -10, 0.55, 0.65, 0.55, [0xff7f91, 0xffc960, 0xae8fe5][i % 3]);
  }
  for (let i = 0; i < 8; i++) api.cloud((i % 2 ? 1 : -1) * (28 + (i % 3) * 8), 10 + (i % 4) * 4, 20 - i * 7, 0.9 + (i % 3) * 0.3);
  return {spawn: [0, 0.08, 14], goal: null, checkpoints: [], path: [[0, 0, 14]], podium,
    bounds: {minX: -70, maxX: 70, minZ: -70, maxZ: 70, killY: -11}, title: 'Plaza', description: ''};
}

/* ---------- Route progress (live race positions) ---------- */

export function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
  return total;
}

/** 0..1 along the route for a position (closest point on the polyline, 3D so spirals stay distinct). */
export function pathProgress(path, x, y, z) {
  if (!path || path.length < 2) return 0;
  const total = pathLength(path) || 1;
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay, az] = path[i - 1], [bx, by, bz] = path[i];
    const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz, len = Math.sqrt(len2);
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2)) : 0;
    const d = Math.hypot(ax + dx * t - x, (ay + dy * t - y) * 1.5, az + dz * t - z);
    if (d < best) { best = d; at = run + t * len; }
    run += len;
  }
  return Math.max(0, Math.min(1, at / total));
}

/* ---------- Progression: stars, daily world, shop ---------- */

export const STAR = {finish: 1, coins: 2, time: 4};
export function starMask({coins, total, time, par}) {
  let mask = STAR.finish;
  if (total > 0 && coins >= total) mask |= STAR.coins;
  if (Number.isFinite(time) && Number.isFinite(par) && time <= par) mask |= STAR.time;
  return mask;
}
export const countStars = mask => ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0);

export function dayKey(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** Same world for everyone on the same calendar day. */
export const featuredWorld = (day, ids = RACE_WORLDS) => ids[hashString('cubeville:' + day) % ids.length];

export const FINISH_REWARD = 150, STAR_REWARD = 50, FEATURED_MULTIPLIER = 2;
export const finishReward = ({featured = false, newStars = 0} = {}) => FINISH_REWARD * (featured ? FEATURED_MULTIPLIER : 1) + STAR_REWARD * newStars;
/** Online placement bonus, only when at least two players started the race. */
export const placeBonus = (place, racers) => racers < 2 || !place ? 0 : [0, 100, 50, 25][place] || 10;

export const HATS = [
  {id: 'none', name: 'No hat', price: 0},
  {id: 'cap', name: 'Cap', price: 250},
  {id: 'ears', name: 'Cat ears', price: 400},
  {id: 'party', name: 'Party hat', price: 500},
  {id: 'tophat', name: 'Top hat', price: 700},
  {id: 'halo', name: 'Halo', price: 900},
  {id: 'crown', name: 'Crown', price: 1500}
];
export const TRAILS = [
  {id: 'none', name: 'No trail', price: 0},
  {id: 'sparkle', name: 'Sparkle', price: 500},
  {id: 'bubbles', name: 'Bubbles', price: 700},
  {id: 'fire', name: 'Fire', price: 1000},
  {id: 'rainbow', name: 'Rainbow', price: 1500}
];
export const PREMIUM_COLORS = [
  {id: '#f5c542', name: 'Gold', price: 300},
  {id: '#5cf2a0', name: 'Neon mint', price: 300},
  {id: '#ff4fb8', name: 'Hot pink', price: 300},
  {id: '#bfe9ff', name: 'Ice', price: 300},
  {id: '#ff6a2b', name: 'Lava', price: 300},
  {id: '#17171f', name: 'Midnight', price: 300}
];
export const BASE_PALETTES = {body: ['#416ba4', '#27344e', '#58bb9a', '#a183d1', '#d7dfec', '#f2c489', '#dc7d54', '#773f46'], shirt: ['#ff3859', '#3485ed', '#8a65d6', '#38b99c', '#f3bc45', '#faf2e3', '#252a35', '#ed8fbc'], head: ['#f2c489', '#f9dbb5', '#cf966b', '#975e42', '#654535', '#ffda6b', '#9ddce5', '#c5a8ed']};
export const TRAIL_COLORS = {
  sparkle: [[1, 0.93, 0.55], [1, 1, 1], [1, 0.82, 0.35]],
  bubbles: [[0.62, 0.86, 1], [0.85, 0.95, 1], [0.55, 0.75, 1]],
  fire: [[1, 0.45, 0.12], [1, 0.72, 0.2], [1, 0.25, 0.1]],
  rainbow: [[1, 0.3, 0.35], [1, 0.65, 0.2], [1, 0.95, 0.3], [0.35, 0.9, 0.5], [0.35, 0.65, 1], [0.7, 0.45, 1]]
};

const HEX = /^#[0-9a-f]{6}$/i;
const ids = list => new Set(list.map(item => item.id));
const HAT_IDS = ids(HATS), TRAIL_IDS = ids(TRAILS), COLOR_IDS = ids(PREMIUM_COLORS);

export function defaultProgress() {
  return {v: 1, stars: {}, owned: {hats: [], trails: [], colors: []}, hat: 'none', trail: 'none', wins: 0, races: 0};
}
/** Reads saved progress defensively; unknown or broken fields fall back to defaults. */
export function parseProgress(text) {
  const p = defaultProgress();
  let raw;
  try { raw = typeof text === 'string' ? JSON.parse(text) : text; } catch { return p; }
  if (!raw || typeof raw !== 'object') return p;
  if (raw.stars && typeof raw.stars === 'object') for (const w of WORLDS) { const m = raw.stars[w.id]; if (Number.isInteger(m) && m > 0 && m < 8) p.stars[w.id] = m; }
  const owned = raw.owned && typeof raw.owned === 'object' ? raw.owned : {};
  const pick = (list, valid) => Array.isArray(list) ? [...new Set(list.filter(id => valid.has(id) && id !== 'none'))] : [];
  p.owned.hats = pick(owned.hats, HAT_IDS);
  p.owned.trails = pick(owned.trails, TRAIL_IDS);
  p.owned.colors = Array.isArray(owned.colors) ? [...new Set(owned.colors.filter(c => COLOR_IDS.has(c)))] : [];
  if (HAT_IDS.has(raw.hat) && (raw.hat === 'none' || p.owned.hats.includes(raw.hat))) p.hat = raw.hat;
  if (TRAIL_IDS.has(raw.trail) && (raw.trail === 'none' || p.owned.trails.includes(raw.trail))) p.trail = raw.trail;
  for (const key of ['wins', 'races']) if (Number.isInteger(raw[key]) && raw[key] >= 0) p[key] = Math.min(raw[key], 1e6);
  return p;
}

export function itemPrice(kind, id) {
  const list = kind === 'hat' ? HATS : kind === 'trail' ? TRAILS : PREMIUM_COLORS;
  const item = list.find(x => x.id === id);
  return item ? item.price : null;
}
export function ownsItem(progress, kind, id) {
  if (kind === 'hat') return id === 'none' || progress.owned.hats.includes(id);
  if (kind === 'trail') return id === 'none' || progress.owned.trails.includes(id);
  return !COLOR_IDS.has(id) || progress.owned.colors.includes(id);
}
/** Spends credits for an item. Returns { ok, credits } and mutates progress only on success. */
export function buyItem(progress, credits, kind, id) {
  const price = itemPrice(kind, id);
  if (price === null) return {ok: false, credits, error: 'unknown'};
  if (ownsItem(progress, kind, id)) return {ok: true, credits};
  if (credits < price) return {ok: false, credits, error: 'funds'};
  (kind === 'hat' ? progress.owned.hats : kind === 'trail' ? progress.owned.trails : progress.owned.colors).push(id);
  return {ok: true, credits: credits - price};
}

/* ---------- Online protocol ---------- */

export const PHRASES = ['Hi!', 'GG', 'Nice!', 'Good luck', "Let's go!", 'Wait for me', 'Follow me', 'Oops'];
export const EMOTES = ['wave', 'dance', 'jump'];
export const SEND_HZ = 10;
export const TIMING = {countdown: 3.5, autoStart: 20, nextAuto: 15, results: 13, grace: 30, cap: 300};

export function sanitizeLook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = Array.isArray(raw.c) ? raw.c : [];
  if (c.length !== 3 || !c.every(v => typeof v === 'string' && HEX.test(v))) return null;
  return {body: c[0], shirt: c[1], head: c[2], hat: HAT_IDS.has(raw.h) ? raw.h : 'none', trail: TRAIL_IDS.has(raw.r) ? raw.r : 'none'};
}
export const encodeLook = look => ({t: 'look', c: [look.body, look.shirt, look.head], h: look.hat || 'none', r: look.trail || 'none'});

const F = {grounded: 1, moving: 2, sprint: 4};
export function encodeState({scene, x, y, z, yaw, grounded, moving, sprint, progress}) {
  return {t: 's', w: scene, p: [Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)], r: Math.round(yaw * 100),
    f: (grounded ? F.grounded : 0) | (moving ? F.moving : 0) | (sprint ? F.sprint : 0), g: Math.round(Math.max(0, Math.min(1, progress || 0)) * 1000)};
}
const finite = (v, limit) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;
export function decodeState(d) {
  if (!d || d.t !== 's' || typeof d.w !== 'string' || d.w.length > 24 || !Array.isArray(d.p) || d.p.length !== 3) return null;
  if (!d.p.every(v => finite(v, 1e6)) || !finite(d.r, 1e5)) return null;
  const f = Number.isInteger(d.f) ? d.f : 0, g = finite(d.g, 1000) ? Math.max(0, d.g) / 1000 : 0;
  return {scene: d.w, x: d.p[0] / 100, y: d.p[1] / 100, z: d.p[2] / 100, yaw: d.r / 100,
    grounded: Boolean(f & F.grounded), moving: Boolean(f & F.moving), sprint: Boolean(f & F.sprint), progress: g};
}
/** Change worth sending: moved more than 2 cm, turned, or flags/progress changed. */
export function stateChanged(a, b) {
  if (!a || !b) return true;
  return a.w !== b.w || a.f !== b.f || a.g !== b.g || Math.abs(a.r - b.r) > 2 || a.p.some((v, i) => Math.abs(v - b.p[i]) > 2);
}

const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
/** Snapshot buffer rendered ~120 ms in the past so 10 Hz updates look smooth. Bounded to `size` entries. */
export class Interp {
  constructor(delay = 120, size = 8) { this.delay = delay; this.size = size; this.list = []; }
  push(state, at) {
    if (this.list.length && at <= this.list[this.list.length - 1].at) at = this.list[this.list.length - 1].at + 1;
    this.list.push({...state, at});
    if (this.list.length > this.size) this.list.shift();
  }
  clear() { this.list.length = 0; }
  get last() { return this.list[this.list.length - 1] || null; }
  sample(now, out = {}) {
    const list = this.list;
    if (!list.length) return null;
    const t = now - this.delay;
    let a = list[0], b = list[0];
    if (t <= a.at) b = a;
    else {
      for (let i = 1; i < list.length; i++) { b = list[i]; if (b.at >= t) { a = list[i - 1]; break; } a = b; }
    }
    const span = b.at - a.at, k = span > 0 ? Math.max(0, Math.min(1, (t - a.at) / span)) : 1;
    // A big jump (respawn) snaps instead of sliding through the world.
    const teleport = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 6;
    const f = teleport ? (k < 1 ? 0 : 1) : k;
    out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.z = a.z + (b.z - a.z) * f;
    out.yaw = angleLerp(a.yaw, b.yaw, f);
    const src = f < 0.5 ? a : b;
    out.grounded = src.grounded; out.moving = src.moving; out.sprint = src.sprint; out.progress = b.progress; out.scene = b.scene;
    return out;
  }
}

/** Token bucket so a client never exceeds `rate` messages per second. */
export class Budget {
  constructor(rate = 12, burst = 12) { this.rate = rate; this.burst = burst; this.tokens = burst; this.at = 0; }
  take(now, cost = 1) {
    if (this.at) this.tokens = Math.min(this.burst, this.tokens + (now - this.at) / 1000 * this.rate);
    this.at = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Valid room metadata or null. The host writes it; everyone reads it. */
export function readMeta(meta) {
  if (!meta || typeof meta !== 'object' || meta.v !== 1) return null;
  const phase = ['plaza', 'race', 'results'].includes(meta.phase) ? meta.phase : null;
  if (!phase || !worldById(meta.world) || !Number.isInteger(meta.seq) || !Number.isInteger(meta.round)) return null;
  const list = v => Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 16) : [];
  const res = Array.isArray(meta.res) ? meta.res.filter(r => Array.isArray(r) && typeof r[0] === 'string' && finite(r[1], 1e8)).slice(0, 16) : [];
  return {v: 1, phase, world: meta.world, round: meta.round, seq: meta.seq, open: meta.open !== false,
    auto: finite(meta.auto, 600) ? Math.max(0, meta.auto) : 0, cd: finite(meta.cd, 30) ? meta.cd : TIMING.countdown,
    racers: list(meta.racers), res, dnf: list(meta.dnf), opts: list(meta.opts).filter(id => worldById(id)).slice(0, 3),
    vt: finite(meta.vt, 120) ? meta.vt : TIMING.results, last: worldById(meta.last) ? meta.last : null};
}
export const plazaMeta = (prev, {world, round, auto}) => ({v: 1, phase: 'plaza', world, round, seq: (prev?.seq || 0) + 1, auto: auto || 0, open: true});
export const raceMeta = (prev, racers) => ({v: 1, phase: 'race', world: prev.world, round: prev.round + 1, seq: prev.seq + 1, racers: racers.slice(0, MAX_PLAYERS), cd: TIMING.countdown, open: true});
export function resultsMeta(prev, finishes, present, options) {
  const racers = prev.racers.filter(id => present.includes(id));
  const res = rankFinishes(finishes, prev.racers).map(([id, ms]) => [id, Math.round(ms)]);
  const dnf = racers.filter(id => !finishes.has(id));
  return {v: 1, phase: 'results', world: prev.world, round: prev.round, seq: prev.seq + 1, racers: prev.racers, res, dnf, opts: options, vt: TIMING.results, last: prev.world, open: true};
}

/** Finishers fastest first. `finishes` is a Map id → ms; only listed racers count. */
export function rankFinishes(finishes, racers) {
  return [...finishes].filter(([id, ms]) => racers.includes(id) && Number.isFinite(ms)).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
}
/** Live order: finishers by time, then everyone else by route progress. */
export function liveOrder(racers, finishes, progress) {
  return [...racers].sort((a, b) => {
    const fa = finishes.get(a), fb = finishes.get(b);
    if (fa != null || fb != null) return fa == null ? 1 : fb == null ? -1 : fa - fb;
    return (progress.get(b) || 0) - (progress.get(a) || 0);
  });
}
/** Host decides when a race ends: everyone done, grace after the first finish, or the hard cap. Times in ms. */
export function raceOver({racers, present, finishes, now, goAt, firstFinishAt, grace = TIMING.grace * 1000, cap = TIMING.cap * 1000}) {
  const active = racers.filter(id => present.includes(id));
  if (!active.length) return true;
  if (active.every(id => finishes.has(id))) return true;
  if (firstFinishAt != null && now - firstFinishAt >= grace) return true;
  return now - goAt >= cap;
}

export function voteOptions(current, random = Math.random, pool = RACE_WORLDS) {
  const rest = pool.filter(id => id !== current);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return rest.slice(0, 3);
}
/** Most votes wins; ties pick the earliest option among the tied ones by `random`. No votes: random option. */
export function tallyVotes(votes, options, random = Math.random) {
  if (!options.length) return null;
  const counts = new Map(options.map(id => [id, 0]));
  for (const id of votes.values()) if (counts.has(id)) counts.set(id, counts.get(id) + 1);
  const top = Math.max(...counts.values());
  const tied = options.filter(id => counts.get(id) === top);
  return tied[Math.floor(random() * tied.length)] || options[0];
}

/** Quick match candidates for a world (or any world): fullest first, never full or closed rooms. */
export function pickQuickRooms(rooms, world, max = MAX_PLAYERS) {
  return (Array.isArray(rooms) ? rooms : [])
    .filter(r => r && typeof r.code === 'string' && r.players < Math.min(r.max || max, max) && r.meta && r.meta.v === 1 && r.meta.open !== false && (!world || r.meta.world === world))
    .sort((a, b) => b.players - a.players)
    .map(r => r.code);
}

export const normalizeCode = value => { const c = String(value ?? '').trim().toUpperCase(); return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(c) ? c : null; };
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
export const formatTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const formatRaceTime = ms => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
