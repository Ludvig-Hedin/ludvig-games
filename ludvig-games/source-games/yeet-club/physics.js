/**
 * YEET CLUB simulation. No rendering or browser dependencies.
 * s is metres forward; x is lateral metres from road centre;
 * y is height above the sloping road. Call at a fixed 1/120 or 1/60 s.
 */
export const ROAD_HALF = 7.4;
export const RUN_DURATION = 90;
export const centerX = s => Math.sin(s * .0035) * 30 + Math.sin(s * .009) * 7;
export const groundY = s => -s * .035;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const approach = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;
const GRAVITY = 16.5;
const CART_HALF = .65;

export function hashSeed(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable layout shared by local opponents. IDs remain stable after sorting. */
export function createCourse(seed = 'yeet-club') {
  const random = seededRandom(seed);
  const objects = [];
  let id = 0;
  const add = (type, s, x, options = {}) => {
    const defaults = {
      coin: { w: .8, length: .8, height: 1.25 },
      boost: { w: 1.3, length: 1.3, height: 1.2 },
      ring: { w: 4.8, length: 1, height: 5.1 },
      cone: { w: .8, length: .8, height: .9 },
      barrier: { w: 3.5, length: 1.1, height: 1.25 },
      crate: { w: 1.65, length: 1.65, height: 1.65 },
      ramp: { w: 4.2, length: 10, height: 2.4 }
    };
    const object = { id: id++, type, s, x, ...defaults[type], ...options };
    objects.push(object);
    return object;
  };

  // An unobstructed start gives everyone time to discover the steering.
  for (let s = 38; s <= 68; s += 6) add('coin', s, 0);
  add('boost', 78, 0);
  const lanes = [-4.4, 0, 4.4];
  for (let block = 0, base = 90; base < 6900; block++, base += 130) {
    const laneIndex = block === 0 ? 1 : Math.floor(random() * 3);
    const rampLane = lanes[laneIndex];
    const leftOther = lanes[(laneIndex + 1) % 3];
    const rightOther = lanes[(laneIndex + 2) % 3];
    const variant = Math.floor(random() * 4);
    const rampS = base + 46;

    // A readable coin trail guides the player into each optional jump.
    for (let j = 0; j < 5; j++) add('coin', base + 9 + j * 6, rampLane);
    add('ramp', rampS, rampLane);
    add('ring', rampS + 24, rampLane);
    add('coin', rampS + 14, rampLane, { height: 4.7 });
    add('coin', rampS + 22, rampLane, { height: 5.1 });
    add('coin', rampS + 30, rampLane, { height: 4.3 });
    add('boost', base + 108, lanes[(laneIndex + 1) % 3]);

    // At most two lanes are blocked in a row. The jump approach stays clear.
    add(block < 2 ? 'cone' : 'barrier', base + 18, leftOther);
    add(variant === 1 ? 'barrier' : 'crate', base + 49, rightOther);
    if (block > 0) add('cone', base + 69, leftOther + (random() - .5) * .55);
    if (block > 2) add('cone', base + 77, rightOther);
    const endLane = lanes[(laneIndex + (variant % 2 ? 1 : 2)) % 3];
    add(variant === 3 ? 'barrier' : 'crate', base + 95, endLane);
    if (block > 7 && variant < 2) add('cone', base + 96, lanes[laneIndex]);
    const rewardLane = lanes[(lanes.indexOf(endLane) + 1) % 3];
    for (let j = 0; j < 3; j++) add('coin', base + 94 + j * 6, rewardLane);
  }
  objects.sort((a, b) => a.s - b.s || a.id - b.id);
  return objects;
}

export function createPlayer(options = {}) {
  return {
    id: options.id ?? 0,
    color: options.color ?? '#ff6338',
    name: options.name ?? 'Spelare 1',
    s: options.s ?? 10,
    x: options.x ?? 0,
    y: 0,
    speed: 0,
    steer: 0,
    lateralSpeed: 0,
    verticalSpeed: 0,
    roll: 0,
    pitch: -.035,
    boosting: false,
    grounded: true,
    health: 3,
    score: 0,
    coins: 0,
    distance: 0,
    combo: 0,
    multiplier: 1,
    bestMultiplier: 1,
    boost: 65,
    airtime: 0,
    bestAir: 0,
    totalAir: 0,
    crashes: 0,
    tricks: 0,
    nearMisses: 0,
    finished: false,
    finishReason: null,
    timeLeft: RUN_DURATION,
    invulnerable: 0,
    drift: 0,
    lastEvent: '',
    _startS: options.s ?? 10,
    _jumpHeld: false,
    _trickHeld: false,
    _trickTime: 0,
    _trickDirection: 1,
    _airTricks: 0,
    _rampId: null,
    _lastRampId: null,
    _edgeCooldown: 0,
    _comboClock: 0,
    _boostExhausted: false,
    _finishEmitted: false
  };
}

function lowerBound(course, value) {
  let lo = 0, hi = course.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (course[mid].s < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function reward(player, points, combo = 0) {
  player.score += points * player.multiplier;
  if (combo > 0) {
    player.combo += combo;
    player.multiplier = Math.min(4, 1 + Math.floor(player.combo / 6) * .25);
    player.bestMultiplier = Math.max(player.bestMultiplier ?? 1, player.multiplier);
    player._comboClock = 6;
  }
}

/**
 * Input: steer [-1,1], throttle [0,1], brake, boost, jump, trick [-1,1].
 * jump is edge-triggered. A second press in the air performs a barrel roll.
 * Holding trick does not retrigger; release and press for another roll.
 * consumed must be a separate Set for each player. Events are returned once.
 */
export function stepPlayer(player, input = {}, dt, course = [], consumed = new Set()) {
  const events = [];
  if (player.finished) return events;
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
  if (!dt) return events;
  const p = player;
  const oldS = p.s;
  const oldX = p.x;
  const oldY = p.y;
  const wasGrounded = p.grounded;
  const pressedJump = Boolean(input.jump) && !p._jumpHeld;
  const pressedTrick = Boolean(input.trick) && !p._trickHeld;
  p._jumpHeld = Boolean(input.jump);
  p._trickHeld = Boolean(input.trick);
  p.timeLeft = Math.max(0, p.timeLeft - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p._edgeCooldown = Math.max(0, p._edgeCooldown - dt);
  p._comboClock = Math.max(0, p._comboClock - dt);
  if (p._comboClock === 0 && p.combo > 0) {
    p.combo = 0;
    p.multiplier = 1;
  }

  const steering = clamp(Number.isFinite(input.steer) ? input.steer : 0, -1, 1);
  p.steer = approach(p.steer, steering, 13, dt);
  if (!input.boost) p._boostExhausted = false;
  if (p.boost < .5 && input.boost) p._boostExhausted = true;
  p.boosting = Boolean(input.boost) && !input.brake && p.boost > .5 && !p._boostExhausted;
  const throttle = clamp(Number.isFinite(input.throttle) ? input.throttle : 0, 0, 1);
  const targetSpeed = input.brake ? 13 : p.boosting ? 48 : 26 + throttle * 5;
  p.speed = approach(p.speed, targetSpeed, p.boosting ? 2.5 : input.brake ? 3.3 : 1.05, dt);
  p.speed = clamp(p.speed, 0, 56);
  p.boost = clamp(p.boost + (p.boosting ? -32 : p.grounded ? 7 : 3) * dt, 0, 100);
  const driftTarget = input.brake && Math.abs(steering) > .15 && p.grounded ? Math.abs(steering) : 0;
  p.drift = approach(p.drift, driftTarget, 7, dt);
  const lateralTarget = p.steer * (p.grounded ? 8.3 + p.speed * .07 : 5.2);
  p.lateralSpeed = approach(p.lateralSpeed, lateralTarget, p.grounded ? input.brake ? 4.5 : 10 : 4.2, dt);
  p.x += p.lateralSpeed * dt;
  p.s += p.speed * dt;
  p.distance = Math.max(0, p.s - p._startS);
  reward(p, (p.s - oldS) * 2.1);

  // Elastic road shoulders preserve control and avoid frustrating instant deaths.
  const boundary = ROAD_HALF - CART_HALF;
  if (Math.abs(p.x) > boundary) {
    const side = Math.sign(p.x);
    p.x = side * boundary;
    p.lateralSpeed = -side * Math.max(1.8, Math.abs(p.lateralSpeed) * .5);
    p.speed *= .985;
    if (p._edgeCooldown === 0) {
      p._edgeCooldown = .65;
      events.push({ type: 'edge', side, s: p.s });
    }
  }

  // Ground height is the maximum ramp surface directly beneath the cart.
  let ramp = null;
  let rampSurface = 0;
  const nearbyStart = lowerBound(course, oldS - 16);
  for (let i = nearbyStart; i < course.length && course[i].s < p.s + 16; i++) {
    const object = course[i];
    if (object.type !== 'ramp' || Math.abs(p.x - object.x) > object.w * .5 - .05) continue;
    const start = object.s - object.length * .5;
    const end = object.s + object.length * .5;
    if (p.s >= start && p.s <= end) {
      const surface = clamp((p.s - start) / object.length, 0, 1) * object.height;
      if (surface >= rampSurface) { ramp = object; rampSurface = surface; }
    }
  }

  if (pressedJump && p.grounded) {
    p.grounded = false;
    p.verticalSpeed = 7.7 + (p.boosting ? 1 : 0);
    p.airtime = 0;
    p._airTricks = 0;
    p._rampId = null;
    events.push({ type: 'jump', ramp: false, s: p.s });
  } else if (p.grounded && p._rampId !== null && (!ramp || ramp.id !== p._rampId)) {
    // Leaving the lip or shoulder of a ramp gives the cart a clean impulse.
    p.grounded = false;
    p.verticalSpeed = 8.8 + p.speed * .055;
    p.airtime = 0;
    p._airTricks = 0;
    p._lastRampId = p._rampId;
    p._rampId = null;
    events.push({ type: 'jump', ramp: true, s: p.s });
  }

  if (!p.grounded && (pressedTrick || (pressedJump && !wasGrounded)) && p._trickTime === 0 && p.y > .65) {
    p._trickTime = .76;
    p._trickDirection = Math.sign(input.trick || input.steer || 1);
  }

  if (p.grounded) {
    p.y = rampSurface;
    p.verticalSpeed = 0;
    p._rampId = ramp?.id ?? null;
    p.airtime = 0;
  } else {
    p.verticalSpeed -= GRAVITY * dt;
    p.y += p.verticalSpeed * dt;
    p.airtime += dt;
    p.totalAir += dt;
    p.bestAir = Math.max(p.bestAir, p.airtime);
    reward(p, dt * 45);
    if (p._trickTime > 0) {
      p._trickTime = Math.max(0, p._trickTime - dt);
      if (p._trickTime === 0) {
        p._airTricks++;
        p.tricks++;
        p.boost = Math.min(100, p.boost + 13);
        const points = 300 + (p._airTricks - 1) * 150;
        reward(p, points, 3);
        events.push({ type: 'trick', points, name: 'BARREL ROLL', count: p._airTricks, s: p.s });
      }
    }
    if (p.verticalSpeed <= 0 && p.y <= rampSurface) {
      p.y = rampSurface;
      p.grounded = true;
      p._rampId = ramp?.id ?? null;
      p.verticalSpeed = 0;
      const clean = p._trickTime === 0 || p._trickTime < .12;
      const points = p.airtime > .45 ? Math.round(75 + p.airtime * 35 + p._airTricks * 75) : 0;
      if (points > 0) {
        reward(p, clean ? points : Math.round(points * .4), clean ? 2 : 0);
        p.boost = Math.min(100, p.boost + (clean ? 8 : 2));
        if (!clean) p.speed *= .82;
        events.push({ type: 'land', points: clean ? points : Math.round(points * .4), clean, airtime: p.airtime, tricks: p._airTricks, s: p.s });
      }
      p._trickTime = 0;
      p.airtime = 0;
      p._airTricks = 0;
    }
  }

  const bank = -p.steer * (p.grounded ? .09 + p.drift * .13 : .1);
  p.roll = bank + (p._trickTime > 0 ? (1 - p._trickTime / .76) * TAU * p._trickDirection : 0);
  const pitchTarget = p.grounded ? ramp ? Math.atan2(ramp.height, ramp.length) - .035 : -.035 : Math.atan2(p.verticalSpeed, Math.max(12, p.speed)) * .65 - .035;
  p.pitch = approach(p.pitch, pitchTarget, 10, dt);

  // Swept forward tests cannot skip a pickup or thin obstacle at boost speed.
  for (let i = nearbyStart; i < course.length && course[i].s <= p.s + 1.5; i++) {
    const object = course[i];
    if (object.type === 'ramp' || consumed.has(object.id)) continue;
    const reach = (object.length ?? 1) * .5 + .9;
    if (oldS > object.s + reach || p.s < object.s - reach) continue;
    const fraction = clamp((object.s - oldS) / Math.max(.00001, p.s - oldS), 0, 1);
    const xAt = oldX + (p.x - oldX) * fraction;
    const yAt = oldY + (p.y - oldY) * fraction;
    const dx = Math.abs(xAt - object.x);
    if (object.type === 'coin' || object.type === 'boost') {
      if (dx < (object.w ?? 1) * .5 + .8 && Math.abs(yAt + 1 - object.height) < 1.65) {
        consumed.add(object.id);
        if (object.type === 'coin') {
          p.coins++;
          reward(p, 50, 1);
          events.push({ type: 'coin', id: object.id, points: 50, x: object.x, s: object.s, y: object.height });
        } else {
          p.boost = Math.min(100, p.boost + 35);
          reward(p, 100, 1);
          events.push({ type: 'boost', id: object.id, points: 100, x: object.x, s: object.s, y: object.height });
        }
      }
    } else if (object.type === 'ring') {
      if (dx < object.w * .5 - .15 && Math.abs(yAt + 1 - object.height) < 2.2 && !p.grounded) {
        consumed.add(object.id);
        reward(p, 250, 3);
        p.boost = Math.min(100, p.boost + 15);
        events.push({ type: 'ring', id: object.id, points: 250, x: object.x, s: object.s, y: object.height });
      }
    } else {
      const overlap = dx < object.w * .5 + CART_HALF;
      const underTop = yAt < object.height + .15;
      if (overlap && underTop) {
        consumed.add(object.id);
        if (p.invulnerable <= 0) {
          const damage = object.type === 'cone' ? 0 : 1;
          p.health = Math.max(0, p.health - damage);
          p.crashes += damage;
          p.invulnerable = damage ? 1.65 : .7;
          p.speed *= damage ? .49 : .73;
          p.boost = Math.max(0, p.boost - (damage ? 12 : 5));
          p.combo = 0;
          p.multiplier = 1;
          p._comboClock = 0;
          p.lateralSpeed += (p.x >= object.x ? 1 : -1) * 3;
          events.push({ type: 'hit', id: object.id, health: p.health, damage, objectType: object.type, s: object.s, x: object.x });
        }
      } else if (p.s > object.s + reach && oldS <= object.s + reach && !overlap && dx < object.w * .5 + CART_HALF + 1.35 && underTop && p.speed > 17) {
        consumed.add(object.id);
        p.nearMisses++;
        reward(p, 100, 2);
        events.push({ type: 'near', id: object.id, points: 100, s: object.s });
      }
    }
  }

  if (p.health <= 0 || p.timeLeft <= 0) {
    p.finished = true;
    p.finishReason = p.health <= 0 ? 'crash' : 'time';
    p.boosting = false;
    p.speed = 0;
    p.lateralSpeed = 0;
    p._finishEmitted = true;
    events.push({ type: 'finish', reason: p.finishReason, score: Math.round(p.score), distance: p.distance });
  }
  p.lastEvent = events.length ? events[events.length - 1].type : p.lastEvent;
  return events;
}
