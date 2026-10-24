/* OVERTIME bots. Decisions use only the public physical state: no forced touches,
   ball steering, score scripts, teleportation, or difficulty speed multipliers. */
const FIELD = { x: 41, z: 57, roof: 25, radius: 1.8, goal: 9 };
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const LEVELS = Object.freeze({
  rookie: { reaction: 0.24, horizon: 1.15, aim: 3.5, lead: 0.65, boostAngle: 0.16, jump: 0.3, aerial: false },
  pro: { reaction: 0.115, horizon: 1.9, aim: 1.15, lead: 0.87, boostAngle: 0.24, jump: 0.85, aerial: false },
  allstar: { reaction: 0.055, horizon: 2.6, aim: 0.25, lead: 1, boostAngle: 0.31, jump: 1, aerial: true },
});

function basis(q) {
  const { x, y, z, w } = q;
  return {
    fx: -2 * (x * z + w * y), fy: -2 * (y * z - w * x), fz: -(1 - 2 * (x * x + y * y)),
    rx: 1 - 2 * (y * y + z * z), ry: 2 * (x * y + w * z), rz: 2 * (x * z - w * y),
    ux: 2 * (x * y - w * z), uy: 1 - 2 * (x * x + z * z), uz: 2 * (y * z + w * x),
  };
}

function point(x, z, y = 1) { return { x, y, z }; }

/** Cheap trajectory estimate used for perception; the Rapier world remains authoritative. */
export function predictBall(ball, seconds, out = []) {
  out.length = 0;
  let { x, y, z } = ball.position;
  let vx = ball.velocity.x, vy = ball.velocity.y, vz = ball.velocity.z;
  const step = 0.08;
  out.push({ x, y, z, t: 0, vx, vy, vz });
  for (let t = step; t <= seconds + step * 0.5; t += step) {
    vy -= 19.6 * step;
    x += vx * step; y += vy * step; z += vz * step;
    if (y < FIELD.radius) {
      y = FIELD.radius;
      vy = Math.abs(vy) > 2.1 ? -vy * 0.65 : 0;
      vx *= 0.985; vz *= 0.985;
    }
    if (y > FIELD.roof - FIELD.radius) { y = FIELD.roof - FIELD.radius; vy = -Math.abs(vy) * 0.68; }
    if (Math.abs(x) > FIELD.x - FIELD.radius) {
      x = Math.sign(x) * (FIELD.x - FIELD.radius); vx = -vx * 0.7;
    }
    if (Math.abs(z) > FIELD.z - FIELD.radius && (Math.abs(x) > 7.2 || y > 7.2)) {
      z = Math.sign(z) * (FIELD.z - FIELD.radius); vz = -vz * 0.7;
    }
    vx *= 0.998; vz *= 0.998;
    out.push({ x, y, z, t, vx, vy, vz });
  }
  return out;
}

export class BotManager {
  constructor(physics) {
    this.physics = physics;
    this.difficulty = 'pro';
    this.level = LEVELS.pro;
    this.memories = new Map();
    this.inputs = new Map();
    this.trajectory = [];
    this.clock = 0;
    this.roleTimer = 0;
    this.predictionTimer = 0;
    this.roles = new Map();
    this.round = 0;
  }

  setDifficulty(value) {
    this.difficulty = Object.hasOwn(LEVELS, value) ? value : 'pro';
    this.level = LEVELS[this.difficulty];
    this.roleTimer = 0;
    for (const memory of this.memories.values()) memory.nextDecision = 0;
  }

  reset() {
    this.round++;
    this.memories.clear();
    this.inputs.clear();
    this.roles.clear();
    this.trajectory.length = 0;
    this.clock = 0;
    this.roleTimer = 0;
    this.predictionTimer = 0;
  }

  memory(car) {
    let m = this.memories.get(car.id);
    if (!m) {
      m = {
        nextDecision: 0, target: point(0, 0), state: 'positioning', role: 'attack',
        aimX: 0, aimTimer: -100, commitUntil: 0, reverseUntil: 0, jumpStart: -100,
        jumpType: '', jumpCooldown: 0, noProgress: 0, progressClock: 0,
        lastPosition: { ...car.position }, seed: ((car.id + 3) * 1051983 ^ (this.round + 1) * 523777) >>> 0,
        aggressive: false, targetSpeed: 33, lastTouch: -1, output: {},
      };
      this.memories.set(car.id, m);
    }
    return m;
  }

  random(m) {
    let n = m.seed;
    n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
    m.seed = n >>> 0;
    return m.seed / 4294967296;
  }

  assignRoles() {
    const p = this.physics;
    for (let team = 0; team < 2; team++) {
      const sign = team === 0 ? -1 : 1;
      const roster = p.cars.filter(car => car.team === team);
      const scores = roster.map(car => {
        const dx = p.ball.position.x - car.position.x;
        const dz = p.ball.position.z - car.position.z;
        const b = basis(car.quaternion);
        const facing = (b.fx * dx + b.fz * dz) / Math.max(1, Math.hypot(dx, dz));
        const ahead = Math.max(0, (car.position.z - p.ball.position.z) * sign);
        const old = this.roles.get(car.id);
        return {
          car,
          score: Math.hypot(dx, dz) + ahead * 0.62 + (1 - facing) * 4
            + (!car.grounded && car.position.y > 3 ? 9 : 0)
            - (old === 'attack' ? 4.2 : 0),
        };
      }).sort((a, b) => a.score - b.score);
      for (let i = 0; i < scores.length; i++) this.roles.set(scores[i].car.id, i === 0 ? 'attack' : i === 1 ? 'support' : 'defend');
    }
  }

  /** `includePlayer` is for headless fairness/soak tests and spectator simulation. */
  update(dt, includePlayer = false) {
    this.clock += dt;
    this.roleTimer -= dt;
    this.predictionTimer -= dt;
    this.inputs.clear();
    if (!this.physics.ball || !this.physics.cars.length) return this.inputs;
    if (this.predictionTimer <= 0) {
      predictBall(this.physics.ball, this.level.horizon, this.trajectory);
      this.predictionTimer = 0.08;
    }
    if (this.roleTimer <= 0) { this.assignRoles(); this.roleTimer = 0.23; }
    for (const car of this.physics.cars) {
      if ((car.isPlayer || car.human || car.proxy) && !includePlayer) continue;
      const m = this.memory(car);
      if (this.clock >= m.nextDecision) {
        this.decide(car, m);
        m.nextDecision = this.clock + this.level.reaction * (0.88 + this.random(m) * 0.24);
      }
      this.drive(car, m, dt);
      this.inputs.set(car.id, m.output);
      // A useful spectator/debug label. It never changes physical parameters.
      car.aiState = m.state;
    }
    return this.inputs;
  }

  intercept(car) {
    let choice = this.trajectory[0];
    const speed = Math.hypot(car.velocity.x, car.velocity.z);
    const b = basis(car.quaternion);
    for (const sample of this.trajectory) {
      if (sample.y > (this.level.aerial ? 9 : 4.8)) continue;
      const dx = sample.x - car.position.x, dz = sample.z - car.position.z;
      const dist = Math.hypot(dx, dz);
      const alignment = (b.fx * dx + b.fz * dz) / Math.max(dist, 1);
      const turnTime = Math.acos(clamp(alignment, -1, 1)) / 2.4;
      const travelTime = Math.max(0, sample.t - turnTime * 0.65);
      const reachable = speed * travelTime + 12.5 * travelTime * travelTime + 5.5;
      choice = sample;
      if (dist <= reachable && sample.t > 0.08) break;
    }
    const now = this.physics.ball.position;
    return {
      x: now.x + (choice.x - now.x) * this.level.lead,
      y: choice.y,
      z: now.z + (choice.z - now.z) * this.level.lead,
      t: choice.t,
    };
  }

  decide(car, m) {
    const ball = this.physics.ball;
    const sign = car.team === 0 ? -1 : 1;
    const ownZ = -sign * 51;
    const ballDistance = distance(car.position, ball.position);
    const danger = ball.position.z * sign < -29 && (ball.velocity.z * sign < -2 || ball.position.z * sign < -43);
    m.role = this.roles.get(car.id) || 'attack';
    m.aggressive = false;
    m.targetSpeed = 33;

    if (this.clock - m.aimTimer > 2.1) {
      const opponents = this.physics.cars.filter(c => c.team !== car.team && c.position.z * sign > 20);
      const keeper = opponents.sort((a, b) => Math.abs(a.position.z - sign * 51) - Math.abs(b.position.z - sign * 51))[0];
      m.aimX = keeper ? -Math.sign(keeper.position.x || 1) * 5 : 0;
      m.aimX += (this.random(m) - 0.5) * 2 * this.level.aim;
      m.aimX = clamp(m.aimX, -5.9, 5.9);
      m.aimTimer = this.clock;
    }

    const b = basis(car.quaternion);
    if (car.position.y > 4.5 && (Math.abs(car.position.x) > 32 || Math.abs(car.position.z) > 48)) {
      m.state = 'recovering';
      m.target = point(car.position.x * 0.25, car.position.z * 0.3);
      m.targetSpeed = 20;
      return;
    }
    if (b.uy < 0.35) {
      m.state = 'recovering';
      m.target = point(ball.position.x, ball.position.z);
      if (car.position.y < 2.2 && this.clock > m.jumpCooldown) this.startJump(m, 'recover');
      return;
    }

    if (m.role === 'attack' || (danger && ballDistance < 12)) {
      const intercept = this.intercept(car);
      // Point through the centre of the opponent's opening. In front of our own
      // net, wide clearances reduce the chance of a touch straight across goal.
      let goalX = m.aimX, goalZ = sign * 61;
      if (danger && Math.abs(ball.position.x) < 12 && ballDistance < 17) {
        goalX = Math.sign(ball.position.x || car.position.x || 1) * 25;
        goalZ = ball.position.z + sign * 38;
      }
      let sx = goalX - intercept.x, sz = goalZ - intercept.z;
      const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl;
      const cx = car.position.x - intercept.x, cz = car.position.z - intercept.z;
      const behind = -(cx * sx + cz * sz);
      const side = Math.abs(cx * sz - cz * sx);
      const attackingFromBehind = behind > 1 && side < Math.max(3.9, behind * 0.56);
      const touchChanged = this.physics.lastTouch != null && this.physics.lastTouch !== m.lastTouch;
      if (touchChanged) { m.commitUntil = 0; m.lastTouch = this.physics.lastTouch; }
      if (attackingFromBehind && ballDistance < 26) m.commitUntil = this.clock + 0.65;
      const commit = this.clock < m.commitUntil;
      if (commit) {
        m.target = point(intercept.x + sx * 3.8, intercept.z + sz * 3.8, intercept.y);
        m.state = danger ? 'clearing' : ballDistance < 12 ? 'shooting' : 'intercepting';
        m.aggressive = true;
      } else {
        const stagingDistance = clamp(ballDistance * 0.27, 5.5, 11);
        m.target = point(intercept.x - sx * stagingDistance, intercept.z - sz * stagingDistance, intercept.y);
        m.state = danger ? 'defending' : 'positioning';
        const arrival = distance(car.position, m.target);
        m.targetSpeed = clamp(arrival * 2.2, 9, 33);
        if (arrival < 4.6 && behind > 1.5) m.commitUntil = this.clock + 0.8;
      }
      // A car on the wrong side goes around the ball instead of punching an own
      // goal. The lateral route is stable until the staging point is reached.
      if (!commit && behind < 0.5 && ballDistance < 15) {
        const lateral = Math.sign(cx * sz - cz * sx || (car.id % 2 ? 1 : -1));
        m.target.x += sz * lateral * 6.5;
        m.target.z -= sx * lateral * 6.5;
        m.state = 'rotating';
      }
    } else if (m.role === 'defend' || danger) {
      const goalSample = this.trajectory.find(p => p.z * sign < -45);
      const anticipatedX = goalSample ? goalSample.x : ball.position.x + ball.velocity.x * 0.35;
      m.target = point(clamp(anticipatedX * 0.65, -7.2, 7.2), ownZ + sign * (danger ? 1.5 : 8));
      m.state = 'defending';
      m.targetSpeed = clamp(distance(car.position, m.target) * 2.5, 0, 33);
      if (distance(car.position, m.target) < 3) m.targetSpeed = 0;
    } else {
      const supportZ = ball.position.z - sign * 18;
      const side = Math.sign(ball.position.x || (car.id % 2 ? 1 : -1));
      m.target = point(clamp(-side * 13 + ball.position.x * 0.35, -27, 27), clamp(supportZ, -43, 43));
      m.state = 'supporting';
      m.targetSpeed = clamp(distance(car.position, m.target) * 2.4, 0, 33);
    }

    // Boost is a tactical detour, only when we can leave the immediate play.
    if (car.boost < 24 && ballDistance > 20 && !danger && !m.aggressive) {
      const desired = m.target;
      let best = null, bestScore = Infinity;
      for (const pad of this.physics.pads || []) {
        if (!pad.active) continue;
        const d = distance(car.position, pad.position);
        const detour = d + distance(pad.position, desired) - distance(car.position, desired);
        if (d > 25 || detour > (pad.large ? 12 : 4.5)) continue;
        const score = detour + d * 0.3 - (pad.large ? 7 : 0);
        if (score < bestScore) { best = pad; bestScore = score; }
      }
      if (best) { m.target = { ...best.position }; m.state = 'collecting boost'; m.targetSpeed = 33; }
    }

    m.target.x = clamp(m.target.x, -35.3, 35.3);
    // Permit a shot to follow the ball into a goal, but do not choose a waypoint
    // behind the solid end boards.
    const maxZ = Math.abs(m.target.x) < 6.6 && m.aggressive ? 61 : 51.8;
    m.target.z = clamp(m.target.z, -maxZ, maxZ);
  }

  startJump(m, type) {
    m.jumpStart = this.clock;
    m.jumpType = type;
    m.jumpCooldown = this.clock + (type === 'aerial' ? 2.9 : 1.7);
  }

  drive(car, m, dt) {
    const out = m.output;
    out.throttle = 0; out.steer = 0; out.boost = false; out.jump = false;
    out.powerslide = false; out.pitch = 0; out.yaw = 0; out.roll = 0;
    const b = basis(car.quaternion);
    const speed = Math.hypot(car.velocity.x, car.velocity.z);
    const dx = m.target.x - car.position.x, dz = m.target.z - car.position.z;
    const dist = Math.hypot(dx, dz);
    let angle = Math.atan2(dx * b.rx + dz * b.rz, dx * b.fx + dz * b.fz);
    const forwardSpeed = car.velocity.x * b.fx + car.velocity.z * b.fz;
    const cornerSpeed = 7 + 26 * Math.pow(Math.max(0, Math.cos(angle)), 2);
    const wantedSpeed = Math.min(m.targetSpeed, cornerSpeed);
    out.steer = clamp(angle * (2.05 + speed * 0.012) + (car.angularVelocity?.y || 0) * 0.17, -1, 1);
    out.yaw = out.steer;
    out.throttle = wantedSpeed < 1.5 ? (speed > 1 ? -Math.sign(forwardSpeed) : 0) : forwardSpeed > wantedSpeed + 3 ? -0.7 : 1;
    out.powerslide = Math.abs(angle) > 1.12 && speed > 7;
    if (Math.abs(angle) > 2.15 && speed > 10) out.throttle = -0.8;
    out.boost = Math.abs(angle) < this.level.boostAngle && dist > 13 && speed > 5
      && car.boost > (m.aggressive ? 3 : 25) && wantedSpeed > 27
      && (m.aggressive || dist > 29) && m.state !== 'collecting boost';

    // Separate cars on their rotation paths; strikers retain their line for the
    // final few metres of a challenge.
    if (!m.aggressive || distance(car.position, this.physics.ball.position) > 13) {
      for (const other of this.physics.cars) {
        if (other.id === car.id) continue;
        const ox = other.position.x - car.position.x, oz = other.position.z - car.position.z;
        const front = ox * b.fx + oz * b.fz;
        const side = ox * b.rx + oz * b.rz;
        if (front > 1.5 && front < 6.5 && Math.abs(side) < 2.6) {
          out.steer = clamp(out.steer - Math.sign(side || (car.id % 2 ? 1 : -1)) * 0.65, -1, 1);
          out.boost = false;
        }
      }
    }

    // Observe motion, then briefly reverse out of pinches. No resets are used.
    m.progressClock += dt;
    if (m.progressClock >= 0.75) {
      const moved = distance(car.position, m.lastPosition);
      if (moved < 1.35 && dist > 5 && m.targetSpeed > 8 && car.position.y < 2.4) m.noProgress += m.progressClock;
      else m.noProgress = 0;
      Object.assign(m.lastPosition, car.position);
      m.progressClock = 0;
      if (m.noProgress > 1.2 && this.clock > m.reverseUntil + 0.8) {
        m.reverseUntil = this.clock + 0.65;
        m.noProgress = 0;
      }
    }
    if (this.clock < m.reverseUntil) {
      out.throttle = -1; out.steer = -Math.sign(angle || 1); out.boost = false; out.powerslide = false;
      m.state = 'recovering';
    }

    const ball = this.physics.ball;
    const ballDx = ball.position.x - car.position.x, ballDz = ball.position.z - car.position.z;
    const ballDist = Math.hypot(ballDx, ballDz);
    const ballForward = ballDx * b.fx + ballDz * b.fz;
    const ballAngle = Math.atan2(ballDx * b.rx + ballDz * b.rz, ballForward);
    if (car.grounded && this.clock > m.jumpCooldown && m.aggressive && Math.abs(ballAngle) < 0.3 && b.uy > 0.8) {
      const elevated = ball.position.y > 3.2 && ball.position.y < 6 && ballDist < 10 && ballDist > 3;
      const powerShot = ball.position.y < 3.4 && ballDist < 7.1 && ballDist > 4.3 && speed > 12;
      const aerial = this.level.aerial && ball.position.y > 6 && ball.position.y < 12
        && ballDist < 15 && ballDist > 6 && car.boost > 30;
      // Rookie's occasional failed commitment is a decision imperfection. Car
      // acceleration, collision strength, and jump mechanics are unchanged.
      if ((elevated || powerShot || aerial) && this.random(m) < this.level.jump) this.startJump(m, aerial ? 'aerial' : elevated ? 'jump' : 'flip');
    }

    if (!car.grounded) {
      const age = this.clock - m.jumpStart;
      out.boost = false;
      const aerialTarget = m.jumpType === 'aerial' && age < 0.9;
      const elevation = aerialTarget ? clamp(Math.atan2(ball.position.y - car.position.y, Math.max(ballDist, 1)), 0, 1.15) : 0;
      const pitchAngle = Math.asin(clamp(b.fy, -1, 1));
      out.pitch = clamp((pitchAngle - elevation) * 2.5, -1, 1);
      out.yaw = clamp(ballAngle * 1.2, -1, 1);
      out.roll = clamp(b.ry * 2.6, -1, 1);
      if (b.uy < 0 && Math.abs(b.ry) < 0.2) out.roll = 1;
      if (aerialTarget && Math.abs(pitchAngle - elevation) < 0.35 && Math.abs(ballAngle) < 0.4) out.boost = true;
      // Turn back toward the field after being carried up a wall.
      if (m.state === 'recovering') {
        out.yaw = clamp(angle * 1.4, -1, 1);
        out.throttle = 1;
      }
    }

    const jumpAge = this.clock - m.jumpStart;
    if (jumpAge >= 0 && jumpAge < 0.5) {
      if (m.jumpType === 'flip') {
        out.jump = jumpAge < 0.1 || (jumpAge >= 0.17 && jumpAge < 0.23);
        if (jumpAge >= 0.16 && jumpAge < 0.35) { out.pitch = 1; out.yaw = 0; out.roll = 0; }
      } else if (m.jumpType === 'recover') {
        out.jump = jumpAge < 0.1;
        out.roll = 1;
      } else {
        out.jump = jumpAge < 0.2;
      }
    }
  }
}
