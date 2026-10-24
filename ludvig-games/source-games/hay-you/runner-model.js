/* Sunset Sprint: deterministic, display-independent simulation. World units are metres. */
export const RUNNER = Object.freeze({ laneWidth: 3, laneDuration: .14, fixedStep: 1 / 120, jumpBuffer: .12, jumpVelocity: 8.7, gravity: 23, logHeight: .69, playerHalfWidth: .38, playerHalfDepth: .75, logHalfWidth: 1.04, logHalfDepth: .29 });
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function seededRandom(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const distanceAt = t => 12 * t + .075 * t * t;

export function createRunnerModel({ seed = 'sunset', duration = 30, countdown = 3 } = {}) {
  const random = seededRandom(seed), events = [], objects = [];
  let targetLane = 0, laneFrom = 0, laneTime = RUNNER.laneDuration, jumpBuffer = 0, invincible = 0;
  let fraction = 0, previousPhase = 'running', messageLife = 0, bestCombo = 0;
  const state = { phase: countdown > 0 ? 'countdown' : 'running', countdown: Math.max(0, countdown), elapsed: 0, remaining: duration, duration, progress: 0, distance: 0, speed: 12, lane: 0, x: 0, y: 0, vy: 0, airborne: false, hearts: 0, hits: 0, combo: 0, bestCombo: 0, score: 0, message: 'Follow the hearts. Find your rhythm.', pauseReason: '', nearObstacle: false };
  let routeLane = 0, row = 0;
  for (let t = 1.6; t < duration - .65; t += 1.55) {
    if (row > 1) {
      const choices = [-1, 0, 1].filter(n => n !== routeLane);
      routeLane = choices[Math.floor(random() * choices.length)];
    }
    for (let j = -1; j <= 1; j++) {
      const time = t + j * .18;
      objects.push({ id: `h${row}-${j + 1}`, type: 'heart', lane: routeLane, x: routeLane * RUNNER.laneWidth, distance: distanceAt(time), time, collected: false, hit: false, passed: false });
    }
    if (t >= 6 && t < duration - 1) {
      // Exactly one log per row leaves two clear lanes. Some hearts reward a well-timed jump.
      const lane = row % 3 === 0 ? routeLane : [-1, 0, 1].filter(n => n !== routeLane)[Math.floor(random() * 2)];
      const time = t - .14;
      objects.push({ id: `l${row}`, type: 'log', lane, x: lane * RUNNER.laneWidth, distance: distanceAt(time), time, collected: false, hit: false, passed: false });
    }
    row++;
  }
  objects.sort((a, b) => a.distance - b.distance);
  const totalHearts = objects.filter(o => o.type === 'heart').length;
  function say(message, life = 1.2) { state.message = message; messageLife = life; }
  function move(direction) {
    if (!['countdown', 'running'].includes(state.phase)) return false;
    const delta = direction === 'left' ? -1 : direction === 'right' ? 1 : Math.sign(Number(direction));
    if (!Number.isFinite(delta) || !delta) return false;
    const next = clamp(targetLane + delta, -1, 1);
    if (next === targetLane) return false;
    targetLane = next; state.lane = next; laneFrom = state.x; laneTime = 0;
    events.push({ type: 'move', lane: next });
    return true;
  }
  function jump() {
    if (state.phase !== 'running') return false;
    jumpBuffer = RUNNER.jumpBuffer;
    return true;
  }
  function updateScore() { state.score = state.hearts * 20 + bestCombo * 5 + Math.max(0, Math.floor((state.elapsed + 1e-8) / 5) - state.hits) * 10; }
  function tick(dt) {
    if (laneTime < RUNNER.laneDuration && (state.phase === 'countdown' || state.phase === 'running')) {
      laneTime = Math.min(RUNNER.laneDuration, laneTime + dt);
      const p = laneTime / RUNNER.laneDuration, smooth = p * p * (3 - 2 * p);
      state.x = laneFrom + (targetLane * RUNNER.laneWidth - laneFrom) * smooth;
    }
    if (state.phase === 'countdown') {
      state.countdown = Math.max(0, state.countdown - dt);
      if (state.countdown < 1e-7) { state.countdown = 0; state.phase = 'running'; events.push({ type: 'start' }); say('Two horses. One sunset. Let’s go!', 2.5); }
      return;
    }
    if (state.phase !== 'running') return;
    state.elapsed = Math.min(duration, state.elapsed + dt); state.remaining = Math.max(0, duration - state.elapsed); state.progress = state.elapsed / duration;
    const oldDistance = state.distance;
    state.distance = distanceAt(state.elapsed); state.speed = 12 + .15 * state.elapsed;
    if (jumpBuffer > 0 && !state.airborne) {
      state.vy = RUNNER.jumpVelocity; state.airborne = true; jumpBuffer = 0; events.push({ type: 'jump' });
    }
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (state.airborne) {
      state.y += state.vy * dt - .5 * RUNNER.gravity * dt * dt; state.vy -= RUNNER.gravity * dt;
      if (state.y <= 0) { state.y = 0; state.vy = 0; state.airborne = false; events.push({ type: 'land' }); }
    }
    invincible = Math.max(0, invincible - dt);
    if (messageLife > 0) { messageLife -= dt; if (messageLife <= 0) state.message = ''; }
    state.nearObstacle = false;
    for (const object of objects) {
      const gap = object.distance - state.distance, before = object.distance - oldDistance;
      if (object.passed) continue;
      if (gap > 18 && before > 18) break;
      const lateral = Math.abs(state.x - object.x);
      if (object.type === 'heart') {
        // Hearts float above the hoof path and can be collected both on the ground and mid-jump.
        if (!object.collected && gap < .92 && before > -.92 && lateral < .88) {
          object.collected = true; state.hearts++; state.combo++; bestCombo = Math.max(bestCombo, state.combo); state.bestCombo = bestCombo;
          events.push({ type: 'collect', id: object.id, x: object.x, y: 1.45, z: -gap, combo: state.combo });
          if (state.combo % 9 === 0) say('In step. In sync. Into each other.');
        }
        if (gap < -.95) { object.passed = true; if (!object.collected) state.combo = 0; }
      } else {
        if (gap > 0 && gap < 10 && lateral < RUNNER.logHalfWidth + RUNNER.playerHalfWidth) state.nearObstacle = true;
        // Test the entire contact interval, not one arbitrary screen-space crossing.
        const contact = RUNNER.playerHalfDepth + RUNNER.logHalfDepth;
        if (!object.hit && before > -contact && gap < contact && lateral < RUNNER.logHalfWidth + RUNNER.playerHalfWidth && state.y < RUNNER.logHeight && !invincible) {
          object.hit = true; state.hits++; state.combo = 0; invincible = .7;
          events.push({ type: 'hit', id: object.id }); say('A little stumble. Find your rhythm again.', 1.5);
        }
        if (gap < -contact) object.passed = true;
      }
    }
    updateScore();
    if (state.elapsed >= duration - 1e-7) { state.elapsed = duration; state.progress = 1; state.remaining = 0; state.phase = 'complete'; events.push({ type: 'complete', result: result() }); }
  }
  function step(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || state.phase === 'paused' || state.phase === 'complete') return state;
    fraction += Math.min(.25, dt);
    while (fraction + 1e-10 >= RUNNER.fixedStep) { tick(RUNNER.fixedStep); fraction -= RUNNER.fixedStep; }
    return state;
  }
  function pause(reason = 'manual') { if (state.phase === 'paused' || state.phase === 'complete') return; previousPhase = state.phase; state.phase = 'paused'; state.pauseReason = reason; fraction = 0; jumpBuffer = 0; }
  function resume() { if (state.phase === 'paused') { state.phase = previousPhase; state.pauseReason = ''; fraction = 0; } }
  function result() {
    const rate = totalHearts ? state.hearts / totalHearts : 0;
    return { score: state.score, hearts: state.hearts, hits: state.hits, combo: bestCombo, chemistry: Math.round(clamp(20 + rate * 73 + Math.min(bestCombo, 18) * .4 - state.hits * 8, 5, 100)), totalHearts, duration };
  }
  return { state, objects, step, move, jump, pause, resume, result, drainEvents: () => events.splice(0) };
}
