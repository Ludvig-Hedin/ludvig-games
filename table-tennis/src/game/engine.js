/**
 * RALLY / deterministic table-tennis simulation.
 * Metres, seconds and radians. A 240 Hz solver is shared by the browser and server.
 * Contacts are swept; assistance aims a physically contacted ball, never its position.
 */
export const TABLE = Object.freeze({ width: 1.525, length: 2.74, height: .76, halfWidth: .7625, halfLength: 1.37, netHeight: .1525, netWidth: 1.83, ballRadius: .02, paddleRadius: .115, paddleHeight: .135 });
export const FIXED_STEP = 1 / 240;
export const DIFFICULTIES = Object.freeze([
  { name: 'Beginner', reaction: .25, speed: 1.65, accuracy: .105, spinReading: .1, power: .30 },
  { name: 'Easy', reaction: .18, speed: 2.15, accuracy: .072, spinReading: .4, power: .39 },
  { name: 'Medium', reaction: .115, speed: 2.8, accuracy: .039, spinReading: .72, power: .49 },
  { name: 'Hard', reaction: .070, speed: 3.45, accuracy: .018, spinReading: .92, power: .62 },
  { name: 'Pro', reaction: .040, speed: 4.2, accuracy: .006, spinReading: 1, power: .76 },
]);

const G = 9.81;
const DRAG = .095;
const MAGNUS = .00165;
const R = TABLE.ballRadius;
const SURFACE = TABLE.height + R;
const NET_TOP = TABLE.height + TABLE.netHeight;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
const signOf = side => side === 0 ? 1 : -1;
const other = side => 1 - side;
const speed = b => Math.hypot(b.vx, b.vy, b.vz);
const moveToward = (a, b, delta) => a + clamp(b - a, -delta, delta);
const live = s => s.phase === 'serve' || s.phase === 'rally';

function random(s) {
  let x = s.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  s.rng = x >>> 0;
  return s.rng / 4294967296;
}

function event(s, type, extra = {}) {
  s.events.push({ id: ++s.eventId, type, time: s.time, ...extra });
  if (s.events.length > 24) s.events.splice(0, s.events.length - 24);
}

export function createGame(options = {}) {
  let difficulty = typeof options.difficulty === 'string'
    ? DIFFICULTIES.findIndex(x => x.name.toLowerCase() === options.difficulty.toLowerCase())
    : options.difficulty ?? 2;
  difficulty = Math.round(clamp(difficulty, 0, 4));
  const s = {
    version: 1, mode: options.mode || 'ai', difficulty,
    bestOf: [3, 5, 7].includes(options.bestOf) ? options.bestOf : 3,
    rng: ((options.seed ?? 246813579) >>> 0) || 246813579,
    time: 0, tick: 0, accumulator: 0, phase: 'ready', phaseTime: 0,
    score: [0, 0], games: [0, 0], server: 0, openingServer: 0,
    gameIndex: 0, winner: null, rally: 0, lastPoint: null,
    lastHit: -1, bounces: 0, serveStage: 'held', serveNet: false,
    tossStartY: .99, tossPeakY: .99, eventId: 0, events: [],
    stats: { longestRally: 0, points: 0, shots: [0, 0], lets: 0 },
    ball: { x: 0, y: .99, z: 1.53, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, visible: true },
    paddles: [0, 1].map(side => ({
      x: 0, y: 1.00, z: signOf(side) * 1.68,
      vx: 0, vy: 0, vz: 0, swing: 0, hitTime: -10,
      targetX: 0, targetDepth: 1.68, targetY: 1.00,
    })),
    ai: [0, 1].map(() => ({ nextThink: 0, x: 0, aim: 0, power: .5, spin: 'flat', error: 0, shotId: -1, depth: 1.64 })),
  };
  resetReady(s);
  return s;
}

export function serverForScore(score, openingServer = 0) {
  const total = score[0] + score[1];
  return openingServer ^ ((total < 20 ? Math.floor(total / 2) : total - 20) & 1);
}

function resetReady(s) {
  s.phase = 'ready'; s.phaseTime = 0;
  s.server = serverForScore(s.score, s.openingServer);
  s.rally = 0; s.lastHit = -1; s.bounces = 0;
  s.serveStage = 'held'; s.serveNet = false;
  const p = s.paddles[s.server];
  Object.assign(s.ball, { x: p.x, y: .99, z: signOf(s.server) * Math.max(1.5, Math.abs(p.z) - .15), vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, visible: true });
  event(s, 'ready', { side: s.server });
}

/** Release a visible, near-vertical toss of more than 16 cm. */
export function serveGame(s, side = s.server) {
  if (s.phase !== 'ready' || side !== s.server) return false;
  const p = s.paddles[side];
  Object.assign(s.ball, { x: p.x, y: .99, z: signOf(side) * Math.max(1.5, Math.abs(p.z) - .15), vx: 0, vy: 2.7, vz: 0, wx: 0, wy: 0, wz: 0, visible: true });
  s.phase = 'serve'; s.phaseTime = 0; s.serveStage = 'toss';
  s.tossStartY = s.ball.y; s.tossPeakY = s.ball.y;
  event(s, 'toss', { side, x: s.ball.x, y: s.ball.y, z: s.ball.z });
  return true;
}

function awardPoint(s, winner, reason) {
  if (!live(s)) return;
  s.score[winner] += 1;
  s.stats.points++;
  s.stats.longestRally = Math.max(s.stats.longestRally, s.rally);
  s.lastPoint = { winner, reason, rally: s.rally, score: [...s.score] };
  s.phase = 'point'; s.phaseTime = 0;
  event(s, 'point', { side: winner, winner, reason, rally: s.rally });
  if (s.score[winner] >= 11 && s.score[winner] - s.score[other(winner)] >= 2) {
    s.games[winner]++;
    if (s.games[winner] >= Math.ceil(s.bestOf / 2)) {
      s.phase = 'matchover'; s.winner = winner;
      event(s, 'match', { side: winner, winner });
    } else {
      s.phase = 'gameover';
      event(s, 'game', { side: winner, winner });
    }
  }
}

function letServe(s) {
  s.stats.lets++;
  s.lastPoint = { winner: null, reason: 'Let — serve again', rally: 0, score: [...s.score] };
  s.phase = 'point'; s.phaseTime = 0;
  event(s, 'let', { side: s.server });
}

function forces(b, dt) {
  const v = speed(b);
  const ax = -DRAG * v * b.vx + MAGNUS * (b.wy * b.vz - b.wz * b.vy);
  const ay = -G - DRAG * v * b.vy + MAGNUS * (b.wz * b.vx - b.wx * b.vz);
  const az = -DRAG * v * b.vz + MAGNUS * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  const spinDecay = Math.exp(-.14 * dt);
  b.wx *= spinDecay; b.wy *= spinDecay; b.wz *= spinDecay;
}

function tableRebound(b) {
  const impact = Math.abs(b.vy);
  // Coulomb friction acts on slip at the bottom of the spinning sphere.
  let jx = -(b.vx + b.wz * R) * .105;
  let jz = -(b.vz - b.wx * R) * .105;
  const magnitude = Math.hypot(jx, jz);
  const limit = .16 * (1 + .89) * impact;
  if (magnitude > limit) { jx *= limit / magnitude; jz *= limit / magnitude; }
  b.vx += jx; b.vz += jz;
  b.wx -= 2.5 * jz / R; b.wz += 2.5 * jx / R;
  b.vy = Math.max(.10, impact * .89);
  b.wy *= .95;
}

function onTable(s, x, z, impact) {
  const side = z >= 0 ? 0 : 1;
  event(s, 'bounce', { side, x, y: TABLE.height, z, speed: impact });
  if (!live(s)) return;
  if (s.serveStage === 'toss') { awardPoint(s, other(s.server), 'Missed serve'); return; }
  if (s.lastHit < 0) return;
  if (s.serveStage === 'own') {
    if (side !== s.server) { awardPoint(s, other(s.server), 'Serve missed own half'); return; }
    s.serveStage = 'opponent'; s.bounces = 1;
    return;
  }
  if (s.serveStage === 'opponent') {
    if (side === s.server) { awardPoint(s, other(s.server), 'Serve did not cross the net'); return; }
    if (s.serveNet) { letServe(s); return; }
    s.serveStage = 'complete'; s.phase = 'rally'; s.bounces = 1;
    return;
  }
  if (s.bounces > 0) { awardPoint(s, s.lastHit, 'Double bounce'); return; }
  if (side === s.lastHit) { awardPoint(s, other(s.lastHit), 'Wrong side of the table'); return; }
  s.bounces = 1;
}

function spinForShot(side, type, power) {
  const dir = -signOf(side);
  if (type === 'top') return { wx: dir * (110 + power * 140), wy: 0, wz: 0 };
  if (type === 'back') return { wx: -dir * (80 + power * 100), wy: 0, wz: 0 };
  if (type === 'left') return { wx: dir * 30, wy: -dir * 155, wz: 0 };
  if (type === 'right') return { wx: dir * 30, wy: dir * 155, wz: 0 };
  return { wx: dir * 20, wy: 0, wz: 0 };
}

function simulateFlight(origin, velocity, rotation, duration, observeNet = false) {
  const b = { ...origin, ...velocity, ...rotation };
  const n = Math.ceil(duration / (1 / 180)), dt = duration / n;
  let netY = Infinity;
  for (let i = 0; i < n; i++) {
    const oz = b.z, oy = b.y;
    forces(b, dt);
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (observeNet && oz * b.z <= 0) netY = oy + (b.y - oy) * Math.abs(oz / (b.z - oz));
  }
  return { ...b, netY };
}

// A small shooting solver converts intended placement into velocity. Every resulting
// arc still obeys the same drag, gravity, spin, net and table contacts as all other shots.
function aimedVelocity(origin, target, rotation, duration) {
  let v = { vx: (target.x - origin.x) / duration, vy: (target.y - origin.y) / duration + G * duration / 2, vz: (target.z - origin.z) / duration };
  for (let i = 0; i < 5; i++) {
    const end = simulateFlight(origin, v, rotation, duration);
    v.vx += (target.x - end.x) / duration * 1.16;
    v.vy += (target.y - end.y) / duration * 1.10;
    v.vz += (target.z - end.z) / duration * 1.16;
  }
  return v;
}

function rallyVelocity(s, side, input, active) {
  const b = s.ball, p = s.paddles[side];
  const power = active ? clamp(input.power ?? .50, .05, 1) : .22;
  const rotation = spinForShot(side, active ? input.spin : 'flat', power);
  const aim = clamp(input.aim ?? 0, -1, 1);
  const target = { x: clamp(aim * .60 + p.vx * .025, -.66, .66), y: SURFACE, z: -signOf(side) * (.65 + power * .28) };
  let duration = clamp(Math.abs(target.z - b.z) / (4.0 + power * 2.25), .40, .74);
  let velocity;
  for (let attempt = 0; attempt < 4; attempt++) {
    velocity = aimedVelocity(b, target, rotation, duration);
    const flight = simulateFlight(b, velocity, rotation, duration, true);
    if (flight.netY >= NET_TOP + R + .045) break;
    duration += .055;
  }
  return { ...velocity, ...rotation };
}

function serveVelocity(s, side, input) {
  const b = s.ball, dir = -signOf(side);
  const rotation = spinForShot(side, input.spin || 'flat', clamp(input.power ?? .45, .1, .8));
  // Aim the first bounce; the physical rebound carries the serve across the net.
  const target = { x: clamp(b.x * .7 + (input.aim || 0) * .10, -.52, .52), y: SURFACE, z: signOf(side) * .58 };
  const duration = .235 + (b.y - 1.18) * .10;
  const v = aimedVelocity(b, target, rotation, clamp(duration, .21, .27));
  // Heavy backspin serves are softened to keep service learning forgiving.
  return { ...v, ...rotation, wx: rotation.wx * .55, wy: rotation.wy * .55, wz: rotation.wz * .55 };
}

function onPaddle(s, side, input) {
  const b = s.ball, p = s.paddles[side];
  const incoming = speed(b);
  if (s.serveStage === 'toss') {
    if (side !== s.server || b.vy >= 0 || s.tossPeakY - s.tossStartY < .16) return false;
    s.lastHit = side; s.bounces = 0; s.serveStage = 'own';
    Object.assign(b, serveVelocity(s, side, input));
  } else {
    if (side === s.lastHit) { awardPoint(s, other(side), 'Double hit'); return false; }
    if (s.serveStage === 'own') { awardPoint(s, other(s.server), 'Illegal serve'); return false; }
    if (s.serveStage === 'opponent' && s.serveNet) { letServe(s); return false; }
    if (s.bounces === 0 || s.serveStage === 'opponent') { awardPoint(s, s.lastHit, 'Volley — let it bounce'); return false; }
    Object.assign(b, rallyVelocity(s, side, input, input.swing));
    s.lastHit = side; s.bounces = 0; s.serveStage = 'complete'; s.phase = 'rally';
  }
  p.hitTime = s.time; p.swing = 1;
  s.phaseTime = 0;
  s.rally++; s.stats.shots[side]++;
  s.stats.longestRally = Math.max(s.stats.longestRally, s.rally);
  event(s, 'paddle', { side, x: b.x, y: b.y, z: b.z, speed: speed(b), incoming, spin: input.spin || 'flat' });
  return true;
}

/** Predict a table bounce or a ball crossing of a player's contact plane. */
export function predictLanding(stateOrBall, side = null, depth = 1.64, spinReading = 1) {
  const source = stateOrBall.ball || stateOrBall;
  const b = { ...source, wx: source.wx * spinReading, wy: source.wy * spinReading, wz: source.wz * spinReading };
  const dt = 1 / 120, targetZ = side == null ? null : signOf(side) * depth;
  for (let time = dt; time < 1.7; time += dt) {
    const old = { x: b.x, y: b.y, z: b.z };
    forces(b, dt); b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (old.y >= SURFACE && b.y < SURFACE && b.vy < 0) {
      const f = (old.y - SURFACE) / (old.y - b.y);
      const x = old.x + (b.x - old.x) * f, z = old.z + (b.z - old.z) * f;
      if (Math.abs(x) <= TABLE.halfWidth && Math.abs(z) <= TABLE.halfLength) {
        if (side == null) return { x, y: SURFACE, z, time: time - dt + f * dt, valid: true };
        b.y = SURFACE + .0001; tableRebound(b);
      }
    }
    if (targetZ != null && (old.z - targetZ) * (b.z - targetZ) <= 0 && b.vz * signOf(side) > 0) {
      const f = (targetZ - old.z) / (b.z - old.z);
      return { x: old.x + (b.x - old.x) * f, y: old.y + (b.y - old.y) * f, z: targetZ, time: time - dt + f * dt, valid: b.y > .30 };
    }
    if (b.y < 0 || Math.abs(b.x) > 3 || Math.abs(b.z) > 4) break;
  }
  return { x: b.x, y: b.y, z: b.z, time: 1.7, valid: false };
}

/** AI observes visible ball/paddles only; no position or score is changed here. */
export function aiInput(s, side, difficulty = s.difficulty) {
  const level = DIFFICULTIES[Math.round(clamp(difficulty, 0, 4))];
  const a = s.ai[side], p = s.paddles[side], b = s.ball;
  const incoming = live(s) && s.serveStage !== 'toss' && b.vz * signOf(side) > .05 && s.lastHit !== side;
  if (s.time >= a.nextThink) {
    a.nextThink = s.time + level.reaction;
    if (incoming) {
      if (a.shotId !== s.rally) {
        a.shotId = s.rally;
        a.error = (random(s) + random(s) - 1) * level.accuracy * 2;
        const opponentX = s.paddles[other(side)].x;
        a.aim = difficulty >= 3 ? clamp(-opponentX * 1.2 + (random(s) - .5) * 1.3, -.95, .95) : (random(s) - .5) * (difficulty < 2 ? .65 : 1.3);
        a.power = clamp(level.power + (random(s) - .5) * .18, .15, .90);
        const r = random(s);
        a.spin = difficulty < 2 ? 'flat' : r < .5 ? 'top' : r < .70 ? 'back' : r < .85 ? 'left' : 'right';
      }
      const predicted = predictLanding(s, side, a.depth - .045, level.spinReading);
      if (predicted.valid) a.x = clamp(predicted.x + a.error, -1.13, 1.13);
    } else if (s.phase === 'ready' && s.server === side) {
      a.x = side === 0 ? -.24 : .24; a.aim = 0; a.spin = 'flat'; a.power = .45;
    } else if (s.serveStage !== 'toss') a.x = moveToward(a.x, 0, .12);
  }
  return { x: a.x, depth: a.depth, aim: a.aim, power: a.power, spin: a.spin, swing: incoming, serve: s.phase === 'ready' && s.server === side && s.phaseTime > .85, maxSpeed: level.speed };
}

function sanitizeInput(raw, paddle) {
  return {
    x: clamp(raw?.x ?? paddle.targetX, -1.13, 1.13),
    depth: clamp(raw?.depth ?? 1.68, 1.43, 1.95),
    aim: clamp(raw?.aim ?? 0, -1, 1),
    power: clamp(raw?.power ?? .5, .05, 1),
    spin: ['flat', 'top', 'back', 'left', 'right'].includes(raw?.spin) ? raw.spin : 'flat',
    swing: Boolean(raw?.swing), serve: Boolean(raw?.serve),
    maxSpeed: clamp(raw?.maxSpeed ?? 4.2, .5, 4.2),
  };
}

function updatePaddle(s, side, input, dt) {
  const p = s.paddles[side], b = s.ball, sg = signOf(side);
  const previous = { x: p.x, y: p.y, z: p.z };
  p.targetX = input.x; p.targetDepth = input.depth;
  let targetZ = sg * (input.depth - (input.swing ? .045 : 0));
  let targetY = 1.01;
  if (live(s) && b.z * sg > .65 && (b.vz * sg > 0 || s.serveStage === 'toss')) {
    const ahead = s.serveStage === 'toss' ? 0 : clamp(Math.abs((p.z - b.z) / (b.vz || .01)), 0, .075);
    targetY = clamp(b.y + b.vy * ahead - .5 * G * ahead * ahead, .50, 1.82);
  }
  if (s.serveStage === 'toss' && side === s.server) {
    const striking = b.vy < -.40 && b.y < 1.28;
    targetZ = b.z + sg * (striking ? -.020 : .14);
    targetY = clamp(b.y, .60, 1.82);
  }
  p.targetY = targetY;
  p.x = moveToward(p.x, input.x, input.maxSpeed * dt);
  p.y = moveToward(p.y, targetY, 5.7 * dt);
  p.z = moveToward(p.z, targetZ, 3.2 * dt);
  p.vx = (p.x - previous.x) / dt; p.vy = (p.y - previous.y) / dt; p.vz = (p.z - previous.z) / dt;
  p.swing = Math.max(0, p.swing - dt * 6);
  return previous;
}

function ballStep(s, inputs, previousPaddles, dt) {
  const b = s.ball;
  if (!b.visible) return;
  const old = { x: b.x, y: b.y, z: b.z };
  forces(b, dt);
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (s.serveStage === 'toss') s.tossPeakY = Math.max(s.tossPeakY, b.y);

  // A swept plane test prevents a fast ball tunnelling through the tabletop.
  if (old.y >= SURFACE && b.y <= SURFACE && b.vy < 0) {
    const f = clamp((old.y - SURFACE) / (old.y - b.y), 0, 1);
    const cx = old.x + (b.x - old.x) * f, cz = old.z + (b.z - old.z) * f;
    if (Math.abs(cx) <= TABLE.halfWidth + .003 && Math.abs(cz) <= TABLE.halfLength + .003) {
      const impact = Math.abs(b.vy);
      b.x = cx; b.z = cz; b.y = SURFACE;
      tableRebound(b);
      onTable(s, cx, cz, impact);
      const left = dt * (1 - f);
      b.x += b.vx * left; b.y += b.vy * left; b.z += b.vz * left;
    }
  }

  // The cloth is thin and dissipative. A top-cord graze may continue over it.
  const netPlane = (old.z >= 0 ? 1 : -1) * (R + .004);
  if ((old.z - netPlane) * (b.z - netPlane) <= 0 && Math.abs(b.z - old.z) > .00001 && Math.abs(old.z) >= R + .003) {
    const f = clamp((netPlane - old.z) / (b.z - old.z), 0, 1);
    const cy = old.y + (b.y - old.y) * f, cx = old.x + (b.x - old.x) * f;
    if (Math.abs(cx) < TABLE.netWidth / 2 && cy < NET_TOP + R && cy > TABLE.height - R) {
      const impact = Math.abs(b.vz);
      if (s.serveStage === 'own' || s.serveStage === 'opponent') s.serveNet = true;
      event(s, 'net', { x: cx, y: cy, z: 0, speed: impact });
      if (cy > NET_TOP - R * .25) {
        b.y = NET_TOP + R + .001; b.vy = Math.max(.36, Math.abs(b.vy) * .30); b.vz *= .73;
        b.z = -Math.sign(old.z) * (R + .005);
      } else {
        b.z = netPlane + Math.sign(old.z) * .001;
        b.vz *= -.16; b.vx *= .7; b.vy *= .70;
      }
    }
  }

  if (live(s)) {
    // A shot which passes the receiving end line without its required bounce is out.
    if (s.lastHit >= 0 && (s.serveStage === 'complete' && s.bounces === 0 || s.serveStage === 'opponent')) {
      const receiver = other(s.lastHit), sg = signOf(receiver);
      if (b.z * sg > TABLE.halfLength + R && b.vz * sg > 0) awardPoint(s, receiver, 'Long — missed the table');
    }
    for (let side = 0; side < 2 && live(s); side++) {
      const p = s.paddles[side], previous = previousPaddles[side], sg = signOf(side);
      if (s.time - p.hitTime < .11) continue;
      if (s.serveStage === 'toss' && (side !== s.server || b.vy >= 0)) continue;
      const before = sg * (old.z - previous.z);
      const after = sg * (b.z - p.z);
      const contact = -(R + .009);
      if (before < contact && after >= contact) {
        const f = clamp((contact - before) / (after - before), 0, 1);
        const cx = old.x + (b.x - old.x) * f, cy = old.y + (b.y - old.y) * f;
        const px = previous.x + (p.x - previous.x) * f, py = previous.y + (p.y - previous.y) * f;
        const dx = (cx - px) / (TABLE.paddleRadius + R), dy = (cy - py) / (TABLE.paddleHeight + R);
        if (dx * dx + dy * dy <= 1) {
          b.x = cx; b.y = cy; b.z = old.z + (b.z - old.z) * f;
          if (onPaddle(s, side, inputs[side])) {
            const left = dt * (1 - f);
            b.x += b.vx * left; b.y += b.vy * left; b.z += b.vz * left;
          }
        }
      }
    }
  }

  if (live(s) && s.lastHit >= 0 && s.serveStage !== 'toss') {
    if (b.y < TABLE.height - .08 && (Math.abs(b.x) > TABLE.halfWidth + R || Math.abs(b.z) > TABLE.halfLength + R)) {
      const winner = s.serveStage === 'own' || s.serveStage === 'opponent' ? other(s.server) : s.bounces ? s.lastHit : other(s.lastHit);
      awardPoint(s, winner, s.bounces && s.serveStage === 'complete' ? 'No return' : 'Out');
    }
    if (Math.abs(b.x) > 2.5 || Math.abs(b.z) > 3.1 || s.phaseTime > 18) {
      awardPoint(s, s.bounces && s.serveStage === 'complete' ? s.lastHit : other(s.lastHit), 'Out');
    }
  }
  if (b.y < R) {
    const impact = Math.abs(b.vy);
    b.y = R; b.vy = impact > .6 ? impact * .45 : 0; b.vx *= .77; b.vz *= .77;
    if (impact > .5) event(s, 'floor', { x: b.x, y: 0, z: b.z, speed: impact });
    if (live(s)) awardPoint(s, s.lastHit < 0 ? other(s.server) : s.bounces && s.serveStage === 'complete' ? s.lastHit : other(s.lastHit), s.lastHit < 0 ? 'Missed serve' : 'Out');
  }
}

function fixedStep(s, suppliedInputs, dt) {
  s.time += dt; s.tick++; s.phaseTime += dt;
  const inputs = [0, 1].map(side => {
    const automatic = s.mode === 'demo' || s.mode === 'ai' && side === 1 || suppliedInputs?.[side]?.auto;
    const raw = automatic ? aiInput(s, side, s.mode === 'demo' ? 3 : s.difficulty) : suppliedInputs?.[side];
    return sanitizeInput(raw, s.paddles[side]);
  });
  const previous = inputs.map((input, side) => updatePaddle(s, side, input, dt));
  if (s.phase === 'ready') {
    const p = s.paddles[s.server];
    s.ball.x = p.x; s.ball.y = .99; s.ball.z = signOf(s.server) * Math.max(1.5, Math.abs(p.z) - .15);
    if (inputs[s.server].serve) serveGame(s, s.server);
  } else if (s.phase !== 'matchover' || s.phaseTime < 1.8) ballStep(s, inputs, previous, dt);
  if (s.phase === 'point' && s.phaseTime > 1.45) resetReady(s);
  if (s.phase === 'gameover' && s.phaseTime > 2.35) {
    s.score = [0, 0]; s.gameIndex++; s.openingServer = s.gameIndex % 2; resetReady(s);
  }
  if (s.phase === 'serve' && s.serveStage === 'toss' && s.phaseTime > 1.5) awardPoint(s, other(s.server), 'Missed serve');
}

/** Advances a serializable state. Inputs never set a ball, score, or paddle position. */
export function stepGame(s, inputs = [{}, {}], dt = FIXED_STEP) {
  if (!s || !Number.isFinite(dt) || dt <= 0) return s;
  s.accumulator = (s.accumulator || 0) + Math.min(dt, .5);
  while (s.accumulator + 1e-9 >= FIXED_STEP) {
    fixedStep(s, inputs, FIXED_STEP);
    s.accumulator -= FIXED_STEP;
  }
  if (s.accumulator < 0) s.accumulator = 0;
  return s;
}

export default { createGame, stepGame, serveGame, predictLanding, aiInput, serverForScore, TABLE, DIFFICULTIES, FIXED_STEP };
