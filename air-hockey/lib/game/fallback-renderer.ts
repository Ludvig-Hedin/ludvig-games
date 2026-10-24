import { TABLE, type GameEvent, type GameState, type Side, type Vec2 } from './types';

type Point = { x: number; y: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const BLUE = '#5289ff';
const CORAL = '#f18168';
const DISTANCE = 32;
const COS = 0.91;
const SIN = Math.sqrt(1 - COS * COS);

/** A GPU-independent perspective renderer. The authoritative simulation is unchanged. */
export class FallbackArenaRenderer {
  readonly compatibility = true;
  readonly canvas = document.createElement('canvas');
  private readonly background = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private scale = 1;
  private cx = 0;
  private cy = 0;
  private side: Side = 0;
  private disposed = false;
  private reducedMotion = false;
  private quality: 'high' | 'low' = 'high';
  private trail: Array<{ x: number; y: number; life: number }> = [];
  private sparks: Spark[] = [];
  private pulses: [number, number] = [0, 0];
  private time = 0;

  constructor(private readonly container: HTMLElement) {
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser cannot create a canvas rendering context.');
    this.ctx = ctx;
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private project(x: number, z: number, elevation = 0.035): Point {
    const sign = this.side === 0 ? 1 : -1;
    x *= sign;
    z *= sign;
    const perspective = DISTANCE / (DISTANCE - z * SIN - elevation * COS);
    return {
      x: this.cx + x * this.scale * perspective,
      y: this.cy + (z * COS - elevation * SIN) * this.scale * perspective,
    };
  }

  screenToWorld(clientX: number, clientY: number): Vec2 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const u = (clientX - rect.left - this.cx) / this.scale;
    const v = (clientY - rect.top - this.cy) / this.scale;
    const elevation = 0.035;
    const z = (v * (DISTANCE - elevation * COS) + elevation * SIN * DISTANCE) / (COS * DISTANCE + v * SIN);
    const x = u * (DISTANCE - z * SIN - elevation * COS) / DISTANCE;
    const sign = this.side === 0 ? 1 : -1;
    return { x: x * sign, y: z * sign };
  }

  setView(side: Side, _overview = false): void {
    if (side === this.side) return;
    this.side = side;
    this.resize();
  }

  setQuality(quality: 'high' | 'low'): void {
    this.quality = quality;
    this.resize();
  }

  resize(): void {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.8 : 1);
    this.canvas.width = this.background.width = Math.round(this.width * this.dpr);
    this.canvas.height = this.background.height = Math.round(this.height * this.dpr);
    this.scale = Math.min((this.width - 22) / 10.6, (this.height - 28) / 15.4);
    this.scale = Math.max(1, this.scale);
    this.cx = this.width / 2;
    this.cy = this.height / 2 - this.scale * 0.62;
    this.paintBackground();
  }

  private roundedPoints(x: number, z: number, w: number, d: number, radius: number): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    const r = Math.min(radius, w / 2, d / 2);
    const centers = [[x + w - r, z + r], [x + w - r, z + d - r], [x + r, z + d - r], [x + r, z + r]];
    centers.forEach(([cx, cz], corner) => {
      for (let i = 0; i <= 8; i++) {
        const angle = -Math.PI / 2 + corner * Math.PI / 2 + i * Math.PI / 16;
        points.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
      }
    });
    return points;
  }

  private polygon(ctx: CanvasRenderingContext2D, points: Point[]): void {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
  }

  private plate(ctx: CanvasRenderingContext2D, x: number, z: number, w: number, d: number, radius: number, elevation: number, fill: string | CanvasGradient): void {
    this.polygon(ctx, this.roundedPoints(x, z, w, d, radius).map(([px, pz]) => this.project(px, pz, elevation)));
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private prism(ctx: CanvasRenderingContext2D, x: number, z: number, w: number, d: number, radius: number, top: number, bottom: number, fill: string | CanvasGradient, side: string): void {
    const points = this.roundedPoints(x, z, w, d, radius);
    const faces = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
    faces.sort((a, b) => this.project(a.a[0], a.a[1]).y - this.project(b.a[0], b.a[1]).y);
    ctx.fillStyle = side;
    for (const { a, b } of faces) {
      this.polygon(ctx, [this.project(a[0], a[1], top), this.project(b[0], b[1], top), this.project(b[0], b[1], bottom), this.project(a[0], a[1], bottom)]);
      ctx.fill();
    }
    this.plate(ctx, x, z, w, d, radius, top, fill);
  }

  private worldLine(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, color: string, width: number, elevation = 0.041): void {
    ctx.beginPath();
    points.forEach(([x, z], i) => { const p = this.project(x, z, elevation); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, width * this.scale);
    ctx.stroke();
  }

  private worldCircle(ctx: CanvasRenderingContext2D, x: number, z: number, radius: number, elevation: number): void {
    const points = Array.from({ length: 65 }, (_, i) => this.project(x + Math.cos(i / 64 * Math.PI * 2) * radius, z + Math.sin(i / 64 * Math.PI * 2) * radius, elevation));
    this.polygon(ctx, points);
  }

  private paintBackground(): void {
    const ctx = this.background.getContext('2d')!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#10171d';
    ctx.fillRect(0, 0, this.width, this.height);
    const pool = ctx.createRadialGradient(this.cx - this.width * 0.1, this.cy, 0, this.cx, this.cy, Math.max(this.width, this.height) * 0.67);
    pool.addColorStop(0, '#253039'); pool.addColorStop(0.65, '#151e25'); pool.addColorStop(1, '#10171d');
    ctx.fillStyle = pool; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.globalAlpha = 0.3;
    for (let i = -3; i <= 3; i++) {
      this.worldLine(ctx, [[i * 8, -32], [i * 8, 32]], '#26323b', 0.018, -2.2);
      this.worldLine(ctx, [[-30, i * 8], [30, i * 8]], '#26323b', 0.018, -2.2);
    }
    ctx.restore();
    const shadow = this.project(0, 0.55, -1.7);
    ctx.save();
    ctx.translate(shadow.x, shadow.y);
    ctx.scale(1, 1.45);
    const cast = ctx.createRadialGradient(0, 0, this.scale * 2, 0, 0, this.scale * 7);
    cast.addColorStop(0, 'rgba(0,0,0,.65)'); cast.addColorStop(0.6, 'rgba(0,0,0,.28)'); cast.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cast; ctx.fillRect(-this.scale * 8, -this.scale * 8, this.scale * 16, this.scale * 16);
    ctx.restore();

    for (const z of [-5.7, 4.8]) for (const x of [-3.55, 2.75]) {
      this.prism(ctx, x - 0.1, z - 0.1, 1, 1.35, 0.14, -1.92, -2.08, '#303b44', '#080d12');
      this.prism(ctx, x, z, 0.8, 1.15, 0.08, -0.9, -2, '#202a34', '#101720');
    }
    const bodyFill = ctx.createLinearGradient(this.cx - this.scale * 5, 0, this.cx + this.scale * 5, 0);
    bodyFill.addColorStop(0, '#414b55'); bodyFill.addColorStop(0.28, '#26313b'); bodyFill.addColorStop(0.75, '#1d2731'); bodyFill.addColorStop(1, '#3e4b57');
    this.prism(ctx, -4.52, -7.53, 9.04, 15.06, 0.35, -0.12, -1.14, bodyFill, '#202b35');
    this.prism(ctx, -4.44, -7.45, 8.88, 14.9, 0.33, -1.05, -1.2, '#17222c', '#0a121b');
    this.prism(ctx, -4.57, -7.58, 9.14, 15.16, 0.34, -0.03, -0.19, '#73808a', '#46525e');
    this.prism(ctx, -4.59, -7.6, 9.18, 15.2, 0.34, 0.03, -0.05, '#26343e', '#111e29');

    const board = ctx.createLinearGradient(0, this.cy - this.scale * 7, this.scale * 7, this.cy + this.scale * 7);
    board.addColorStop(0, '#eef0ea'); board.addColorStop(0.45, '#e5e9e5'); board.addColorStop(1, '#dbe2df');
    this.plate(ctx, -4, -7, 8, 14, 0.08, 0.035, board);
    ctx.save();
    this.polygon(ctx, [[-4, -7], [4, -7], [4, 7], [-4, 7]].map(([x, z]) => this.project(x, z)));
    ctx.clip();
    ctx.fillStyle = 'rgba(63,86,96,.25)';
    for (let z = -6.91; z < 7; z += 0.18) for (let x = -3.91; x < 4; x += 0.18) {
      const p = this.project(x, z, 0.037);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, this.scale * 0.0065), 0, Math.PI * 2); ctx.fill();
    }
    this.worldLine(ctx, [[-4, 0], [4, 0]], '#91a5ad', 0.024);
    for (const r of [1.24, 1.33]) {
      this.worldCircle(ctx, 0, 0, r, 0.041);
      ctx.strokeStyle = r === 1.24 ? '#8da1ac' : 'rgba(117,143,154,.3)'; ctx.lineWidth = this.scale * (r === 1.24 ? 0.024 : 0.01); ctx.stroke();
    }
    this.worldCircle(ctx, 0, 0, 0.04, 0.041); ctx.fillStyle = '#859da9'; ctx.fill();
    for (const sign of [-1, 1]) {
      this.worldCircle(ctx, 0, sign * 7, 1.9, 0.041);
      ctx.fillStyle = sign > 0 ? 'rgba(77,123,184,.05)' : 'rgba(179,101,84,.05)'; ctx.fill();
      ctx.strokeStyle = sign > 0 ? '#9db2c4' : '#c0aaa0'; ctx.lineWidth = this.scale * 0.024; ctx.stroke();
      this.worldCircle(ctx, 0, sign * 3.45, 0.6, 0.041);
      ctx.strokeStyle = sign > 0 ? 'rgba(101,135,172,.35)' : 'rgba(179,116,98,.35)'; ctx.lineWidth = this.scale * 0.012; ctx.stroke();
      this.worldCircle(ctx, 0, sign * 3.45, 0.025, 0.041); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      const logo = this.project(0, sign * 5.9, 0.043);
      ctx.save(); ctx.translate(logo.x, logo.y); ctx.rotate((sign > 0 ? 0 : Math.PI) + (this.side ? Math.PI : 0)); ctx.scale(1, 0.88);
      ctx.fillStyle = '#9eafb4'; ctx.font = `700 ${Math.max(8, this.scale * 0.17)}px Arial,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('A I R   H O C K E Y', 0, 0); ctx.restore();
    }
    // A broad static softbox reflection suggests the lacquer without reducing contrast.
    const gloss = ctx.createLinearGradient(this.cx - this.scale * 4, this.cy - this.scale * 7, this.cx + this.scale * 2, this.cy + this.scale * 7);
    gloss.addColorStop(0, 'rgba(255,255,255,.00)'); gloss.addColorStop(0.3, 'rgba(255,255,255,.07)'); gloss.addColorStop(0.42, 'rgba(255,255,255,.13)'); gloss.addColorStop(0.6, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss; ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    for (const sign of [-1, 1]) {
      this.prism(ctx, sign === -1 ? -4.34 : 4, -7.2, 0.34, 14.4, 0.07, 0.29, 0.04, '#43525f', '#8a9da6');
      this.worldLine(ctx, [[sign * 4.17, -6.94], [sign * 4.17, 6.94]], '#8597a4', 0.022, 0.302);
      for (const end of [-1, 1]) {
        this.prism(ctx, end === -1 ? -4.02 : 1.5, sign === -1 ? -7.34 : 7, 2.52, 0.34, 0.055, 0.29, 0.04, '#43525f', '#8a9da6');
      }
      this.plate(ctx, -1.5, sign === -1 ? -7.55 : 7.0, 3, 0.55, 0.03, 0.04, '#040b12');
      this.prism(ctx, -1.54, sign === -1 ? -7.61 : 7.5, 3.08, 0.1, 0.02, 0.29, 0.04, '#344650', '#18242e');
      this.worldLine(ctx, [[-1.42, sign * 7.48], [1.42, sign * 7.48]], sign > 0 ? BLUE : CORAL, 0.036, 0.145);
      this.worldLine(ctx, [[-3.6, sign * 7.54], [3.6, sign * 7.54]], sign > 0 ? '#3e6bb9' : '#b16a59', 0.027, -0.48);
      for (let z = -6.6; z < 7; z += 2.2) {
        const p = this.project(sign * 4.42, z, 0.045);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, this.scale * 0.033, this.scale * 0.025, 0, 0, Math.PI * 2); ctx.fillStyle = '#91a0a9'; ctx.fill();
        ctx.strokeStyle = '#25313b'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(p.x - this.scale * 0.019, p.y); ctx.lineTo(p.x + this.scale * 0.019, p.y); ctx.stroke();
      }
    }
    const badge = this.project(0, this.side ? -7.54 : 7.54, -0.82);
    ctx.save(); ctx.translate(badge.x, badge.y); ctx.scale(1, 0.55); ctx.fillStyle = '#768995'; ctx.font = `600 ${Math.max(7, this.scale * 0.15)}px Arial,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('AIR HOCKEY', 0, 0); ctx.restore();
  }

  private cylinder(ctx: CanvasRenderingContext2D, x: number, z: number, radius: number, bottom: number, top: number, topFill: string | CanvasGradient, sideFill: string | CanvasGradient): void {
    const edge = Array.from({ length: 49 }, (_, i) => [x + Math.cos(i / 48 * Math.PI * 2) * radius, z + Math.sin(i / 48 * Math.PI * 2) * radius] as [number, number]);
    this.polygon(ctx, [...edge.map(([px, pz]) => this.project(px, pz, top)), ...edge.slice().reverse().map(([px, pz]) => this.project(px, pz, bottom))]);
    ctx.fillStyle = sideFill; ctx.fill();
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1];
      this.polygon(ctx, [this.project(a[0], a[1], top), this.project(b[0], b[1], top), this.project(b[0], b[1], bottom), this.project(a[0], a[1], bottom)]);
      ctx.fill();
    }
    this.worldCircle(ctx, x, z, radius, top); ctx.fillStyle = topFill; ctx.fill();
  }

  private drawMallet(ctx: CanvasRenderingContext2D, x: number, z: number, side: Side): void {
    const p = this.project(x, z, 0.12);
    const color = side ? CORAL : BLUE;
    const dark = side ? '#9d4b3d' : '#244d97';
    const shade = side ? '#cf725c' : '#3569bd';
    ctx.save();
    ctx.shadowColor = 'rgba(5,19,28,.28)'; ctx.shadowBlur = this.scale * 0.12; ctx.shadowOffsetX = this.scale * 0.045; ctx.shadowOffsetY = this.scale * 0.11;
    this.worldCircle(ctx, x, z, 0.53, 0.041); ctx.fillStyle = 'rgba(18,39,51,.25)'; ctx.fill();
    ctx.restore();
    this.cylinder(ctx, x, z, 0.52, 0.052, 0.105, '#142332', '#101c29');
    const lacquer = ctx.createRadialGradient(p.x - this.scale * 0.2, p.y - this.scale * 0.4, 0, p.x, p.y, this.scale * 0.7);
    lacquer.addColorStop(0, side ? '#ffb29a' : '#89b6ff'); lacquer.addColorStop(0.5, color); lacquer.addColorStop(1, shade);
    this.cylinder(ctx, x, z, 0.51, 0.09, 0.22, lacquer, shade);
    this.worldCircle(ctx, x, z, 0.468, 0.225); ctx.strokeStyle = side ? 'rgba(255,205,183,.52)' : 'rgba(184,215,255,.52)'; ctx.lineWidth = Math.max(0.6, this.scale * 0.012); ctx.stroke();
    this.cylinder(ctx, x, z, 0.31, 0.22, 0.32, lacquer, dark);
    const grip = ctx.createLinearGradient(p.x - this.scale * 0.28, 0, p.x + this.scale * 0.28, 0);
    grip.addColorStop(0, dark); grip.addColorStop(0.28, color); grip.addColorStop(0.65, shade); grip.addColorStop(1, dark);
    this.cylinder(ctx, x, z, 0.25, 0.29, 0.6, color, grip);
    for (let i = 0; i < 4; i++) {
      this.worldCircle(ctx, x, z, 0.252, 0.38 + i * 0.045); ctx.strokeStyle = side ? 'rgba(123,48,37,.24)' : 'rgba(16,49,97,.25)'; ctx.lineWidth = this.scale * 0.012; ctx.stroke();
    }
    this.cylinder(ctx, x, z, 0.282, 0.59, 0.66, lacquer, shade);
    this.worldCircle(ctx, x, z, 0.19, 0.667); ctx.fillStyle = shade; ctx.fill();
    this.worldCircle(ctx, x, z, 0.12, 0.67); ctx.strokeStyle = 'rgba(242,247,244,.7)'; ctx.lineWidth = Math.max(0.6, this.scale * 0.01); ctx.stroke();
  }

  effects(events: GameEvent[]): void {
    for (const event of events) {
      if (event.type === 'goal' || event.type === 'win') {
        const side = event.side ?? (event.y < 0 ? 0 : 1);
        this.pulses[side === 0 ? 1 : 0] = 1;
        this.trail.length = 0;
      }
      if (event.type === 'serve') this.trail.length = 0;
      if ((event.type === 'mallet' || event.type === 'wall') && event.speed > 3 && !this.reducedMotion) {
        const color = event.type === 'wall' ? '#c7aa7f' : event.side ? CORAL : BLUE;
        for (let i = 0; i < Math.min(5, 2 + event.speed / 8); i++) {
          const angle = Math.random() * Math.PI * 2;
          this.sparks.push({ x: event.x, y: event.y, vx: Math.cos(angle) * 2, vy: Math.sin(angle) * 2, life: 0.2 + Math.random() * 0.12, color });
        }
        if (this.sparks.length > 48) this.sparks.splice(0, this.sparks.length - 48);
      }
    }
  }

  update(state: GameState, dt: number, options: { idle?: boolean; reducedMotion?: boolean } = {}): void {
    if (this.disposed) return;
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    this.reducedMotion = !!options.reducedMotion;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const side of [0, 1] as const) {
      this.pulses[side] = Math.max(0, this.pulses[side] - dt * 1.4);
      if (this.pulses[side] <= 0) continue;
      ctx.save(); ctx.globalAlpha = this.pulses[side] * 0.8; ctx.shadowColor = side ? CORAL : BLUE; ctx.shadowBlur = this.scale * 0.5;
      this.worldLine(ctx, [[-1.43, side ? -7.48 : 7.48], [1.43, side ? -7.48 : 7.48]], side ? CORAL : BLUE, 0.055, 0.15); ctx.restore();
    }
    const speed = Math.hypot(state.puck.vx, state.puck.vy);
    if (this.trail[0] && Math.hypot(this.trail[0].x - state.puck.x, this.trail[0].y - state.puck.y) > 3) this.trail.length = 0;
    if (speed > 9 && state.phase === 'playing' && !this.reducedMotion) this.trail.unshift({ x: state.puck.x, y: state.puck.y, life: 0.14 });
    this.trail = this.trail.filter(p => (p.life -= dt) > 0).slice(0, 16);
    for (const point of this.trail) {
      this.worldCircle(ctx, point.x, point.y, TABLE.puckRadius * point.life / 0.17, 0.04);
      ctx.fillStyle = `rgba(119,88,60,${point.life * 0.6})`; ctx.fill();
    }
    if (state.phase === 'faceoff') {
      this.worldCircle(ctx, state.puck.x, state.puck.y, 0.4 + (this.reducedMotion ? 0 : Math.sin(this.time * 4) * 0.025), 0.042);
      ctx.strokeStyle = 'rgba(77,114,137,.38)'; ctx.lineWidth = this.scale * 0.018; ctx.stroke();
    }
    const objects = [{ kind: 'mallet', side: 0, body: state.mallets[0] }, { kind: 'mallet', side: 1, body: state.mallets[1] }, { kind: 'puck', side: 0, body: state.puck }];
    objects.sort((a, b) => this.project(a.body.x, a.body.y).y - this.project(b.body.x, b.body.y).y);
    for (const object of objects) {
      if (object.kind === 'mallet') { this.drawMallet(ctx, object.body.x, object.body.y, object.side as Side); continue; }
      if ((state.phase === 'goal' || state.phase === 'finished') && Math.abs(state.puck.y) > 7.3) continue;
      const { x, y } = state.puck;
      ctx.save(); ctx.shadowColor = 'rgba(0,13,22,.35)'; ctx.shadowBlur = this.scale * 0.08; ctx.shadowOffsetY = this.scale * 0.035;
      this.worldCircle(ctx, x, y, 0.25, 0.04); ctx.fillStyle = 'rgba(16,31,40,.3)'; ctx.fill(); ctx.restore();
      this.cylinder(ctx, x, y, TABLE.puckRadius, 0.047, 0.16, '#263844', '#0d1923');
      this.worldCircle(ctx, x, y, 0.17, 0.165); ctx.strokeStyle = '#e9c98d'; ctx.lineWidth = Math.max(1, this.scale * 0.025); ctx.stroke();
    }
    this.sparks = this.sparks.filter(s => (s.life -= dt) > 0);
    if (!this.reducedMotion) for (const spark of this.sparks) {
      spark.x += spark.vx * dt; spark.y += spark.vy * dt;
      const p = this.project(spark.x, spark.y, 0.14);
      ctx.globalAlpha = Math.min(1, spark.life * 4); ctx.fillStyle = spark.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.7, this.scale * 0.02), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.remove();
    this.canvas.width = this.canvas.height = this.background.width = this.background.height = 1;
    this.trail.length = 0;
    this.sparks.length = 0;
  }
}
