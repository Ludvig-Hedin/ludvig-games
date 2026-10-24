/**
 * Hoop Rush's shared, deterministic basketball simulation.
 * Metres, seconds, and kilograms; no browser or rendering dependencies.
 * The multiplayer service evaluates the very same shots as the browser.
 */
export const COURT = Object.freeze({
  ballRadius: 0.115,
  rimRadius: 0.235,
  rimTube: 0.018,
  rimY: 3.05,
  rimZ: -1.2,
  boardZ: -1.6,
  boardWidth: 1.8,
  boardBottom: 2.9,
  boardTop: 4.0,
  launchY: 1.45,
  launchZ: 3.0,
  laneHalfWidth: 1.15,
  gravity: 9.81,
});

export const PHYSICS_STEP = 1 / 240;
export const SHOT_COOLDOWN = 0.38;
export const DIFFICULTIES = Object.freeze(['Beginner', 'Easy', 'Medium', 'Hard', 'Pro']);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (x, fallback) => Number.isFinite(x) ? x : fallback;

export function floorAt(z) {
  return 0.82 - 0.075 * z;
}

export function launchPosition(challenge = 'classic') {
  return { x: 0, y: COURT.launchY, z: challenge === 'distance' ? 3.6 : COURT.launchZ };
}

export function hoopAt(timeSeconds = 0, challenge = 'classic') {
  const t = finite(timeSeconds, 0);
  return {
    x: challenge === 'moving' ? 0.54 * Math.sin(t * 0.95)
      : challenge === 'daily' ? 0.46 * Math.sin(t * 1.12) : 0,
    y: COURT.rimY + (challenge === 'daily' ? 0.055 * Math.sin(t * 0.61) : 0),
    z: COURT.rimZ,
    radius: challenge === 'precision' ? 0.205 : challenge === 'daily' ? 0.22 : COURT.rimRadius,
  };
}

function hoopVelocity(time, challenge) {
  return {
    x: challenge === 'moving' ? 0.54 * 0.95 * Math.cos(time * 0.95)
      : challenge === 'daily' ? 0.46 * 1.12 * Math.cos(time * 1.12) : 0,
    y: challenge === 'daily' ? 0.055 * 0.61 * Math.cos(time * 0.61) : 0,
    z: 0,
  };
}

/** The power sweet spot is .58. Both launch speed and arc change continuously. */
export function makeShotVelocity(aim = 0, power = 0.58, challenge = 'classic') {
  const a = clamp(finite(aim, 0), -1, 1);
  const p = clamp(finite(power, 0.58), 0.12, 1);
  const launch = launchPosition(challenge);
  const flight = challenge === 'distance' ? 1.26 : 1.2;
  const vy = (COURT.rimY - launch.y + 0.5 * COURT.gravity * flight * flight) / flight;
  return {
    vx: a * 1.4,
    vy: vy + (p - 0.58) * 1.6,
    vz: (COURT.rimZ - launch.z) / flight * (1 + (p - 0.58) * 0.28),
  };
}

export function createBall({ id = 0, aim = 0, power = 0.58, shotTime = 0, challenge = 'classic', lane = 0 } = {}) {
  aim = clamp(finite(aim, 0), -1, 1);
  power = clamp(finite(power, 0.58), 0.12, 1);
  const launch = launchPosition(challenge);
  const velocity = makeShotVelocity(aim, power, challenge);
  return {
    id, lane, ...launch, ...velocity,
    prevX: launch.x, prevY: launch.y, prevZ: launch.z,
    age: 0, shotTime: finite(shotTime, 0), challenge,
    aim, power,
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    spin: { x: 8 + power * 2, y: -aim * 2.4, z: aim * 0.8 },
    scored: false, swish: false, dead: false, missed: false,
    rimGate: false, gateTime: null, scoreTime: null,
    contacts: { rim: 0, board: 0, floor: 0, wall: 0, net: 0 },
    contactTimes: { rim: -10, board: -10, floor: -10, wall: -10 },
  };
}

function recordContact(ball, type, strength, events, surface) {
  // A resting or vibrating contact emits one sound, not 240 sounds a second.
  if (ball.age - (ball.contactTimes[type] ?? -10) > 0.065 && strength > 0.13) {
    ball.contacts[type] = (ball.contacts[type] ?? 0) + 1;
    ball.contactTimes[type] = ball.age;
    events.push({ type, strength, surface, x: ball.x, y: ball.y, z: ball.z });
  }
}

function impact(ball, nx, ny, nz, restitution, friction, surfaceVelocity = { x: 0, y: 0, z: 0 }) {
  const rx = ball.vx - surfaceVelocity.x;
  const ry = ball.vy - surfaceVelocity.y;
  const rz = ball.vz - surfaceVelocity.z;
  const normalVelocity = rx * nx + ry * ny + rz * nz;
  if (normalVelocity >= 0) return 0;
  const impulse = -(1 + restitution) * normalVelocity;
  ball.vx += impulse * nx;
  ball.vy += impulse * ny;
  ball.vz += impulse * nz;
  // Tangential loss models grip; it is independent of frame rate.
  ball.vx -= (rx - normalVelocity * nx) * friction;
  ball.vy -= (ry - normalVelocity * ny) * friction;
  ball.vz -= (rz - normalVelocity * nz) * friction;
  ball.spin.x += (ny * rz - nz * ry) * friction * 2;
  ball.spin.y += (nz * rx - nx * rz) * friction * 2;
  ball.spin.z += (nx * ry - ny * rx) * friction * 2;
  return -normalVelocity;
}

function collideRim(ball, hoop, velocity, events) {
  const dx = ball.x - hoop.x;
  const dz = ball.z - hoop.z;
  const radial = Math.hypot(dx, dz);
  const qx = hoop.x + (radial > 1e-9 ? dx / radial : 1) * hoop.radius;
  const qz = hoop.z + (radial > 1e-9 ? dz / radial : 0) * hoop.radius;
  const nx0 = ball.x - qx;
  const ny0 = ball.y - hoop.y;
  const nz0 = ball.z - qz;
  const distance = Math.hypot(nx0, ny0, nz0);
  const radius = COURT.ballRadius + COURT.rimTube;
  if (distance >= radius || distance < 1e-9) return;
  const nx = nx0 / distance, ny = ny0 / distance, nz = nz0 / distance;
  const penetration = radius - distance + 1e-6;
  ball.x += nx * penetration;
  ball.y += ny * penetration;
  ball.z += nz * penetration;
  const strength = impact(ball, nx, ny, nz, 0.69, 0.025, velocity);
  recordContact(ball, 'rim', strength, events, 'rim');
}

function collideBoard(ball, hoop, velocity, events) {
  // Sphere against a thin finite box, including its edges and back face.
  const ymin = COURT.boardBottom + hoop.y - COURT.rimY;
  const ymax = COURT.boardTop + hoop.y - COURT.rimY;
  const xmin = hoop.x - COURT.boardWidth / 2;
  const xmax = hoop.x + COURT.boardWidth / 2;
  const zmin = COURT.boardZ - 0.03, zmax = COURT.boardZ + 0.03;
  const qx = clamp(ball.x, xmin, xmax), qy = clamp(ball.y, ymin, ymax), qz = clamp(ball.z, zmin, zmax);
  let dx = ball.x - qx, dy = ball.y - qy, dz = ball.z - qz;
  let distance = Math.hypot(dx, dy, dz);
  if (distance >= COURT.ballRadius) return;
  if (distance < 1e-9) {
    // Defensive fallback for externally supplied states inside the box.
    const faces = [
      [Math.abs(ball.x - xmin), -1, 0, 0], [Math.abs(ball.x - xmax), 1, 0, 0],
      [Math.abs(ball.y - ymin), 0, -1, 0], [Math.abs(ball.y - ymax), 0, 1, 0],
      [Math.abs(ball.z - zmin), 0, 0, -1], [Math.abs(ball.z - zmax), 0, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    const face = faces[0];
    dx = face[1]; dy = face[2]; dz = face[3];
    const push = COURT.ballRadius + face[0] + 1e-6;
    ball.x += dx * push; ball.y += dy * push; ball.z += dz * push;
  } else {
    dx /= distance; dy /= distance; dz /= distance;
    const push = COURT.ballRadius - distance + 1e-6;
    ball.x += dx * push; ball.y += dy * push; ball.z += dz * push;
  }
  const strength = impact(ball, dx, dy, dz, 0.68, 0.045, velocity);
  recordContact(ball, 'board', strength, events, 'backboard');
}

function collideCageAndFloor(ball, dt, events) {
  const r = COURT.ballRadius;
  const slopeNorm = Math.sqrt(1 + 0.075 * 0.075);
  const onDeck = Math.abs(ball.x) < COURT.laneHalfWidth + r && ball.z > -2.35 && ball.z < 3.85;
  const floor = onDeck ? floorAt(ball.z) : 0;
  const ny = onDeck ? 1 / slopeNorm : 1;
  const nz = onDeck ? 0.075 / slopeNorm : 0;
  const separation = (ball.y - floor) * ny;
  if (separation < r) {
    const penetration = r - separation + 1e-6;
    ball.y += penetration * ny;
    ball.z += penetration * nz;
    const strength = impact(ball, 0, ny, nz, 0.57, 0.075);
    recordContact(ball, 'floor', strength, events, onDeck ? 'return' : 'floor');
    const rolling = Math.exp(-1.6 * dt);
    ball.vx *= rolling; ball.vz *= rolling;
    ball.spin.x += (ball.vz / r - ball.spin.x) * Math.min(1, 6 * dt);
  }

  const cageTop = 4.1 - 0.48 * (ball.z + 2.0);
  if (ball.z > -2.2 && ball.z < 3.25 && ball.y < cageTop && ball.y > floor - 0.05) {
    if (Math.abs(ball.x) > COURT.laneHalfWidth - r) {
      const normal = ball.x > 0 ? -1 : 1;
      ball.x = -normal * (COURT.laneHalfWidth - r - 1e-6);
      const strength = impact(ball, normal, 0, 0, 0.4, 0.12);
      recordContact(ball, 'wall', strength, events, 'cage');
    }
  }
  if (ball.z < -2.12 + r && ball.z > -2.8 && ball.y < 4.3 && Math.abs(ball.x) < COURT.laneHalfWidth) {
    ball.z = -2.12 + r + 1e-6;
    const strength = impact(ball, 0, 0, 1, 0.38, 0.13);
    recordContact(ball, 'wall', strength, events, 'rear');
  }
}

function updateQuaternion(ball, dt) {
  const w = ball.spin;
  const speed = Math.hypot(w.x, w.y, w.z);
  if (speed < 1e-6) return;
  const half = speed * dt / 2, s = Math.sin(half) / speed;
  const x = w.x * s, y = w.y * s, z = w.z * s, a = Math.cos(half);
  const q = ball.rotation;
  const rx = a * q.x + x * q.w + y * q.z - z * q.y;
  const ry = a * q.y - x * q.z + y * q.w + z * q.x;
  const rz = a * q.z + x * q.y - y * q.x + z * q.w;
  const rw = a * q.w - x * q.x - y * q.y - z * q.z;
  const len = Math.hypot(rx, ry, rz, rw);
  q.x = rx / len; q.y = ry / len; q.z = rz / len; q.w = rw / len;
}

function integrate(ball, dt, time, challenge, events) {
  const x0 = ball.x, y0 = ball.y, z0 = ball.z;
  const oldHoop = hoopAt(time, challenge);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt - 0.5 * COURT.gravity * dt * dt;
  ball.z += ball.vz * dt;
  ball.vy -= COURT.gravity * dt;
  ball.age += dt;
  const hoop = hoopAt(time + dt, challenge);
  const velocity = hoopVelocity(time + dt, challenge);

  collideRim(ball, hoop, velocity, events);
  collideBoard(ball, hoop, velocity, events);
  collideCageAndFloor(ball, dt, events);

  // A basket is a geometric crossing of the centre through the inner opening.
  // Its clearance accounts for both the tube and the whole basketball radius.
  const before = y0 - oldHoop.y, after = ball.y - hoop.y;
  if (!ball.scored && before > 0 && after <= 0 && ball.vy - velocity.y < 0) {
    const fraction = before / Math.max(1e-12, before - after);
    const hx = oldHoop.x + (hoop.x - oldHoop.x) * fraction;
    const hz = oldHoop.z + (hoop.z - oldHoop.z) * fraction;
    const px = x0 + (ball.x - x0) * fraction;
    const pz = z0 + (ball.z - z0) * fraction;
    const clearance = hoop.radius - COURT.rimTube - COURT.ballRadius + 0.002;
    if (Math.hypot(px - hx, pz - hz) <= clearance) {
      ball.rimGate = true;
      ball.gateTime = ball.age;
    }
  }
  // Re-emerging above the ring cancels a possible score; rattles can re-enter.
  if (ball.rimGate && !ball.scored && ball.y > hoop.y + COURT.ballRadius) ball.rimGate = false;
  if (ball.rimGate && !ball.scored && ball.y <= hoop.y - COURT.ballRadius - 0.01 && ball.vy < 0) {
    const radial = Math.hypot(ball.x - hoop.x, ball.z - hoop.z);
    if (radial < hoop.radius - COURT.rimTube && ball.age - ball.gateTime < 0.75) {
      ball.scored = true;
      ball.swish = ball.contacts.rim === 0 && ball.contacts.board === 0;
      ball.scoreTime = ball.age;
      events.push({ type: 'score', strength: Math.abs(ball.vy), swish: ball.swish, bank: ball.contacts.board > 0, x: hoop.x, y: hoop.y, z: hoop.z });
    }
    ball.rimGate = false;
  }

  // Flexible net forces apply only to a ball which has crossed the actual rim.
  // They cannot pull a missed shot into the basket.
  if (ball.scored && ball.y < hoop.y && ball.y > hoop.y - 0.64) {
    if (ball.contacts.net === 0) {
      ball.contacts.net = 1;
      events.push({ type: 'net', strength: Math.abs(ball.vy), swish: ball.swish, x: hoop.x, y: hoop.y, z: hoop.z });
    }
    const depth = (hoop.y - ball.y) / 0.64;
    const dx = ball.x - hoop.x, dz = ball.z - hoop.z;
    const radius = Math.hypot(dx, dz);
    const netRadius = hoop.radius * (1 - 0.40 * depth);
    const overlap = radius + COURT.ballRadius - netRadius;
    if (overlap > 0 && radius > 1e-6) {
      const force = Math.min(70, overlap * 160);
      ball.vx -= dx / radius * force * dt;
      ball.vz -= dz / radius * force * dt;
    }
    const drag = Math.exp(-2.7 * dt);
    ball.vx *= drag; ball.vz *= drag; ball.vy *= Math.exp(-1.4 * dt);
  }

  updateQuaternion(ball, dt);
  if (!ball.scored && !ball.missed && ((ball.y < 1.65 && ball.vy < 0 && ball.age > 0.3) || ball.age > 4.2)) {
    ball.missed = true;
    events.push({ type: 'miss', strength: 0, x: ball.x, y: ball.y, z: ball.z });
  }
  if (ball.age > 6.5 || ball.y < -1 || Math.abs(ball.x) > 8 || Math.abs(ball.z) > 8) ball.dead = true;
}

/**
 * Advance by any frame interval. Call with PHYSICS_STEP for exactly reproducible
 * outcomes. Adaptive substeps bound every displacement below half a radius.
 * timeSeconds is the absolute simulation time at the START of this interval.
 */
export function stepBall(ball, dt = PHYSICS_STEP, timeSeconds = ball.shotTime + ball.age, challenge = ball.challenge || 'classic') {
  if (ball.dead || !Number.isFinite(dt) || dt <= 0) return [];
  ball.prevX = ball.x; ball.prevY = ball.y; ball.prevZ = ball.z;
  const events = [];
  let elapsed = 0;
  while (elapsed < dt - 1e-10 && !ball.dead) {
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz) + COURT.gravity * PHYSICS_STEP;
    const step = Math.min(dt - elapsed, PHYSICS_STEP, COURT.ballRadius * 0.42 / Math.max(1, speed));
    integrate(ball, step, timeSeconds + elapsed, challenge, events);
    elapsed += step;
  }
  return events;
}

/** Replay a shot, stopping after its outcome. Never trusts client score data. */
export function simulateShot({ aim = 0, power = 0.58, shotTime = 0, challenge = 'classic', trajectory = false } = {}) {
  const ball = createBall({ aim, power, shotTime, challenge });
  const points = trajectory ? [{ x: ball.x, y: ball.y, z: ball.z, t: 0 }] : undefined;
  let i = 0;
  while (!ball.scored && !ball.missed && !ball.dead && ball.age < 4.5) {
    stepBall(ball, PHYSICS_STEP, shotTime + ball.age, challenge);
    if (points && ++i % 6 === 0) points.push({ x: ball.x, y: ball.y, z: ball.z, t: ball.age });
  }
  return {
    scored: ball.scored,
    swish: ball.swish,
    scoreTime: ball.scoreTime,
    flightTime: ball.age,
    contacts: { ...ball.contacts },
    ...(points ? { trajectory: points } : {}),
  };
}

function seeded(seed, sequence) {
  let h = 2166136261;
  const text = String(seed) + ':' + sequence;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Aim planning only: opponents launch ordinary balls and obey all collisions. */
export function aiShot(difficulty = 'Medium', sequence = 0, seed = 1, shotTime = 0, challenge = 'classic') {
  const index = Math.max(0, DIFFICULTIES.findIndex(d => d.toLowerCase() === String(difficulty).toLowerCase()));
  const profile = [
    { aim: 0.078, power: 0.050, recovery: 1.95, variation: 0.55, reaction: 0.20 },
    { aim: 0.058, power: 0.037, recovery: 1.65, variation: 0.40, reaction: 0.13 },
    { aim: 0.042, power: 0.026, recovery: 1.33, variation: 0.31, reaction: 0.075 },
    { aim: 0.029, power: 0.019, recovery: 1.06, variation: 0.24, reaction: 0.04 },
    { aim: 0.023, power: 0.016, recovery: 0.84, variation: 0.19, reaction: 0.02 },
  ][index];
  const random = seeded(seed, sequence);
  const radius = Math.sqrt(-2 * Math.log(Math.max(1e-6, random())));
  const angle = random() * Math.PI * 2;
  const aimError = radius * Math.cos(angle) * profile.aim;
  const powerError = radius * Math.sin(angle) * profile.power;
  const timeError = (random() * 2 - 1) * profile.reaction;
  const flight = challenge === 'distance' ? 1.26 : 1.2;
  const target = hoopAt(shotTime + flight + timeError, challenge);
  // Use the same ordinary ballistic release; intelligence estimates the lead.
  const aim = target.x / (flight * 1.4) + aimError;
  const power = 0.58 + (target.y - COURT.rimY) / 2.65 + powerError;
  return {
    aim: clamp(aim, -1, 1),
    power: clamp(power, 0.12, 1),
    delay: profile.recovery + random() * profile.variation,
  };
}
