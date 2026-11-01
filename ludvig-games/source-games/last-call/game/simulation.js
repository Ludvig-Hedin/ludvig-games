import { ARENA, GATES, OBSTACLES, CONVEYORS, RAMPS } from './config.js';

// The entire simulation is independent of rendering and runs at 60 Hz. The seeded
// generator is also used for spills and respawns, making daily runs reproducible.
const DT = 1 / 60;
const RADIUS = 1.12;
const PICKUP_RADIUS = 2.65;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

function random(state) {
  let t = state.rngState += 0x6d2b79f5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  state.rngState >>>= 0;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function blocked(x, z, margin = RADIUS + 0.2) {
  if (Math.abs(x) > ARENA.halfX - margin || Math.abs(z) > ARENA.halfZ - margin) return true;
  return OBSTACLES.some(o => o.r
    ? (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + margin) ** 2
    : Math.abs(x - o.x) < o.w / 2 + margin && Math.abs(z - o.z) < o.d / 2 + margin);
}

function makePlayer(id, x, z, targetGate, isBot = false) {
  return {
    id, x, z, vx: 0, vz: 0, angle: 0, y: 0, vy: 0, speed: 0,
    steer: 0, drifting: false, boosting: false, boostEnergy: 100,
    cargo: 0, maxCargo: 8, score: 0, delivered: 0, deliveries: 0,
    targetGate, combo: 1, driftCharge: 0, totalDrift: 0, bestDrift: 0,
    collisionCooldown: 0, driftTime: 0, turboTimer: 0, rampCooldown: 0,
    distance: 0, crashes: 0, pickups: 0, airTime: 0, isBot,
    _spawn: { x, z }, _lastX: x, _lastZ: z, _gateCooldown: 0,
    _path: [], _pathTime: 0, _stuck: 0, _reverse: 0, _target: null,
    _boostExhausted: false,
  };
}

function addBag(state, x, z, loose = false, ownerId = null) {
  const bag = {
    id: `bag-${state.nextPickupId++}`, x, z, active: true, respawn: 0,
    colorIndex: Math.floor(random(state) * 5), loose,
    ownerId, ownerGrace: loose ? 1.25 : 0, expires: loose ? 15 : 0,
  };
  state.pickups.push(bag);
  return bag;
}

export function createGame({ mode = 'solo', seed = 1, duration = 90, difficulty = 'normal' } = {}) {
  const normalizedSeed = (finite(Number(seed), 1) >>> 0) || 1;
  const state = {
    mode: ['solo', 'duel', 'daily'].includes(mode) ? mode : 'solo',
    seed: normalizedSeed, rngState: normalizedSeed,
    duration: clamp(finite(duration, 90), 10, 600),
    elapsed: 0, timeLeft: 0, finished: false, nextPickupId: 0,
    players: [], bots: [], pickups: [], hazards: [], difficulty,
  };
  state.timeLeft = state.duration;
  state.players.push(makePlayer('p1', -3, 38, 0));
  if (state.mode === 'duel') state.players.push(makePlayer('p2', 3, 38, 1));
  state.bots.push(makePlayer('b1', -33, -37, 3, true), makePlayer('b2', 33, -37, 2, true));
  state.bots[0].angle = Math.PI;
  state.bots[1].angle = Math.PI;

  // The opening has an immediately readable trail; the rest of the terminal
  // varies with the seed without ever hiding bags inside scenery.
  const fixed = [
    [-3, 33], [3, 33], [-5, 25], [5, 25], [-5, 15], [5, 15],
    [-5, -15], [5, -15], [-5, -26], [5, -26], [-4, -37], [4, -37],
    [-13, -38], [13, -38], [-23, -40], [23, -40],
    [-27, -22], [27, -22], [-27, -10], [27, -10],
    [-27, 8], [27, 8], [-27, 22], [27, 22],
    [-26, 39], [26, 39], [-15, 39], [15, 39],
    [-13, 1], [13, 1], [-8, -7], [8, 7],
  ];
  for (const [x, z] of fixed) addBag(state, x, z);
  let tries = 0;
  while (state.pickups.length < 64 && tries++ < 1000) {
    const x = (random(state) * 2 - 1) * (ARENA.halfX - 4);
    const z = (random(state) * 2 - 1) * (ARENA.halfZ - 4);
    if (blocked(x, z, 2.4) || state.pickups.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < 25)) continue;
    if (GATES.some(g => (g.x - x) ** 2 + (g.z - z) ** 2 < 45)) continue;
    addBag(state, x, z);
  }
  return state;
}

// Repositioning costs held cargo, never already banked score. This also gives
// keyboard and touch users an escape hatch if a spectacular pile-up traps them.
export function resetPlayer(state, playerId = 'p1') {
  const p = [...state.players, ...state.bots].find(v => v.id === playerId);
  if (!p || state.finished) return false;
  p.x = p._spawn.x; p.z = p._spawn.z; p.vx = 0; p.vz = 0;
  p.y = 0; p.vy = 0; p.angle = 0; p.speed = 0; p.cargo = 0;
  p.drifting = false; p.boosting = false; p.driftCharge = 0; p.steer = 0;
  p.driftTime = 0; p.turboTimer = 0; p.collisionCooldown = 1;
  p._stuck = 0; p._reverse = 0; p._path = []; p._boostExhausted = false;
  return true;
}

function emit(events, type, p, extra = {}) {
  events.push({ type, playerId: p.id, x: p.x, z: p.z, ...extra });
}

function spill(state, p, strength, events) {
  if (strength < 8.5 || p.collisionCooldown > 0) return;
  p.collisionCooldown = 0.85;
  p.crashes++;
  p.combo = Math.max(1, p.combo - 1);
  p.driftCharge *= 0.35;
  const count = Math.min(p.cargo, strength > 23 ? 3 : strength > 15 ? 2 : 1);
  p.cargo -= count;
  for (let i = 0; i < count; i++) {
    let x = p.x, z = p.z;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = random(state) * TAU;
      const r = 2.8 + random(state) * 2.8;
      const nx = clamp(p.x + Math.sin(a) * r, -ARENA.halfX + 2, ARENA.halfX - 2);
      const nz = clamp(p.z + Math.cos(a) * r, -ARENA.halfZ + 2, ARENA.halfZ - 2);
      if (!blocked(nx, nz, 0.65)) { x = nx; z = nz; break; }
    }
    addBag(state, x, z, true, p.id);
  }
  emit(events, 'collision', p, { strength, amount: count });
}

function impact(state, p, nx, nz, events) {
  const v = p.vx * nx + p.vz * nz;
  if (v >= 0) return;
  p.vx -= v * nx * 1.22;
  p.vz -= v * nz * 1.22;
  spill(state, p, -v, events);
}

function resolveScenery(state, p, events) {
  const maxX = ARENA.halfX - RADIUS;
  const maxZ = ARENA.halfZ - RADIUS;
  if (p.x < -maxX) { p.x = -maxX; impact(state, p, 1, 0, events); }
  if (p.x > maxX) { p.x = maxX; impact(state, p, -1, 0, events); }
  if (p.z < -maxZ) { p.z = -maxZ; impact(state, p, 0, 1, events); }
  if (p.z > maxZ) { p.z = maxZ; impact(state, p, 0, -1, events); }
  for (const o of OBSTACLES) {
    if (o.r) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz), radius = o.r + RADIUS;
      if (d >= radius) continue;
      const nx = d > 0.001 ? dx / d : 1;
      const nz = d > 0.001 ? dz / d : 0;
      p.x = o.x + nx * radius; p.z = o.z + nz * radius;
      impact(state, p, nx, nz, events);
    } else {
      // Rounded-rectangle collision preserves corner slides instead of snagging.
      const cx = clamp(p.x, o.x - o.w / 2, o.x + o.w / 2);
      const cz = clamp(p.z, o.z - o.d / 2, o.z + o.d / 2);
      let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= RADIUS) continue;
      if (d > 0.001) {
        dx /= d; dz /= d;
        p.x = cx + dx * RADIUS; p.z = cz + dz * RADIUS;
      } else {
        const left = p.x - (o.x - o.w / 2);
        const right = o.x + o.w / 2 - p.x;
        const near = p.z - (o.z - o.d / 2);
        const far = o.z + o.d / 2 - p.z;
        const m = Math.min(left, right, near, far);
        if (m === left) { dx = -1; dz = 0; p.x = o.x - o.w / 2 - RADIUS; }
        else if (m === right) { dx = 1; dz = 0; p.x = o.x + o.w / 2 + RADIUS; }
        else if (m === near) { dx = 0; dz = -1; p.z = o.z - o.d / 2 - RADIUS; }
        else { dx = 0; dz = 1; p.z = o.z + o.d / 2 + RADIUS; }
      }
      impact(state, p, dx, dz, events);
    }
  }
}

function drive(state, p, input, dt, events) {
  const throttle = clamp(finite(input?.throttle), -1, 1);
  const steering = clamp(finite(input?.steer), -1, 1);
  const prevX = p.x, prevZ = p.z;
  p.collisionCooldown = Math.max(0, p.collisionCooldown - dt);
  p.rampCooldown = Math.max(0, p.rampCooldown - dt);
  p._gateCooldown = Math.max(0, p._gateCooldown - dt);
  p.turboTimer = Math.max(0, p.turboTimer - dt);
  p.steer += (steering - p.steer) * Math.min(1, dt * 12);
  const moving = Math.hypot(p.vx, p.vz);
  const wasDrifting = p.drifting;
  p.drifting = !!input?.drift && moving > 5.2 && Math.abs(p.steer) > 0.12 && p.y < 0.3;
  if (p.drifting) {
    p.driftTime += dt;
    p.totalDrift += dt;
    p.bestDrift = Math.max(p.bestDrift, p.driftTime);
    p.driftCharge = Math.min(1, p.driftCharge + dt * 0.46 * Math.abs(p.steer));
  } else if (wasDrifting) {
    if (p.driftCharge > 0.23) {
      const charge = p.driftCharge;
      p.turboTimer = 0.35 + charge * 0.85;
      p.boostEnergy = Math.min(100, p.boostEnergy + charge * 25);
      emit(events, 'drift', p, { value: Math.round(p.driftTime * 100), duration: p.driftTime, charge });
    }
    p.driftTime = 0;
    p.driftCharge = 0;
  }
  if (!input?.boost) p._boostExhausted = false;
  else if (p.boostEnergy <= 0.8) p._boostExhausted = true;
  const manualBoost = !!input?.boost && !p._boostExhausted && p.boostEnergy > 0.8 && throttle > 0;
  p.boosting = manualBoost || p.turboTimer > 0;
  p.boostEnergy = clamp(p.boostEnergy + (manualBoost ? -27 : p.drifting ? 14 : 5.5) * dt, 0, 100);

  const fx0 = Math.sin(p.angle), fz0 = -Math.cos(p.angle);
  const signedSpeed = p.vx * fx0 + p.vz * fz0;
  const steeringDirection = signedSpeed < -0.7 ? -1 : 1;
  const turnSpeed = (p.drifting ? 2.25 : 1.7) * (0.28 + Math.min(moving / 12, 1) * 0.72);
  p.angle = (p.angle + p.steer * turnSpeed * steeringDirection * dt) % TAU;
  const fx = Math.sin(p.angle), fz = -Math.cos(p.angle);
  const sideX = Math.cos(p.angle), sideZ = Math.sin(p.angle);
  let forward = p.vx * fx + p.vz * fz;
  const previousForward = forward;
  let lateral = p.vx * sideX + p.vz * sideZ;
  const airControl = p.y > 0.25 ? 0.4 : 1;
  lateral *= Math.exp(-(p.drifting ? 1.9 : 9.5) * dt * airControl);
  const accel = p.boosting ? 42 : 27;
  if (throttle < 0 && forward > 0) forward += throttle * 43 * dt;
  else forward += throttle * accel * dt * airControl;
  forward *= Math.exp(-(Math.abs(throttle) > 0.01 ? 0.38 : 1.15) * dt);
  const loadSlow = 1 - p.cargo / p.maxCargo * 0.10;
  const topSpeed = (p.boosting ? 33 : 23) * loadSlow;
  // Releasing turbo should ease back to cruising speed instead of applying an
  // invisible handbrake. External impulses get the same smooth speed decay.
  const speedCeiling = Math.max(topSpeed, previousForward * Math.exp(-0.7 * dt));
  forward = clamp(forward, -8, speedCeiling);
  p.vx = fx * forward + sideX * lateral;
  p.vz = fz * forward + sideZ * lateral;
  if (p.y < 0.3) {
    for (const c of CONVEYORS) {
      if (Math.abs(p.x - c.x) < c.w / 2 + 0.15 && Math.abs(p.z - c.z) < c.d / 2) {
        p.vz += c.direction * 13 * dt;
        p.boostEnergy = Math.min(100, p.boostEnergy + 10 * dt);
      }
    }
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  resolveScenery(state, p, events);

  if (p.y <= 0.01 && p.rampCooldown <= 0) {
    for (const r of RAMPS) {
      if (Math.abs(p.x - r.x) < r.w / 2 && Math.abs(p.z - r.z) < r.d / 2 && moving > 9) {
        const correctDirection = Math.sign(p.vz) === r.direction;
        p.vy = correctDirection ? 8.5 + moving * 0.055 : 5.7;
        p.y = 0.08;
        p.rampCooldown = 1.35;
        emit(events, 'jump', p, { value: moving });
        break;
      }
    }
  }
  if (p.y > 0 || p.vy > 0) {
    p.vy -= 20 * dt; p.y += p.vy * dt; p.airTime += dt;
    if (p.y <= 0) {
      p.y = 0; p.vy = 0;
      emit(events, 'land', p, { value: moving });
    }
  }
  p.speed = Math.hypot(p.vx, p.vz);
  p.distance += Math.hypot(p.x - prevX, p.z - prevZ);
}

function cartCollisions(state, carts, events) {
  for (let i = 0; i < carts.length; i++) {
    for (let j = i + 1; j < carts.length; j++) {
      const a = carts[i], b = carts[j];
      if (Math.abs(a.y - b.y) > 1.5) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= RADIUS * 2) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      const push = (RADIUS * 2 - distance + 0.01) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      const relative = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (relative > 0) {
        const impulse = relative * 0.68;
        a.vx -= nx * impulse; a.vz -= nz * impulse;
        b.vx += nx * impulse; b.vz += nz * impulse;
        spill(state, a, relative * 0.8, events);
        spill(state, b, relative * 0.8, events);
      }
      resolveScenery(state, a, events);
      resolveScenery(state, b, events);
    }
  }
}

function collectAndDeliver(state, carts, dt, events) {
  for (const bag of state.pickups) {
    bag.ownerGrace = Math.max(0, bag.ownerGrace - dt);
    if (bag.loose) {
      bag.expires -= dt;
      if (bag.expires <= 0) { bag.active = false; continue; }
    }
    if (!bag.active) {
      if (!bag.loose) {
        bag.respawn -= dt;
        if (bag.respawn <= 0) bag.active = true;
      }
      continue;
    }
    // The nearest eligible cart wins a contested pickup, without array-order bias.
    let winner = null, nearest = PICKUP_RADIUS ** 2;
    for (const p of carts) {
      if (p.cargo >= p.maxCargo || p.y > 3 || bag.ownerId === p.id && bag.ownerGrace > 0) continue;
      const d = dist2(p, bag);
      if (d < nearest) { nearest = d; winner = p; }
    }
    if (winner) {
      winner.cargo++; winner.pickups++;
      bag.active = false;
      bag.respawn = 11 + random(state) * 7;
      emit(events, 'pickup', winner, { amount: 1, cargo: winner.cargo, pickupId: bag.id });
    }
  }
  // Discard consumed loose bags. Normal bags keep a stable identity for rendering.
  state.pickups = state.pickups.filter(b => !b.loose || b.active && b.expires > 0);
  for (const p of carts) {
    const gate = GATES[p.targetGate];
    if (!p.cargo || p._gateCooldown > 0 || p.y > 2.8 || dist2(p, gate) > 36) continue;
    const count = p.cargo;
    const loadBonus = count === p.maxCargo ? 1.6 : count >= 5 ? 1.25 : 1;
    const value = Math.round(count * 100 * loadBonus * (1 + (p.combo - 1) * 0.2));
    p.score += value; p.delivered += count; p.deliveries++;
    p.cargo = 0;
    p.combo = Math.min(5, p.combo + 1);
    p.boostEnergy = Math.min(100, p.boostEnergy + 35);
    p._gateCooldown = 1;
    const previousGate = p.targetGate;
    // Alternating terminal ends makes route planning worthwhile; north/south
    // neighbours swap after each run to avoid the same loop every time.
    p.targetGate = (p.targetGate + (p.deliveries % 2 ? 2 : 1)) % GATES.length;
    p._pathTime = 0;
    emit(events, 'delivery', p, { value, amount: count, gate: previousGate, fullLoad: count === p.maxCargo, combo: p.combo });
  }
}

// A small occupancy grid is shared by the AI. Bots follow the same acceleration,
// grip and collisions as humans; paths merely select steering targets.
const CELL = 4;
const GRID_X = Math.floor((ARENA.halfX * 2 - 6) / CELL) + 1;
const GRID_Z = Math.floor((ARENA.halfZ * 2 - 6) / CELL) + 1;
const MIN_X = -ARENA.halfX + 3, MIN_Z = -ARENA.halfZ + 3;
const grid = Array.from({ length: GRID_X * GRID_Z }, (_, i) => {
  const x = MIN_X + i % GRID_X * CELL;
  const z = MIN_Z + Math.floor(i / GRID_X) * CELL;
  return { x, z, open: !blocked(x, z, RADIUS + 0.65) };
});

function nearestNode(point) {
  let winner = 0, best = Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i].open) continue;
    const d = dist2(point, grid[i]);
    if (d < best) { best = d; winner = i; }
  }
  return winner;
}

function clearLine(a, b) {
  const distance = Math.sqrt(dist2(a, b));
  const steps = Math.ceil(distance / 1.4);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, RADIUS + 0.5)) return false;
  }
  return true;
}

function findPath(from, to) {
  if (clearLine(from, to)) return [{ x: to.x, z: to.z }];
  const start = nearestNode(from), goal = nearestNode(to);
  const frontier = [start], open = new Set(frontier), closed = new Set();
  const costs = new Float64Array(grid.length).fill(Infinity);
  const total = new Float64Array(grid.length).fill(Infinity);
  const parent = new Int32Array(grid.length).fill(-1);
  costs[start] = 0; total[start] = Math.sqrt(dist2(grid[start], grid[goal]));
  while (frontier.length) {
    let bestI = 0;
    for (let i = 1; i < frontier.length; i++) if (total[frontier[i]] < total[frontier[bestI]]) bestI = i;
    const current = frontier.splice(bestI, 1)[0];
    open.delete(current);
    if (current === goal) {
      const result = [];
      for (let k = goal; k !== start && k !== -1; k = parent[k]) result.unshift({ x: grid[k].x, z: grid[k].z });
      result.push({ x: to.x, z: to.z });
      // Remove collinear / redundant intermediate nodes without cutting corners.
      const smooth = []; let anchor = from;
      for (let i = 0; i < result.length; i++) {
        let j = i;
        while (j + 1 < result.length && clearLine(anchor, result[j + 1])) j++;
        smooth.push(result[j]); anchor = result[j]; i = j;
      }
      return smooth;
    }
    closed.add(current);
    const cx = current % GRID_X, cz = Math.floor(current / GRID_X);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= GRID_X || nz < 0 || nz >= GRID_Z) continue;
      const next = nx + nz * GRID_X;
      if (!grid[next].open || closed.has(next)) continue;
      if (dx && dz && (!grid[cx + dx + cz * GRID_X].open || !grid[cx + (cz + dz) * GRID_X].open)) continue;
      const cost = costs[current] + (dx && dz ? 5.657 : 4);
      if (cost >= costs[next]) continue;
      costs[next] = cost; parent[next] = current;
      total[next] = cost + Math.sqrt(dist2(grid[next], grid[goal]));
      if (!open.has(next)) { frontier.push(next); open.add(next); }
    }
  }
  return [{ x: to.x, z: to.z }];
}

function botInput(state, p, dt) {
  p._pathTime -= dt;
  if (p._reverse > 0) {
    p._reverse -= dt;
    return { throttle: -0.8, steer: p.id === 'b1' ? 1 : -1 };
  }
  p._stuck = p.speed < 1.5 ? p._stuck + dt : Math.max(0, p._stuck - dt * 2);
  if (p._stuck > 1.5) {
    p._stuck = 0; p._reverse = 0.75; p._pathTime = 0;
    return { throttle: -1, steer: 1 };
  }
  if (p._pathTime <= 0 || !p._path.length) {
    let target = GATES[p.targetGate];
    const deliverNow = p.cargo >= (state.difficulty === 'hard' ? 6 : 5) || state.timeLeft < 12 && p.cargo > 0;
    if (!deliverNow) {
      let best = Infinity;
      for (const bag of state.pickups) {
        if (!bag.active || bag.ownerGrace > 0 && bag.ownerId === p.id) continue;
        const cost = Math.sqrt(dist2(p, bag)) + (clearLine(p, bag) ? 0 : 15);
        if (cost < best) { best = cost; target = bag; }
      }
    }
    p._target = { x: target.x, z: target.z };
    p._path = findPath(p, target);
    p._pathTime = 0.7 + (p.id === 'b1' ? 0 : 0.15);
  }
  while (p._path.length > 1 && dist2(p, p._path[0]) < 12) p._path.shift();
  const target = p._path[0] || p._target || GATES[p.targetGate];
  const dx = target.x - p.x, dz = target.z - p.z;
  const desired = Math.atan2(dx, -dz);
  const turn = angleDelta(desired, p.angle);
  const steer = clamp(turn * 1.8, -1, 1);
  const desiredSpeed = Math.abs(turn) > 1 ? 6 : Math.abs(turn) > 0.5 ? 12 : state.difficulty === 'hard' ? 22 : 18;
  const throttle = p.speed > desiredSpeed + 2 ? -0.4 : 0.9;
  return { throttle, steer, drift: false, boost: state.difficulty === 'hard' && Math.abs(turn) < 0.12 && p.speed > 16 && Math.hypot(dx, dz) > 17 };
}

function tick(state, inputs, dt, events) {
  const remaining = Math.max(0, state.duration - state.elapsed);
  dt = Math.min(dt, remaining);
  if (dt <= 0) return;
  const carts = [...state.players, ...state.bots];
  state.players.forEach((p, i) => drive(state, p, inputs[i] || {}, dt, events));
  state.bots.forEach(p => drive(state, p, botInput(state, p, dt), dt, events));
  cartCollisions(state, carts, events);
  collectAndDeliver(state, carts, dt, events);
  state.elapsed += dt;
  state.timeLeft = Math.max(0, state.duration - state.elapsed);
  if (state.timeLeft < 1e-8) {
    state.timeLeft = 0; state.elapsed = state.duration; state.finished = true;
    events.push({ type: 'finish', playerId: null, x: 0, z: 0 });
  }
}

export function stepGame(state, inputs = [], dt = DT) {
  const events = [];
  if (!state || state.finished || !Number.isFinite(dt) || dt <= 0) return events;
  const validInputs = Array.isArray(inputs) ? inputs : [];
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-9 && !state.finished) {
    const step = Math.min(DT, remaining);
    tick(state, validInputs, step, events);
    remaining -= step;
  }
  return events;
}
