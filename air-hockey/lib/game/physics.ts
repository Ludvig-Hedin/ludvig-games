import { TABLE, type Body, type Difficulty, type GameEvent, type GameState, type Side, type Targets, type Vec2 } from './types';

// The renderer and the authority use this exact, dependency-free simulation.
// Coordinates are table units: side 0 owns +y, side 1 owns -y.
const EPS = 1e-8;
const CONTACT_GAP = 0.000015;
const RESTITUTION = 0.94;
const MALLET_RESTITUTION = 0.92;
const PUCK_DRAG = 0.022;
const FACE_OFF_SECONDS = 1.45;
const GOAL_SECONDS = 1.05;
const HOME_Y = 4.85;
const { halfWidth: W, halfLength: L, goalHalfWidth: G, puckRadius: R, malletRadius: M } = TABLE;

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const signOf = (side: Side) => side === 0 ? 1 : -1;

function random(state: GameState): number {
  let seed = state.seed | 0;
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  state.seed = seed >>> 0;
  return state.seed / 4294967296;
}

export function clampTarget(side: Side, target: Vec2): Vec2 {
  return {
    x: clamp(finite(target.x), -W + M, W - M),
    y: side === 0
      ? clamp(finite(target.y, HOME_Y), M, L - M)
      : clamp(finite(target.y, -HOME_Y), -L + M, -M),
  };
}

export function createGame(targetScore = 7, seed = 0x85ebca6b): GameState {
  const game: GameState = {
    puck: { x: 0, y: 0, vx: 0, vy: 0 },
    mallets: [
      { x: 0, y: HOME_Y, vx: 0, vy: 0 },
      { x: 0, y: -HOME_Y, vx: 0, vy: 0 },
    ],
    scores: [0, 0],
    targetScore: [3, 5, 7, 11].includes(targetScore) ? targetScore : 7,
    phase: 'faceoff', timer: FACE_OFF_SECONDS, elapsed: 0, tick: 0,
    rally: 0, lastScorer: null, serveSide: 0,
    seed: (finite(seed, 0x85ebca6b) >>> 0) || 0x85ebca6b,
  };
  game.serveSide = random(game) < 0.5 ? 0 : 1;
  return game;
}

export function cloneGame(state: GameState): GameState {
  return { ...state, puck: { ...state.puck }, mallets: [{ ...state.mallets[0] }, { ...state.mallets[1] }], scores: [...state.scores] };
}

function capVelocity(body: Body, limit: number): void {
  body.vx = finite(body.vx);
  body.vy = finite(body.vy);
  const speed = Math.hypot(body.vx, body.vy);
  if (speed > limit) {
    body.vx *= limit / speed;
    body.vy *= limit / speed;
  }
}

function addEvent(events: GameEvent[], event: GameEvent): void {
  // A puck squeezed between a moving mallet and a rail can resolve several
  // contacts in one tick. Emit one audible contact per surface and tick.
  if (event.type === 'wall' || event.type === 'mallet') {
    if (event.speed < 0.65) return;
    const previous = events.find(e => e.type === event.type && e.side === event.side);
    if (previous) {
      if (event.speed > previous.speed) Object.assign(previous, event);
      return;
    }
  }
  events.push(event);
}

function scoreGoal(state: GameState, concedingSide: Side, events: GameEvent[]): void {
  if (state.phase !== 'playing') return;
  const scorer: Side = concedingSide === 0 ? 1 : 0;
  const speed = Math.hypot(state.puck.vx, state.puck.vy);
  state.scores[scorer]++;
  state.lastScorer = scorer;
  state.serveSide = concedingSide;
  state.puck.vx = state.puck.vy = 0;
  state.puck.y = signOf(concedingSide) * (L + R);
  addEvent(events, { type: 'goal', x: state.puck.x, y: state.puck.y, speed, side: scorer });
  if (state.scores[scorer] >= state.targetScore) {
    state.phase = 'finished';
    state.timer = 0;
    addEvent(events, { type: 'win', x: 0, y: 0, speed: 0, side: scorer });
  } else {
    state.phase = 'goal';
    state.timer = GOAL_SECONDS;
  }
}

function resetFaceoff(state: GameState): void {
  Object.assign(state.puck, { x: 0, y: 0, vx: 0, vy: 0 });
  for (const side of [0, 1] as const) {
    Object.assign(state.mallets[side], { x: 0, y: signOf(side) * HOME_Y, vx: 0, vy: 0 });
  }
  state.phase = 'faceoff';
  state.timer = FACE_OFF_SECONDS;
  state.rally = 0;
}

type Contact = { time: number; kind: 'wall' | 'mallet' | 'goal'; nx: number; ny: number; side?: Side };

function circleContact(puck: Body, cx: number, cy: number, cvx: number, cvy: number, radius: number, duration: number): Contact | null {
  const dx = puck.x - cx, dy = puck.y - cy;
  const vx = puck.vx - cvx, vy = puck.vy - cvy;
  const c = dx * dx + dy * dy - radius * radius;
  const approach = dx * vx + dy * vy;
  if (approach >= -EPS) return null;
  const a = vx * vx + vy * vy;
  if (a < EPS) return null;
  const discriminant = approach * approach - a * c;
  if (discriminant < 0) return null;
  const time = c <= CONTACT_GAP ? 0 : (-approach - Math.sqrt(discriminant)) / a;
  if (time < -EPS || time > duration + EPS) return null;
  const nx = dx + vx * Math.max(0, time), ny = dy + vy * Math.max(0, time);
  const length = Math.hypot(nx, ny);
  if (length < EPS) return null;
  return { time: Math.max(0, time), kind: 'wall', nx: nx / length, ny: ny / length };
}

function earliestContact(state: GameState, duration: number): Contact | null {
  const p = state.puck;
  let best: Contact | null = null;
  function take(contact: Contact | null): void {
    if (contact && contact.time >= -EPS && contact.time <= duration + EPS && (!best || contact.time < best.time)) best = contact;
  }
  if (p.vx > EPS) take({ time: (W - R - p.x) / p.vx, kind: 'wall', nx: -1, ny: 0 });
  if (p.vx < -EPS) take({ time: (-W + R - p.x) / p.vx, kind: 'wall', nx: 1, ny: 0 });

  for (const end of [-1, 1]) {
    if (p.vy * end > EPS) {
      const time = (end * (L - R) - p.y) / p.vy;
      const impactX = p.x + p.vx * time;
      if (Math.abs(impactX) >= G) take({ time, kind: 'wall', nx: 0, ny: -end });
      const goalTime = (end * (L + R) - p.y) / p.vy;
      if (Math.abs(p.x + p.vx * goalTime) <= G - R + CONTACT_GAP) {
        take({ time: goalTime, kind: 'goal', nx: 0, ny: -end, side: end === 1 ? 0 : 1 });
      }
    }
    // The ends of the split end rails are rounded, including glancing shots.
    for (const x of [-G, G]) take(circleContact(p, x, end * L, 0, 0, R, duration));

    // A short channel behind each mouth prevents edge shots escaping sideways.
    for (const flank of [-1, 1]) {
      if (p.vx * flank <= EPS) continue;
      const time = (flank * (G - R) - p.x) / p.vx;
      if ((p.y + p.vy * time) * end >= L) take({ time, kind: 'wall', nx: -flank, ny: 0 });
    }
  }

  for (const side of [0, 1] as const) {
    const m = state.mallets[side];
    const contact = circleContact(p, m.x, m.y, m.vx, m.vy, R + M, duration);
    if (contact) take({ ...contact, kind: 'mallet', side });
  }
  return best;
}

function advanceBodies(state: GameState, dt: number): void {
  state.puck.x += state.puck.vx * dt;
  state.puck.y += state.puck.vy * dt;
  for (const m of state.mallets) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }
}

function clampPuckBounds(p: Body): void {
  p.x = clamp(finite(p.x), -W + R, W - R);
  p.y = finite(p.y);
  for (const end of [-1, 1]) {
    if (p.y * end > L - R && Math.abs(p.x) >= G) {
      p.y = end * (L - R);
      if (p.vy * end > 0) p.vy *= -RESTITUTION;
    }
    for (const x of [-G, G]) {
      const dx = p.x - x, dy = p.y - end * L;
      const length = Math.hypot(dx, dy);
      if (length < R + CONTACT_GAP && length > EPS) {
        p.x = x + dx / length * (R + CONTACT_GAP);
        p.y = end * L + dy / length * (R + CONTACT_GAP);
      }
    }
    if (p.y * end >= L) p.x = clamp(p.x, -G + R, G - R);
  }
}

function repairContacts(state: GameState): void {
  const p = state.puck;
  clampPuckBounds(p);
  for (let iteration = 0; iteration < 3; iteration++) {
    let overlap = false;
    for (const side of [0, 1] as const) {
      const m = state.mallets[side];
      const legal = clampTarget(side, m);
      m.x = legal.x; m.y = legal.y;
      let dx = p.x - m.x, dy = p.y - m.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= R + M - EPS) continue;
      overlap = true;
      if (distance < EPS) {
        dx = 0; dy = -signOf(side); distance = 1;
      }
      const nx = dx / distance, ny = dy / distance;
      const other = state.mallets[side === 0 ? 1 : 0];
      const proposedX = m.x + nx * (R + M + CONTACT_GAP);
      const proposedY = m.y + ny * (R + M + CONTACT_GAP);
      if (Math.hypot(proposedX - other.x, proposedY - other.y) < R + M) {
        const corrected = clampTarget(side, { x: p.x - nx * (R + M + CONTACT_GAP), y: p.y - ny * (R + M + CONTACT_GAP) });
        m.x = corrected.x; m.y = corrected.y;
        const push = m.vx * nx + m.vy * ny;
        if (push > 0) { m.vx -= nx * push; m.vy -= ny * push; }
        continue;
      }
      p.x = proposedX;
      p.y = proposedY;
      clampPuckBounds(p);

      // If the puck is against a rail, the mallet must yield instead of
      // forcing it out of the table or adding energy on every solver pass.
      const remaining = R + M - Math.hypot(p.x - m.x, p.y - m.y);
      if (remaining > EPS) {
        const corrected = clampTarget(side, { x: m.x - nx * (remaining + CONTACT_GAP), y: m.y - ny * (remaining + CONTACT_GAP) });
        m.x = corrected.x; m.y = corrected.y;
        const intoPuck = m.vx * nx + m.vy * ny;
        if (intoPuck > 0) { m.vx -= intoPuck * nx; m.vy -= intoPuck * ny; }
      }
    }
    if (!overlap) break;
  }
}

function simulateTick(state: GameState, targets: Targets, dt: number, events: GameEvent[]): void {
  state.tick++;
  if (state.phase === 'finished') return;
  state.elapsed += dt;
  for (const side of [0, 1] as const) {
    const m = state.mallets[side];
    const legal = clampTarget(side, m);
    m.x = legal.x; m.y = legal.y;
    const target = clampTarget(side, targets[side]);
    if (state.phase !== 'playing' && Math.abs(target.y) < 1.35) target.y = signOf(side) * 1.35;
    m.vx = (target.x - m.x) / dt;
    m.vy = (target.y - m.y) / dt;
    capVelocity(m, TABLE.maxMalletSpeed);
  }

  if (state.phase !== 'playing') {
    for (const m of state.mallets) { m.x += m.vx * dt; m.y += m.vy * dt; }
    state.timer = Math.max(0, state.timer - dt);
    if (state.timer <= EPS) {
      if (state.phase === 'goal') resetFaceoff(state);
      else {
        state.phase = 'playing';
        const angle = (random(state) - 0.5) * 0.7;
        state.puck.vx = Math.sin(angle) * 3.3;
        state.puck.vy = signOf(state.serveSide) * Math.cos(angle) * 3.3;
        addEvent(events, { type: 'serve', x: 0, y: 0, speed: 3.3, side: state.serveSide });
      }
    }
    return;
  }

  const p = state.puck;
  capVelocity(p, TABLE.maxPuckSpeed);
  if (Math.abs(p.y) >= L + R - EPS && Math.abs(p.x) <= G - R + CONTACT_GAP) {
    scoreGoal(state, p.y > 0 ? 0 : 1, events); return;
  }
  repairContacts(state);
  let remaining = dt;
  let collisionCount = 0;
  while (remaining > EPS && collisionCount < 12 && state.phase === 'playing') {
    const collision = earliestContact(state, remaining);
    if (!collision) { advanceBodies(state, remaining); remaining = 0; break; }
    const time = clamp(collision.time, 0, remaining);
    advanceBodies(state, time);
    remaining -= time;
    collisionCount++;
    if (collision.kind === 'goal') { scoreGoal(state, collision.side!, events); break; }

    const { nx, ny } = collision;
    const mallet = collision.kind === 'mallet' ? state.mallets[collision.side!] : null;
    if (mallet) {
      const other = state.mallets[collision.side === 0 ? 1 : 0];
      const otherDx = other.x - p.x, otherDy = other.y - p.y;
      const trappedAtMallet = Math.hypot(otherDx, otherDy) < R + M + 0.002 && otherDx * nx + otherDy * ny > 0;
      const trappedAtRail = (p.x >= W - R - 0.002 && nx > 0.1)
        || (p.x <= -W + R + 0.002 && nx < -0.1)
        || (Math.abs(p.x) >= G && ((p.y >= L - R - 0.002 && ny > 0.1) || (p.y <= -L + R + 0.002 && ny < -0.1)));
      const push = mallet.vx * nx + mallet.vy * ny;
      if ((trappedAtRail || trappedAtMallet) && push > 0) {
        mallet.vx -= nx * push;
        mallet.vy -= ny * push;
      }
    }
    const approach = (p.vx - (mallet?.vx ?? 0)) * nx + (p.vy - (mallet?.vy ?? 0)) * ny;
    if (approach < 0) {
      const restitution = mallet ? MALLET_RESTITUTION : RESTITUTION;
      const impulse = -(1 + restitution) * approach;
      p.vx += impulse * nx;
      p.vy += impulse * ny;
      capVelocity(p, TABLE.maxPuckSpeed);
      if (mallet) state.rally++;
      addEvent(events, { type: mallet ? 'mallet' : 'wall', x: p.x - nx * R, y: p.y - ny * R, speed: -approach, ...(mallet ? { side: collision.side } : {}) });
    }
    p.x += nx * CONTACT_GAP;
    p.y += ny * CONTACT_GAP;
    // Position correction also resolves near-simultaneous rail/mallet hits.
    repairContacts(state);
  }
  if (state.phase !== 'playing') return;
  // At a tightly pinched contact the unconsumed time is intentionally held;
  // a kinematic mallet cannot drive the puck through an immovable cushion.
  repairContacts(state);
  const damping = Math.exp(-PUCK_DRAG * dt);
  p.vx *= damping; p.vy *= damping;
  capVelocity(p, TABLE.maxPuckSpeed);
  if (Math.abs(p.y) >= L + R - EPS && Math.abs(p.x) <= G - R + CONTACT_GAP) scoreGoal(state, p.y > 0 ? 0 : 1, events);
}

export function stepGame(state: GameState, targets: Targets, dt = TABLE.fixedDt): GameEvent[] {
  const events: GameEvent[] = [];
  let remaining = clamp(finite(dt), 0, 0.25);
  if (state.phase === 'finished') return events;
  while (remaining > EPS) {
    const step = Math.min(TABLE.fixedDt, remaining);
    simulateTick(state, targets, step, events);
    remaining -= step;
  }
  return events;
}

type AIProfile = { reaction: number; error: number; prediction: number; aggression: number; miss: number; };
const PROFILES: Record<Difficulty, AIProfile> = {
  Beginner: { reaction: 0.38, error: 0.88, prediction: 0.20, aggression: 0.48, miss: 0.19 },
  Easy:     { reaction: 0.23, error: 0.51, prediction: 0.48, aggression: 0.63, miss: 0.10 },
  Medium:   { reaction: 0.12, error: 0.25, prediction: 0.78, aggression: 0.78, miss: 0.04 },
  Hard:     { reaction: 0.065, error: 0.10, prediction: 0.95, aggression: 0.92, miss: 0.01 },
  Pro:      { reaction: 0.032, error: 0.025, prediction: 1, aggression: 1, miss: 0 },
};

/** Reflect an unbounded trajectory into the usable width, including banks. */
export function predictBankX(x: number, vx: number, time: number): number {
  const width = W - R;
  const period = 4 * width;
  const value = ((x + vx * Math.max(0, time) + width) % period + period) % period;
  return value <= 2 * width ? value - width : 3 * width - value;
}

export type AIController = { update: (state: GameState, dt: number) => Vec2; reset: () => void };

export function createAI(difficulty: Difficulty, side: Side = 1): AIController {
  const profile = PROFILES[difficulty] ?? PROFILES.Medium;
  const sign = signOf(side);
  let target: Vec2 = { x: 0, y: sign * HOME_Y };
  let reaction = 0;
  let strikeTime = 0;
  let missTime = 0;
  let attackGate = 0;
  let previousTick = -1;
  let previousPhase = '';
  let rngSeed = 0x9e3779b9;
  let initialized = false;
  const rng = () => {
    rngSeed ^= rngSeed << 13; rngSeed ^= rngSeed >>> 17; rngSeed ^= rngSeed << 5;
    return (rngSeed >>> 0) / 4294967296;
  };
  const reset = () => {
    target = { x: 0, y: sign * HOME_Y };
    reaction = strikeTime = missTime = attackGate = 0;
    previousTick = -1; previousPhase = ''; initialized = false;
  };
  return {
    reset,
    update(state, dt) {
      const delta = clamp(finite(dt), 0, 0.1);
      if (state.tick < previousTick) reset();
      if (!initialized) {
        rngSeed = ((state.seed ^ ((side + 1) * 0x27d4eb2d)) >>> 0) || 1;
        initialized = true;
      }
      previousTick = state.tick;
      if (state.phase !== 'playing') {
        reaction = 0; strikeTime = 0; missTime = 0;
        previousPhase = state.phase;
        target = { x: 0, y: sign * HOME_Y };
        return { ...target };
      }
      if (previousPhase !== 'playing') { reaction = 0; attackGate = 0; }
      previousPhase = state.phase;
      reaction -= delta; strikeTime -= delta; missTime -= delta; attackGate -= delta;
      if (strikeTime > 0 || missTime > 0 || reaction > 0) return { ...target };
      reaction = profile.reaction * (0.8 + rng() * 0.4);
      const p = state.puck, me = state.mallets[side], opponent = state.mallets[side === 0 ? 1 : 0];
      const u = p.y * sign, vu = p.vy * sign, myU = me.y * sign;
      const speed = Math.hypot(p.vx, p.vy);
      const error = (rng() + rng() - 1) * profile.error;
      const defenceRow = 5.62;

      if (vu > 0.3 && speed > 6.5) {
        const arrival = Math.max(0, (defenceRow - (R + M) - u) / vu);
        const predicted = predictBankX(p.x, p.vx, Math.min(arrival, 1.6) * profile.prediction);
        if (u > 1.2 && rng() < profile.miss) {
          missTime = 0.16 + rng() * 0.25;
          target = clampTarget(side, { x: predicted + (rng() > 0.5 ? 1 : -1) * 1.15, y: sign * defenceRow });
        } else {
          // Calculate the collision normal needed to redirect the incoming
          // velocity toward the exposed corner, including a predicted bank.
          let placement = 0;
          let row = defenceRow;
          if (profile.prediction > 0.7) {
            const predictionTime = Math.min(arrival, 1.6) * profile.prediction;
            const predictedVx = (predictBankX(p.x, p.vx, predictionTime + 0.0001) - predicted) / 0.0001;
            const incomingLength = Math.hypot(predictedVx, vu);
            const aimX = opponent.x >= 0 ? -0.98 : 0.98;
            const outX = aimX - predicted, outU = -L - (defenceRow - (R + M));
            const outgoingLength = Math.hypot(outX, outU);
            const normalX = outX / outgoingLength - predictedVx / incomingLength;
            const normalU = outU / outgoingLength - vu / incomingLength;
            const normalLength = Math.hypot(normalX, normalU);
            placement = -normalX / normalLength * (R + M) * profile.prediction;
            row = defenceRow - (R + M) - normalU / normalLength * (R + M);
          }
          target = clampTarget(side, { x: predicted + error + placement, y: sign * row });
        }
        return { ...target };
      }

      const canAttack = u > -0.1 && u < 5.95 && (speed < 10.5 || (vu > 0 && speed < 15));
      if (canAttack && attackGate <= 0) {
        if (rng() > profile.aggression) {
          attackGate = 0.18 + rng() * 0.3;
        } else {
          const lookAhead = Math.min(0.13, Math.hypot(p.x - me.x, u - myU) / TABLE.maxMalletSpeed);
          const anticipatedX = predictBankX(p.x, p.vx, lookAhead * profile.prediction);
          const anticipatedU = clamp(u + vu * lookAhead * profile.prediction, 0.1, 5.9);
          const aimX = profile.prediction > 0.7
            ? (opponent.x >= 0 ? -0.92 : 0.92)
            : (rng() - 0.5) * 2.3;
          const dx = aimX - anticipatedX;
          const du = -L - anticipatedU;
          const distance = Math.hypot(dx, du);
          const dirX = dx / distance, dirU = du / distance;
          const behind = clampTarget(side, { x: anticipatedX - dirX * 0.92 + error * 0.45, y: sign * (anticipatedU - dirU * 0.92) });
          const alignment = (me.x - p.x) * dirX + (myU - u) * dirU;
          const sideError = Math.abs((me.x - p.x) * -dirU + (myU - u) * dirX);
          if ((Math.hypot(me.x - behind.x, me.y - behind.y) < 0.32 || (alignment < -0.62 && sideError < 0.34)) && myU > u) {
            target = clampTarget(side, { x: anticipatedX + dirX * 1.6 + error * 0.4, y: sign * (anticipatedU + dirU * 1.6) });
            strikeTime = 0.11 + profile.reaction * 0.15;
            reaction = 0;
          } else {
            target = behind;
          }
          return { ...target };
        }
      }

      // Stay between puck and goal while it is on the rival's half. An AI
      // only reads visible position/velocity; it has no access to user input.
      const lead = vu > 0 ? Math.min(0.65, Math.max(0, (defenceRow - u) / vu)) : 0;
      const x = predictBankX(p.x, p.vx, lead * profile.prediction);
      target = clampTarget(side, { x: clamp(x * (vu > 0 ? 0.9 : 0.46) + error * 0.45, -2.9, 2.9), y: sign * (u > 5.8 ? 6.42 : defenceRow) });
      return { ...target };
    },
  };
}
