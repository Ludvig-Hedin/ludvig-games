/* ANYTHING ARENA engine: deterministic simulator + WebGL renderer + procedural audio + clip recorder.
 * Adapted from the hidden Anything vs Anything prototype. No network access anywhere in this file. */
(function (root) {
'use strict';
const modules = {
"dmath": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Deterministic math for the battle simulator.
 * Math.sin/cos/atan2/exp/pow/hypot are "implementation-approximated" in JS, so
 * Chrome, Safari and Firefox may differ in the last bit and a chaotic battle can
 * diverge. These versions use only + - * / and Math.sqrt (IEEE correctly rounded),
 * so every engine computes identical results. Accuracy is ~1e-7, plenty for gameplay.
 */
const PI = 3.141592653589793, TAU = 6.283185307179586, HALF_PI = 1.5707963267948966, LN2 = 0.6931471805599453;
exports.PI = PI;
function sin(x) {
    if (!(x === x) || x === Infinity || x === -Infinity)
        return 0;
    x = x - TAU * Math.round(x / TAU);
    if (x > HALF_PI)
        x = PI - x;
    else if (x < -HALF_PI)
        x = -PI - x;
    const x2 = x * x;
    return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))));
}
exports.sin = sin;
function cos(x) { return sin(x + HALF_PI); }
exports.cos = cos;
function atan(t) {
    // |t| <= 1 polynomial; reduce larger values with atan(t) = pi/2 - atan(1/t).
    let flip = false, sign = 1;
    if (t < 0) {
        t = -t;
        sign = -1;
    }
    if (t > 1) {
        t = 1 / t;
        flip = true;
    }
    // Further reduce around tan(pi/8) for accuracy.
    let offset = 0;
    if (t > 0.4142135623730951) {
        t = (t - 1) / (t + 1);
        offset = PI / 4;
    }
    const t2 = t * t;
    let r = t * (1 + t2 * (-1 / 3 + t2 * (1 / 5 + t2 * (-1 / 7 + t2 * (1 / 9 + t2 * (-1 / 11 + t2 * (1 / 13 - t2 / 15)))))));
    r += offset;
    if (flip)
        r = HALF_PI - r;
    return sign * r;
}
function atan2(y, x) {
    if (x === 0 && y === 0)
        return 0;
    if (x === 0)
        return y > 0 ? HALF_PI : -HALF_PI;
    const a = atan(y / x);
    if (x > 0)
        return a;
    return y >= 0 ? a + PI : a - PI;
}
exports.atan2 = atan2;
function exp(x) {
    if (x > 700)
        x = 700;
    if (x < -700)
        return 0;
    const k = Math.round(x / LN2), r = x - k * LN2;
    let s = 1, term = 1;
    for (let i = 1; i < 14; i++) {
        term = term * r / i;
        s += term;
    }
    let p = 1;
    if (k > 0)
        for (let i = 0; i < k; i++)
            p *= 2;
    else
        for (let i = 0; i < -k; i++)
            p *= .5;
    return s * p;
}
exports.exp = exp;
function log(x) {
    if (!(x > 0))
        return -Infinity;
    let e = 0;
    while (x >= 2) {
        x *= .5;
        e++;
    }
    while (x < 1) {
        x *= 2;
        e--;
    }
    const s = (x - 1) / (x + 1), s2 = s * s;
    let sum = 0, pow = s;
    for (let i = 1; i < 40; i += 2) {
        sum += pow / i;
        pow *= s2;
    }
    return 2 * sum + e * LN2;
}
exports.log = log;
function pow(x, y) { if (x === 0)
    return 0; if (y === 0 || x === 1)
    return 1; if (y === .5)
    return Math.sqrt(x); return exp(y * log(x)); }
exports.pow = pow;
function hypot(x, z) { return Math.sqrt(x * x + z * z); }
exports.hypot = hypot;
},
"math": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.color = color;
exports.identity = identity;
exports.multiply = multiply;
exports.compose = compose;
exports.lookAt = lookAt;
exports.ortho = ortho;
exports.project = project;
exports.geometry = geometry;
exports.perspective = perspective;
function color(hex, alpha = 1) { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha]; }
function identity() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
function multiply(a, b, out = new Float32Array(16)) { for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
        let s = 0;
        for (let k = 0; k < 4; k++)
            s += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = s;
    } return out; }
function compose(p, s = [1, 1, 1], r = [0, 0, 0], out = new Float32Array(16)) {
    const c1 = Math.cos(r[0] / 2), c2 = Math.cos(r[1] / 2), c3 = Math.cos(r[2] / 2), s1 = Math.sin(r[0] / 2), s2 = Math.sin(r[1] / 2), s3 = Math.sin(r[2] / 2);
    const x = s1 * c2 * c3 + c1 * s2 * s3, y = c1 * s2 * c3 - s1 * c2 * s3, z = c1 * c2 * s3 + s1 * s2 * c3, w = c1 * c2 * c3 - s1 * s2 * s3;
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = (1 - (yy + zz)) * s[0];
    out[1] = (xy + wz) * s[0];
    out[2] = (xz - wy) * s[0];
    out[3] = 0;
    out[4] = (xy - wz) * s[1];
    out[5] = (1 - (xx + zz)) * s[1];
    out[6] = (yz + wx) * s[1];
    out[7] = 0;
    out[8] = (xz + wy) * s[2];
    out[9] = (yz - wx) * s[2];
    out[10] = (1 - (xx + yy)) * s[2];
    out[11] = 0;
    out[12] = p[0];
    out[13] = p[1];
    out[14] = p[2];
    out[15] = 1;
    return out;
}
const norm = (a) => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, target) { const z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]); }
function ortho(width, height, near = .1, far = 150) { return new Float32Array([1 / width, 0, 0, 0, 0, 1 / height, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1]); }
function project(p, m) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w]; }
function geometry(name, low = false) {
    const v = [];
    const tri = (a, b, c) => { const n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])); for (const p of [a, b, c])
        v.push(...p, ...n); };
    if (name === 'box') {
        const faces = [[[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]];
        for (const f of faces) {
            tri(f[0], f[1], f[2]);
            tri(f[0], f[2], f[3]);
        }
    }
    else if (name === 'sphere' || name === 'detail') {
        const rows = name === 'detail' ? 12 : low ? 6 : 8, columns = name === 'detail' ? 16 : low ? 8 : 12;
        const point = (a, b) => [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)];
        const smooth = (a, b, c) => { for (const p of [a, b, c])
            v.push(...p, ...p); };
        for (let i = 0; i < rows; i++)
            for (let j = 0; j < columns; j++) {
                const a = i * Math.PI / rows, b = j * Math.PI * 2 / columns, a2 = (i + 1) * Math.PI / rows, b2 = (j + 1) * Math.PI * 2 / columns;
                smooth(point(a, b), point(a2, b), point(a2, b2));
                smooth(point(a, b), point(a2, b2), point(a, b2));
            }
    }
    else if (name === 'cylinder' || name === 'cone') {
        const n = name === 'cone' ? 16 : 48, top = name === 'cone' ? 0 : 1;
        for (let i = 0; i < n; i++) {
            const a = i * 2 * Math.PI / n, b = (i + 1) * 2 * Math.PI / n;
            const p = [Math.cos(a), -.5, Math.sin(a)], q = [Math.cos(b), -.5, Math.sin(b)], r = [Math.cos(b) * top, .5, Math.sin(b) * top], s = [Math.cos(a) * top, .5, Math.sin(a) * top];
            tri(p, s, r);
            tri(p, r, q);
            tri([0, -.5, 0], p, q);
            if (top)
                tri([0, .5, 0], r, s);
        }
    }
    else {
        for (let i = 0; i < 64; i++) {
            const a = i * Math.PI * 2 / 64, b = (i + 1) * Math.PI * 2 / 64;
            tri([Math.cos(a), 0, Math.sin(a)], [Math.cos(a) * .965, 0, Math.sin(a) * .965], [Math.cos(b) * .965, 0, Math.sin(b) * .965]);
            tri([Math.cos(a), 0, Math.sin(a)], [Math.cos(b) * .965, 0, Math.sin(b) * .965], [Math.cos(b), 0, Math.sin(b)]);
        }
    }
    return new Float32Array(v);
}
function perspective(fov, aspect, near = .2, far = 200) { const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
},
"schema": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dm = require("./dmath");
/** Only these data fields describe a fighter. Roster data is static; nothing is generated or executed. */
exports.SHAPES = ['human', 'gorilla', 'rex', 'bird', 'ant', 'shark', 'helicopter', 'car', 'robot', 'toaster', 'hamster', 'blob', 'quad', 'cloud', 'can', 'lamp', 'ghost', 'fruit', 'worm', 'crate', 'tree', 'vortex', 'snowman', 'peak'];
exports.WEAPONS = ['fists', 'pan', 'sword', 'axe', 'club', 'blaster', 'cannon', 'toast', 'staff'];
exports.HATS = ['none', 'helmet', 'bun', 'viking', 'wizard', 'crown', 'antlers', 'horns', 'horn', 'ears', 'chef', 'cap', 'tophat', 'hood', 'halo', 'leaf', 'bandana'];
exports.TRAITS = ['angry', 'armored', 'fast', 'giant', 'tiny', 'explosive', 'electric', 'flying', 'timid'];
exports.ELEMENTS = ['none', 'fire', 'water', 'ice', 'electric', 'earth', 'nature', 'air', 'toxic', 'arcane'];
exports.SPECIALS = ['slam', 'dash', 'heal', 'shield', 'rage', 'storm', 'freeze', 'stink', 'volley', 'quake', 'confuse', 'boom', 'pull'];
exports.WEAK_TAGS = ['fire', 'water', 'ice', 'electric', 'earth', 'nature', 'air', 'toxic', 'arcane', 'swarm', 'giant', 'ranged', 'melee', 'fast', 'heavy', 'tiny'];
exports.VERSION = 2;
exports.MAX_SIDE_AGENTS = 112;
exports.MAX_COUNT = 10000;
exports.MAX_SIDE = 4;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
exports.clamp = clamp;
function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }
exports.hash = hash;
function random(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
exports.random = random;
/** Rock-paper-scissors: every element beats exactly two others and loses to exactly two. */
exports.STRONG = { fire: ['ice', 'nature'], water: ['fire', 'earth'], ice: ['nature', 'air'], electric: ['water', 'air'], earth: ['electric', 'fire'], nature: ['water', 'earth'], air: ['toxic', 'arcane'], toxic: ['electric', 'arcane'], arcane: ['ice', 'toxic'] };
exports.COUNTER_LINES = {
    'fire>ice': 'FIRE MELTS ICE', 'fire>nature': 'FIRE TOASTS THE GREENS', 'water>fire': 'WATER PUTS OUT FIRE', 'water>earth': 'WATER TURNS EARTH TO MUD',
    'ice>nature': 'FROST WILTS THE PLANTS', 'ice>air': 'ICE FREEZES THE WIND', 'electric>water': 'WATER CONDUCTS. OUCH.', 'electric>air': 'LIGHTNING SPLITS THE SKY',
    'earth>electric': 'EARTH GROUNDS THE CURRENT', 'earth>fire': 'DIRT SMOTHERS FIRE', 'nature>water': 'ROOTS DRINK THE WATER', 'nature>earth': 'ROOTS CRACK THE STONE',
    'air>toxic': 'WIND CLEARS THE STINK', 'air>arcane': 'WIND SCATTERS THE SPELL', 'toxic>electric': 'GOO SHORTS THE CIRCUIT', 'toxic>arcane': 'THE SMELL BREAKS THE SPELL',
    'arcane>ice': 'MAGIC THAWS THE ICE', 'arcane>toxic': 'MAGIC PURIFIES THE GOO'
};
exports.TAG_LINES = { swarm: 'SWARMED!', giant: 'STEPPED ON!', ranged: 'SHOT FROM AFAR!', melee: 'UP CLOSE AND PERSONAL!', fast: 'TOO FAST TO HANDLE!', heavy: 'FLATTENED!', tiny: 'TOO SMALL TO HIT!' };
exports.ELEMENT_COLORS = { none: '#ffd59a', fire: '#ff7a3d', water: '#5aa9e6', ice: '#c8ecff', electric: '#ffe14d', earth: '#b08a5a', nature: '#7cc24f', air: '#e6eef2', toxic: '#a6d93b', arcane: '#c08cf0' };
const HEX = /^#[0-9a-f]{6}$/i;
/** Validate one roster entry. Throws on any unknown field value so roster typos fail loudly in checks. */
function validateFighter(f) {
    if (!f || typeof f !== 'object')
        throw new Error('Invalid fighter.');
    const need = (ok, what) => { if (!ok)
        throw new Error(`Fighter ${f.id || '?'}: bad ${what}`); };
    need(typeof f.id === 'string' && /^[a-z0-9-]{2,24}$/.test(f.id), 'id');
    need(typeof f.name === 'string' && f.name.length > 1 && f.name.length <= 40, 'name');
    need(exports.SHAPES.includes(f.shape), 'shape');
    need(exports.WEAPONS.includes(f.weapon), 'weapon');
    need(exports.HATS.includes(f.hat), 'hat');
    need(exports.ELEMENTS.includes(f.element), 'element');
    need(exports.SPECIALS.includes(f.special), 'special');
    need(Number.isInteger(f.count) && f.count >= 1 && f.count <= exports.MAX_COUNT, 'count');
    need(typeof f.scale === 'number' && f.scale >= .4 && f.scale <= 2.4, 'scale');
    need(Array.isArray(f.traits) && f.traits.length <= 3 && f.traits.every(t => exports.TRAITS.includes(t)), 'traits');
    need(Array.isArray(f.weak) && f.weak.length <= 3 && f.weak.every(t => exports.WEAK_TAGS.includes(t)), 'weak');
    need(!f.color || HEX.test(f.color), 'color');
    need(!f.color2 || HEX.test(f.color2), 'color2');
    need(!f.skin || HEX.test(f.skin), 'skin');
    need(Number.isInteger(f.variant || 0) && (f.variant || 0) >= 0 && (f.variant || 0) <= 9, 'variant');
    need(typeof f.tune === 'number' && f.tune > 0 && f.tune < 10, 'tune');
    return f;
}
exports.validateFighter = validateFighter;
function statsFor(f) {
    const table = {
        human: [85, 13, 2.7, 1.1, .85, 1, 1, 1, 'BRAWLER'], gorilla: [8500, 190, 3.5, 2.45, .64, 2.7, 18, 7, 'BRUISER'], rex: [2100, 120, 2.6, 2.1, 1.3, 2.6, 14, 7, 'TITAN'],
        bird: [38, 8, 4, .65, .62, .65, .4, 1, 'SKIRMISHER'], ant: [4, 1.2, 3, .45, .65, .3, .07, 1, 'SWARM'], shark: [780, 65, 3.7, 1.6, 1, 1.9, 6, 3, 'CHARGER'],
        helicopter: [690, 32, 3, 7.5, 1.1, 1.45, 5, 3, 'FLYER'], car: [1050, 70, 4.8, 1.55, 1.0, 1.7, 9, 4, 'RAMMER'], robot: [340, 21, 2.25, 6, .8, 1.15, 3, 1, 'RANGED'],
        toaster: [145, 19, 2.3, 5.5, .72, .92, 1.5, 1, 'OBJECT'], hamster: [95, 12, 3.8, .85, .7, .9, 1, 1, 'SKIRMISHER'], blob: [160, 18, 3, 1.1, .9, 1.1, 1.5, 2, 'WILDCARD'],
        quad: [520, 45, 3.6, 1.3, .85, 1.5, 5, 2, 'CHARGER'], cloud: [300, 22, 2.4, 1.6, .9, 1.4, 2, 2, 'FLOATER'], can: [260, 24, 2.6, 1.1, .8, 1.0, 2.5, 1, 'OBJECT'],
        lamp: [210, 20, 2.4, 1.4, .85, 1.3, 2, 1, 'OBJECT'], ghost: [150, 16, 3.3, 1.1, .75, 1.0, .6, 1, 'SPOOK'], fruit: [120, 14, 3.0, .9, .75, .9, 1.2, 1, 'SNACK'],
        worm: [180, 18, 3.0, 1.3, .8, 1.0, 1.5, 2, 'WRIGGLER'], crate: [300, 22, 2.3, 1.1, .9, 1.1, 3, 1, 'OBJECT'], tree: [420, 28, 2.0, 1.6, 1.0, 1.5, 4, 2, 'TANK'],
        vortex: [600, 32, 3.4, 2.2, .7, 1.8, 6, 4, 'STORM'], snowman: [240, 20, 2.2, 1.2, .9, 1.2, 2.5, 2, 'OBJECT'], peak: [2600, 95, 1.6, 2.6, 1.3, 2.4, 12, 5, 'TITAN']
    };
    const v = table[f.shape];
    const fly = f.shape === 'helicopter' ? 1.6 : f.shape === 'shark' ? .48 : f.shape === 'cloud' ? 1.25 : f.shape === 'ghost' ? .55 : 0;
    const s = { hp: v[0], damage: v[1], speed: v[2], reach: v[3], cooldown: v[4], size: v[5] * f.scale, mass: v[6], aoe: v[7], role: v[8], projectile: false, fly };
    if (f.hat === 'helmet') {
        s.hp *= 1.6;
        s.damage *= 1.25;
        s.speed *= .85;
    }
    if (f.hat === 'bun') {
        s.hp *= 1.15;
        s.damage *= 1.45;
        s.speed *= .78;
    }
    if (f.hat === 'viking')
        s.damage *= 1.65;
    if (f.weapon === 'pan') {
        s.damage *= 1.35;
        s.aoe = Math.max(2, s.aoe);
    }
    if (f.weapon === 'sword' || f.weapon === 'axe' || f.weapon === 'club') {
        s.damage *= 1.3;
        s.reach += .3;
    }
    if (['blaster', 'cannon', 'toast', 'staff'].includes(f.weapon)) {
        s.projectile = true;
        s.reach = Math.max(5.2, s.reach);
        s.role = 'RANGED';
    }
    if (f.weapon === 'cannon') {
        s.aoe = Math.max(3, s.aoe);
        s.damage *= 1.2;
    }
    for (const t of f.traits) {
        if (t === 'angry') {
            s.damage *= 1.4;
            s.cooldown *= .88;
            s.hp *= .86;
        }
        if (t === 'armored') {
            s.hp *= 1.8;
            s.speed *= .83;
            s.mass *= 1.6;
        }
        if (t === 'fast') {
            s.speed *= 1.55;
            s.cooldown *= .78;
        }
        if (t === 'giant') {
            s.size *= 1.65;
            s.hp *= 3;
            s.damage *= 2;
            s.mass *= 3;
            s.aoe = Math.max(4, s.aoe);
            if (!s.projectile)
                s.reach *= 1.5;
        }
        if (t === 'tiny') {
            s.size *= .58;
            s.hp *= .5;
            s.damage *= .65;
            s.speed *= 1.25;
            s.mass *= .5;
        }
        if (t === 'electric')
            s.damage *= 1.3;
        if (t === 'flying')
            s.fly = Math.max(s.fly, 1.6);
        if (t === 'timid') {
            s.speed *= 1.35;
            s.hp *= .8;
        }
    }
    s.size = clamp(s.size, .2, 4.4);
    s.reach = clamp(s.reach, .4, 9);
    s.speed = clamp(s.speed, 1, 7.5);
    s.damage = clamp(s.damage, .5, 450);
    s.hp = clamp(s.hp, 3, 15000);
    return s;
}
exports.statsFor = statsFor;
/** What an attacking group "is", for weakness checks. */
function tagsOf(f, s) {
    const t = [];
    if (f.count >= 10)
        t.push('swarm');
    if (s.size >= 2.2 || f.traits.includes('giant'))
        t.push('giant');
    t.push(s.projectile ? 'ranged' : 'melee');
    if (s.speed >= 4.4)
        t.push('fast');
    if (s.mass >= 6)
        t.push('heavy');
    if (s.size <= .6 || f.traits.includes('tiny'))
        t.push('tiny');
    return t;
}
exports.tagsOf = tagsOf;
/** Damage multiplier from attacker group to victim group, plus the commentary line for the strongest reason. */
function matchup(fa, sa, fb, sb) {
    let m = 1, line = '';
    if (fa.element !== 'none' && fb.element !== 'none') {
        if (exports.STRONG[fa.element]?.includes(fb.element)) {
            m *= 1.45;
            line = exports.COUNTER_LINES[`${fa.element}>${fb.element}`];
        }
        else if (exports.STRONG[fb.element]?.includes(fa.element))
            m *= .75;
    }
    const tags = tagsOf(fa, sa);
    if (fa.element !== 'none' && fb.weak.includes(fa.element)) {
        m *= 1.4;
        line = line || `${fb.name.toUpperCase()} HATES ${fa.element.toUpperCase()}`;
    }
    for (const w of fb.weak)
        if (tags.includes(w)) {
            m *= 1.4;
            line = line || exports.TAG_LINES[w];
            break;
        }
    return { m: clamp(m, .5, 2.3), line };
}
exports.matchup = matchup;
/** Hit points multiplier that puts every fighter on the same paper power (HP x DPS), before matchups. */
function powerScale(f, s, agents) {
    const n = Math.max(1, agents), w = f.count / n;
    const hpTotal = n * s.hp * dm.pow(w, .65);
    const engaged = Math.min(n, s.projectile ? 24 : 12);
    const dps = s.damage / s.cooldown * engaged * dm.pow(w, .5) * (1 + (s.aoe - 1) * .12);
    return 4.0e6 / Math.max(1e-6, hpTotal * dps) * (f.tune || 1);
}
exports.powerScale = powerScale;
/* ---------- Share codes ---------- */
function packFight(d) {
    const ids = (side) => side.map(f => f.id).join('.');
    return `${exports.VERSION}~${d.roster}~${ids(d.a)}~${ids(d.b)}~${(d.seed >>> 0).toString(36)}`;
}
exports.packFight = packFight;
/** Decode a share code using the given roster lookup. Returns { a, b, seed } with roster fighter objects. */
function unpackFight(code, byId, rosterVersion) {
    if (typeof code !== 'string' || code.length > 400)
        throw new Error('This fight code is too long.');
    const parts = decodeURIComponent(code.trim()).split('~');
    if (parts.length !== 5 || Number(parts[0]) !== exports.VERSION)
        throw new Error('This fight code is from a different game version.');
    if (Number(parts[1]) !== rosterVersion)
        throw new Error('This fight uses an older roster. It cannot replay exactly.');
    const side = (s) => { const list = s.split('.').filter(Boolean); if (!list.length || list.length > exports.MAX_SIDE)
        throw new Error('Invalid fight code.'); return list.map(id => { const f = byId(id); if (!f)
        throw new Error('Unknown fighter in code.'); return f; }); };
    const seed = parseInt(parts[4], 36);
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
        throw new Error('Invalid seed.');
    return { a: side(parts[2]), b: side(parts[3]), seed };
}
exports.unpackFight = unpackFight;
},
"sim": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Simulation = exports.STEP = void 0;
const schema_1 = require("./schema");
const dm = require("./dmath");
const clamp = schema_1.clamp, hyp = dm.hypot;
exports.STEP = 1 / 60;
exports.TIME_LIMIT = 27;
/** Seconds between special moves, per move. */
const SPECIAL_CD = { slam: 6, dash: 5.5, heal: 7.5, shield: 7, rage: 7, storm: 6.5, freeze: 7.5, stink: 6.5, volley: 5.5, quake: 7, confuse: 7.5, boom: 8, pull: 7 };
/**
 * Deterministic battle. Same fighters + same seed = identical result on every device.
 * Only + - * / Math.sqrt and integer ops influence state (see dmath), and the
 * renderer only reads from it.
 */
class Simulation {
    seed;
    agents = [];
    events = [];
    shots = [];
    rng;
    time = 0;
    tick = 0;
    finished = false;
    winner = -1;
    byDecision = false;
    radius = 12;
    biggestHit = 0;
    totalKOs = 0;
    damageScale = 1;
    teams;
    groups = [];
    initial = [0, 0];
    counts = [0, 0];
    matrix = [];
    announced = new Set();
    constructor(sideA, sideB, seed) {
        this.seed = seed >>> 0;
        this.rng = (0, schema_1.random)(this.seed);
        const sides = [sideA, sideB];
        this.teams = sides.map(side => ({ label: side.map(f => f.name).join(' + '), fighters: side, count: side.reduce((n, f) => n + f.count, 0) }));
        for (let team = 0; team < 2; team++) {
            const side = sides[team], G = side.length, cap = Math.floor(schema_1.MAX_SIDE_AGENTS / G);
            side.forEach((f, k) => {
                const s = (0, schema_1.statsFor)(f), n = Math.min(f.count, cap);
                const g = { id: this.groups.length, team, f, stats: s, n, k: (0, schema_1.powerScale)(f, s, n), cd: 2.4 + this.rng() * 2.2, shield: 0, rage: 0, specials: 0 };
                this.groups.push(g);
                this.counts[team] += n;
                const band = 14.4 / G, zc = ((k + .5) / G - .5) * 14.4;
                const rows = Math.max(1, Math.ceil(Math.sqrt(n) * 1.22 / Math.sqrt(G))), columns = Math.ceil(n / rows);
                const spacing = clamp(s.size * .87, .58, 1.3);
                const size = s.size * (n > 15 ? Math.min(1, 1.2 / s.size) : 1);
                for (let j = 0; j < n; j++) {
                    const weight = Math.floor(f.count / n) + (j < f.count % n ? 1 : 0), hp = s.hp * dm.pow(weight, .65) * g.k;
                    const z = zc + ((j % rows) - (rows - 1) / 2) * Math.min(spacing, band / rows);
                    const x = (team === 0 ? -1 : 1) * (6.3 + (Math.floor(j / rows) - (columns - 1) / 2) * Math.min(spacing, 4.6 / columns));
                    this.agents.push({ id: this.agents.length, team, group: g.id, x: x + (this.rng() - .5) * .15, z: z + (this.rng() - .5) * .15, y: s.fly, vx: 0, vz: 0, vy: 0, yaw: team === 0 ? dm.PI / 2 : -dm.PI / 2, hp, maxHp: hp, weight, radius: clamp(size * (f.shape === 'gorilla' ? .56 : f.shape === 'rex' || f.shape === 'peak' ? .48 : .44), .16, 3.0), scale: size, alive: true, koTime: 0, target: -1, retarget: 0, cooldown: this.rng() * .25, windup: 0, windupMax: .2, attack: 0, action: 'swipe', attackCount: 0, hitCount: 0, damageDealt: 0, specialCount: 0, specialCooldown: 0, charge: 0, locomotion: 0, gait: 0, hit: 0, stun: 0, chill: 0, fear: 0, confused: 0, phase: this.rng() * 6.28, spin: (this.rng() - .5) * 7, dodged: 0, stats: s });
                    this.initial[team] += hp;
                }
            });
        }
        this.matrix = this.groups.map(a => this.groups.map(b => a.team === b.team ? { m: 1, line: '' } : (0, schema_1.matchup)(a.f, a.stats, b.f, b.stats)));
        const dps = [0, 0];
        for (const g of this.groups) {
            const s = g.stats, w = g.f.count / g.n;
            dps[g.team] += s.damage / s.cooldown * Math.min(g.n, s.projectile ? 24 : 12) * dm.pow(w, .5);
        }
        const fastest = Math.min(this.initial[0] / dps[1], this.initial[1] / dps[0]);
        this.damageScale = clamp(fastest / 10, .0005, 500);
    }
    score(team) { let health = 0, alive = 0, remaining = 0; for (const a of this.agents)
        if (a.team === team && a.alive) {
            health += Math.max(0, a.hp);
            alive++;
            remaining += Math.ceil(a.weight * clamp(a.hp / a.maxHp, 0, 1));
        } return { alive, health: health / this.initial[team], remaining, knockouts: this.teams[1 - team].count - this.alivePopulation(1 - team) }; }
    alivePopulation(team) { let n = 0; for (const a of this.agents)
        if (a.team === team && a.alive)
            n += Math.ceil(a.weight * clamp(a.hp / a.maxHp, 0, 1)); return n; }
    pressure() { return 1 + Math.max(0, this.time - 16) * .19; }
    step(dt = exports.STEP) {
        this.events = [];
        this.tick++;
        if (!this.finished)
            this.time += dt;
        this.radius = 12 - Math.max(0, this.time - 18) * .22;
        const order = this.tick % 2 === 0 ? this.agents : [...this.agents].reverse();
        for (const a of order) {
            a.attack = Math.max(0, a.attack - dt * (a.action === 'slam' ? 2.2 : 3.5));
            a.hit = Math.max(0, a.hit - dt * 7);
            a.dodged = Math.max(0, a.dodged - dt);
            a.stun = Math.max(0, a.stun - dt);
            a.chill = Math.max(0, a.chill - dt);
            a.fear = Math.max(0, a.fear - dt);
            a.confused = Math.max(0, a.confused - dt);
            a.specialCooldown -= dt;
            if (!a.alive) {
                a.koTime += dt;
                if (a.koTime < 4)
                    this.integrate(a, dt, 0);
                continue;
            }
            const oldX = a.x, oldZ = a.z, base = a.stats.fly, g = this.groups[a.group];
            this.integrate(a, dt, base);
            a.locomotion *= dm.exp(-dt * 10);
            if (this.finished) {
                a.charge = 0;
                continue;
            }
            a.cooldown -= dt;
            a.retarget -= dt;
            if (a.retarget <= 0 || a.target < 0 || !this.agents[a.target]?.alive) {
                a.retarget = .13 + this.rng() * .1;
                let best = Infinity;
                a.target = -1;
                for (const b of this.agents)
                    if (b.team !== a.team && b.alive) {
                        const d = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z);
                        if (d < best) {
                            best = d;
                            a.target = b.id;
                        }
                    }
            }
            const b = this.agents[a.target];
            if (!b?.alive) {
                a.windup = 0;
                continue;
            }
            const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz) || .001, range = a.stats.reach + b.radius;
            const slow = a.chill > 0 ? .45 : 1, rage = g.rage > 0 ? 1.25 : 1;
            if (a.confused > 0 || a.fear > 0) {
                // Dazed or disgusted: wander away instead of attacking.
                a.windup = 0;
                const ang = a.confused > 0 ? a.phase + this.time * 2.3 : dm.atan2(-dx, -dz);
                const sp = a.stats.speed * .6 * slow;
                a.x += dm.sin(ang) * sp * dt;
                a.z += dm.cos(ang) * sp * dt;
                a.yaw += clamp(dm.atan2(dm.sin(ang - a.yaw), dm.cos(ang - a.yaw)), -dt * 8, dt * 8);
                const mv = hyp(a.x - oldX, a.z - oldZ);
                a.locomotion = clamp(mv / dt / a.stats.speed, 0, 1.8);
                a.gait += mv / Math.max(.3, a.scale) * 3.3;
                continue;
            }
            const desired = dm.atan2(dx, dz), angle = dm.atan2(dm.sin(desired - a.yaw), dm.cos(desired - a.yaw));
            a.yaw += clamp(angle, -dt * 10, dt * 10);
            // Commit an attack once it starts. Small crowd hits cannot reset a giant's windup.
            if (a.windup > 0) {
                a.windup -= dt * slow;
                if (a.windup <= 0) {
                    this.strike(a, b);
                    a.attack = 1;
                    a.cooldown = a.stats.cooldown * (a.action === 'slam' ? 1.28 : .85 + this.rng() * .22) / (g.rage > 0 ? 1.35 : 1);
                }
                continue;
            }
            if (a.stun > 0 || a.y > base + .7)
                continue;
            const shape = g.f.shape, bruiser = shape === 'gorilla' || shape === 'rex' || shape === 'car' || shape === 'quad';
            const charging = bruiser && d > range + 1.1 && a.specialCooldown <= 0;
            if (charging && a.charge === 0) {
                a.charge = 1;
                this.events.push({ kind: 'charge', x: a.x, z: a.z, y: a.y, team: a.team, power: 1, attacker: a.id, mass: a.stats.mass });
            }
            const keep = a.stats.projectile ? range * .73 : Math.max(a.radius + b.radius, range * .77);
            if (d > keep) {
                const speed = a.stats.speed * (a.charge > 0 ? 1.9 : d > 4 ? 1.15 : 1) * slow * rage;
                // Flank the contact point rather than pushing every crowd member through the same spot.
                const flank = a.stats.mass < 5 && !a.stats.projectile && d < range * 2.3 ? dm.sin(a.phase) * .48 : 0;
                a.x += (dx / d - flank * dz / d) * speed * dt;
                a.z += (dz / d + flank * dx / d) * speed * dt;
            }
            else if (a.stats.projectile && d < range * .34) {
                a.x -= dx / d * a.stats.speed * dt * .8 * slow;
                a.z -= dz / d * a.stats.speed * dt * .8 * slow;
            }
            if (g.f.traits.includes('timid') && b.windup > 0) {
                a.x -= dx / d * dt * a.stats.speed;
                a.z -= dz / d * dt * a.stats.speed;
            }
            const move = hyp(a.x - oldX, a.z - oldZ);
            a.locomotion = clamp(move / dt / a.stats.speed, 0, 1.8);
            a.gait += move / Math.max(.3, a.scale) * 3.3;
            if (d <= range + .12 && a.cooldown <= 0) {
                const slam = shape === 'gorilla' && (a.attackCount % 4 === 2 || a.charge > 0 && a.attackCount > 0);
                a.action = a.stats.projectile ? 'shot' : slam ? 'slam' : shape === 'gorilla' ? (a.attackCount % 3 === 1 ? 'uppercut' : 'swipe') : shape === 'rex' ? 'bite' : shape === 'car' || shape === 'quad' ? 'ram' : 'swipe';
                a.windupMax = a.action === 'slam' ? .46 : shape === 'gorilla' ? .26 : a.stats.mass > 6 ? .29 : .18;
                a.windup = a.windupMax;
                a.attack = 0;
                a.charge = 0;
                a.specialCooldown = Math.max(a.specialCooldown, 1.5);
                this.events.push({ kind: 'swing', x: a.x, z: a.z, y: a.y + a.scale, team: a.team, power: 1, attacker: a.id, action: a.action, mass: a.stats.mass });
            }
            else if (d <= range)
                a.charge = 0;
        }
        if (!this.finished) {
            this.specials(dt);
            this.separate();
            this.updateShots(dt);
            this.checkEnd();
        }
    }
    integrate(a, dt, base) {
        a.x += a.vx * dt;
        a.z += a.vz * dt;
        a.y += a.vy * dt;
        if (a.y > base || a.vy > 0)
            a.vy -= 20 * dt;
        if (a.y < base) {
            const impact = -a.vy;
            a.y = base;
            a.vy = impact > 4 ? impact * .18 : 0;
            if (impact > 5 && !this.finished)
                this.events.push({ kind: 'land', x: a.x, z: a.z, y: base, team: a.team, power: impact * a.stats.mass, attacker: a.id, mass: a.stats.mass });
        }
        const drag = dm.exp(-(a.y > base + .05 ? 1.25 : 7) * dt);
        a.vx *= drag;
        a.vz *= drag;
        if (a.alive) {
            const dist = hyp(a.x, a.z), limit = this.radius - a.radius;
            if (dist > limit && dist > 0) {
                const nx = a.x / dist, nz = a.z / dist;
                a.x = nx * limit;
                a.z = nz * limit;
                const v = a.vx * nx + a.vz * nz;
                if (v > 0) {
                    a.vx -= nx * v * 1.6;
                    a.vz -= nz * v * 1.6;
                }
            }
        }
    }
    separate() {
        const grid = new Map(), cell = 6.1;
        for (const a of this.agents)
            if (a.alive && a.y < a.stats.fly + .7) {
                const k = `${Math.floor(a.x / cell)},${Math.floor(a.z / cell)}`;
                const bucket = grid.get(k);
                if (bucket)
                    bucket.push(a);
                else
                    grid.set(k, [a]);
            }
        for (const a of this.agents)
            if (a.alive && a.y < a.stats.fly + .7) {
                const gx = Math.floor(a.x / cell), gz = Math.floor(a.z / cell);
                for (let ix = -1; ix <= 1; ix++)
                    for (let iz = -1; iz <= 1; iz++)
                        for (const b of grid.get(`${gx + ix},${gz + iz}`) || []) {
                            if (b.id <= a.id)
                                continue;
                            let dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), min = (a.radius + b.radius) * .97;
                            if (d >= min)
                                continue;
                            if (d < .001) {
                                dx = .01;
                                dz = .001;
                                d = .01005;
                            }
                            const push = (min - d) * .7, mass = a.stats.mass + b.stats.mass;
                            a.x -= dx / d * push * b.stats.mass / mass;
                            a.z -= dz / d * push * b.stats.mass / mass;
                            b.x += dx / d * push * a.stats.mass / mass;
                            b.z += dz / d * push * a.stats.mass / mass;
                        }
            }
    }
    nearestEnemy(a) { let best = null, bd = Infinity; for (const v of this.agents)
        if (v.alive && v.team !== a.team) {
            const d = (v.x - a.x) * (v.x - a.x) + (v.z - a.z) * (v.z - a.z);
            if (d < bd) {
                bd = d;
                best = v;
            }
        } return best; }
    strike(a, b) {
        if (!a.alive)
            return;
        a.attackCount++;
        if (!b.alive) {
            const next = this.nearestEnemy(a);
            if (!next)
                return;
            b = next;
        }
        const slam = a.action === 'slam', distance = hyp(a.x - b.x, a.z - b.z);
        if (distance > a.stats.reach + b.radius + 1.0 && !slam)
            return;
        const critical = this.rng() < .14;
        const power = a.stats.damage * Math.sqrt(a.weight) * this.damageScale * (.9 + this.rng() * .2) * (critical ? 1.5 : 1) * (slam ? 1.14 : a.action === 'uppercut' ? 1.16 : 1) * this.pressure();
        if (a.stats.projectile) {
            if (this.shots.length < 160) {
                this.shots.push({ from: a.id, target: b.id, x: a.x, z: a.z, y: a.y + a.scale * .8, life: 0, power, big: a.stats.aoe > 1 });
                this.events.push({ kind: 'shot', x: a.x, z: a.z, y: a.y + a.scale * .8, team: a.team, power, tx: b.x, tz: b.z, attacker: a.id, mass: a.stats.mass, action: a.action });
            }
            return;
        }
        const reach = slam ? Math.max(3.5, a.scale * 1.5) : a.stats.reach + b.radius + .65;
        const sy = dm.sin(a.yaw), cy = dm.cos(a.yaw);
        const victims = this.agents.filter(v => {
            if (!v.alive || v.team === a.team)
                return false;
            const dx = v.x - a.x, dz = v.z - a.z, d = hyp(dx, dz) || .001;
            if (slam)
                return d < reach + v.radius;
            const front = (dx * sy + dz * cy) / d;
            return d < reach && front > -.28 && hyp(v.x - b.x, v.z - b.z) < (a.stats.aoe > 1 ? Math.max(1.6, a.scale * 1.0) : .2);
        });
        const dist = (v) => (v.x - a.x) * (v.x - a.x) + (v.z - a.z) * (v.z - a.z);
        victims.sort((u, v) => dist(u) - dist(v) || u.id - v.id);
        if (!victims.includes(b) && distance < reach)
            victims.unshift(b);
        victims.slice(0, slam ? Math.min(18, a.stats.aoe + 6) : a.stats.aoe).forEach((v, i) => this.damage(a, v, power * (i === 0 ? 1 : slam ? .76 : .68), critical));
        if (slam) {
            a.specialCount++;
            a.specialCooldown = 2.2;
            this.events.push({ kind: 'special', x: a.x + sy * a.scale * .55, z: a.z + cy * a.scale * .55, y: 0, team: a.team, power, label: 'GROUND SLAM', attacker: a.id, action: a.action, mass: a.stats.mass, element: this.groups[a.group].f.element, big: true });
        }
    }
    /** Group-level special moves: one member performs it every few seconds. */
    specials(dt) {
        for (const g of this.groups) {
            g.shield = Math.max(0, g.shield - dt);
            g.rage = Math.max(0, g.rage - dt);
            g.cd -= dt;
            if (g.cd > 0 || this.time < 1.2)
                continue;
            let user = null, bd = Infinity;
            for (const a of this.agents)
                if (a.alive && a.group === g.id && a.stun <= 0 && a.confused <= 0) {
                    const t = this.agents[a.target];
                    if (!t?.alive)
                        continue;
                    const d = (t.x - a.x) * (t.x - a.x) + (t.z - a.z) * (t.z - a.z);
                    if (d < bd) {
                        bd = d;
                        user = a;
                    }
                }
            if (!user) {
                g.cd = .5;
                continue;
            }
            g.cd = SPECIAL_CD[g.f.special] * (.9 + this.rng() * .2);
            g.specials++;
            this.special(g, user);
        }
    }
    special(g, u) {
        const move = g.f.special, s = g.stats, alive = this.agents.filter(a => a.alive && a.group === g.id).length;
        const budget = s.damage / s.cooldown * Math.sqrt(g.f.count / g.n) * Math.min(Math.max(1, alive), 12) * this.damageScale * this.pressure() * 2.0;
        const enemies = this.agents.filter(v => v.alive && v.team !== u.team);
        const t = this.agents[u.target]?.alive ? this.agents[u.target] : enemies[0];
        if (!t)
            return;
        const near = (cx, cz, r, cap) => enemies.map(v => ({ v, d: hyp(v.x - cx, v.z - cz) })).filter(o => o.d < r + o.v.radius).sort((p, q) => p.d - q.d || p.v.id - q.v.id).slice(0, cap).map(o => o.v);
        let x = u.x, z = u.z, radius = 3;
        const hit = (v, p, extra) => { this.damage(u, v, p, false, true); if (extra)
            extra(v); };
        if (move === 'slam') {
            radius = Math.max(3, u.scale * 1.6);
            for (const v of near(u.x, u.z, radius, 18))
                hit(v, budget * .55, v => { v.vy = Math.max(v.vy, 5); v.stun = Math.max(v.stun, .35); });
        }
        else if (move === 'quake') {
            radius = 9;
            for (const v of enemies.filter(v => v.stats.fly === 0 && v.y < .3).slice(0, 40))
                hit(v, budget * .3, v => { v.vy = Math.max(v.vy, 2.6); v.stun = Math.max(v.stun, .5); });
        }
        else if (move === 'dash') {
            const dx = t.x - u.x, dz = t.z - u.z, d = hyp(dx, dz) || .001, nx = dx / d, nz = dz / d;
            u.vx = nx * Math.min(22, d * 7 + 4);
            u.vz = nz * Math.min(22, d * 7 + 4);
            const line = enemies.filter(v => { const px = v.x - u.x, pz = v.z - u.z, along = px * nx + pz * nz, side = Math.abs(px * nz - pz * nx); return along > -.5 && along < d + 1.2 && side < 1.3 + v.radius; }).slice(0, 8);
            for (const v of line)
                hit(v, budget * .7, v => { v.vx += nx * 4; v.vz += nz * 4; v.vy = Math.max(v.vy, 2); });
            x = t.x;
            z = t.z;
            radius = 2;
        }
        else if (move === 'heal') {
            radius = 5;
            for (const a of this.agents.filter(a => a.alive && a.team === u.team && hyp(a.x - u.x, a.z - u.z) < 5 + a.radius).slice(0, 24)) {
                a.hp = Math.min(a.maxHp, a.hp + a.maxHp * .22);
                a.chill = 0;
                a.fear = 0;
                a.confused = 0;
            }
        }
        else if (move === 'shield') {
            g.shield = 3.2;
            radius = 2.5;
        }
        else if (move === 'rage') {
            g.rage = 4;
            radius = 2.5;
        }
        else if (move === 'storm') {
            const pool = [...enemies];
            for (let i = 0; i < 4 && pool.length; i++) {
                const v = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
                hit(v, budget * .55, v => { v.stun = Math.max(v.stun, .35); });
                this.events.push({ kind: 'zap', x: v.x, z: v.z, y: v.y + v.scale, team: u.team, power: 1, element: g.f.element });
            }
            x = t.x;
            z = t.z;
        }
        else if (move === 'freeze') {
            x = t.x;
            z = t.z;
            radius = 4.5;
            for (const v of near(x, z, radius, 16))
                hit(v, budget * .2, v => { v.stun = Math.max(v.stun, 1.3); v.chill = 2.6; v.windup = 0; });
        }
        else if (move === 'stink') {
            x = t.x;
            z = t.z;
            radius = 4.5;
            for (const v of near(x, z, radius, 20))
                hit(v, budget * .35, v => { v.fear = 1.7; });
        }
        else if (move === 'volley') {
            const list = near(u.x, u.z, 30, 6);
            for (const v of list)
                if (this.shots.length < 170)
                    this.shots.push({ from: u.id, target: v.id, x: u.x, z: u.z, y: u.y + u.scale * .9, life: 0, power: budget * .4, big: false, special: true });
            radius = 1.5;
        }
        else if (move === 'confuse') {
            x = t.x;
            z = t.z;
            radius = 5;
            for (const v of near(x, z, radius, 16))
                hit(v, budget * .12, v => { v.confused = 2.2; v.windup = 0; });
        }
        else if (move === 'boom') {
            radius = 3.8;
            for (const v of near(u.x, u.z, radius, 14))
                hit(v, budget * 1.0, v => { v.vy = Math.max(v.vy, 5.5); });
            u.hp -= u.maxHp * .2;
            u.hit = 1;
            if (u.hp <= 0) {
                u.hp = 1;
            }
        }
        else if (move === 'pull') {
            radius = 8;
            for (const v of near(u.x, u.z, radius, 24)) {
                const dx = u.x - v.x, dz = u.z - v.z, d = hyp(dx, dz) || .001, f = Math.min(13, d * 2.4);
                hit(v, budget * .28, v => { v.vx += dx / d * f; v.vz += dz / d * f; v.stun = Math.max(v.stun, .45); });
            }
        }
        u.specialCount++;
        this.events.push({ kind: 'special', x, z, y: 0, team: u.team, power: budget, label: g.f.specialName, move, attacker: u.id, mass: u.stats.mass, element: g.f.element, radius, group: g.id });
    }
    updateShots(dt) {
        this.shots = this.shots.filter(s => {
            s.life += dt;
            const a = this.agents[s.from], b = this.agents[s.target];
            if (s.life > 3 || !b?.alive)
                return false;
            const dx = b.x - s.x, dz = b.z - s.z, d = hyp(dx, dz), speed = 16;
            s.x += dx / Math.max(.001, d) * speed * dt;
            s.z += dz / Math.max(.001, d) * speed * dt;
            s.y += (b.y + b.scale * .55 - s.y) * dt * 7;
            if (d < speed * dt + .35) {
                this.damage(a, b, s.power, false, !!s.special);
                if (s.big)
                    for (const v of this.agents.filter(v => v.alive && v.team !== a.team && v.id !== b.id && hyp(v.x - b.x, v.z - b.z) < 2.5).slice(0, 3))
                        this.damage(a, v, s.power * .5, false, false);
                return false;
            }
            return true;
        });
    }
    damage(a, b, power, critical, special = false) {
        if (!b.alive)
            return;
        if (!special && this.rng() < (b.stats.speed > 3.8 ? .055 : .018) && b.stun <= 0 && b.stats.mass < 6) {
            b.dodged = .3;
            const sign = this.rng() < .5 ? -1 : 1;
            b.vx += dm.cos(b.yaw) * sign * 3;
            b.vz -= dm.sin(b.yaw) * sign * 3;
            return;
        }
        const ga = this.groups[a.group], gb = this.groups[b.group], mu = this.matrix[a.group][b.group];
        power *= mu.m * (ga.rage > 0 ? 1.6 : 1) * (gb.shield > 0 ? .4 : 1);
        if (mu.line && mu.m > 1.2) {
            const key = a.group + '>' + b.group;
            if (!this.announced.has(key)) {
                this.announced.add(key);
                this.events.push({ kind: 'counter', x: b.x, z: b.z, y: b.y + b.scale, team: a.team, power: mu.m, label: mu.line, attacker: a.id, victim: b.id });
            }
        }
        b.hp -= power;
        b.hit = 1;
        a.hitCount++;
        a.damageDealt += Math.min(power, b.hp + power);
        this.biggestHit = Math.max(this.biggestHit, power);
        const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz) || 1, ratio = a.stats.mass / b.stats.mass, slam = a.action === 'slam';
        const force = clamp(dm.pow(ratio, .63) * 2.1, .12, 12) * (critical ? 1.2 : 1) * (slam ? 1.22 : 1);
        b.vx = clamp(b.vx + dx / d * force, -22, 22);
        b.vz = clamp(b.vz + dz / d * force, -22, 22);
        // Poise: a sword hit can hurt a gorilla, but cannot lift it or keep it stun-locked.
        if (ratio > .62) {
            b.vy = Math.max(b.vy, clamp(force * (a.action === 'uppercut' ? .8 : .44), .3, 8.5));
            b.stun = Math.max(b.stun, clamp(force * .017, .035, .22));
        }
        this.events.push({ kind: 'hit', x: b.x, z: b.z, y: b.y + b.scale * .65, team: a.team, power, victim: b.id, attacker: a.id, action: a.action, mass: a.stats.mass, element: ga.f.element });
        if (b.hp <= 0) {
            b.hp = 0;
            b.alive = false;
            b.koTime = 0;
            b.windup = 0;
            b.vy = Math.max(b.vy, 4 + Math.min(5, ratio * .35) + this.rng() * 2);
            b.vx += dx / d * 2;
            b.vz += dz / d * 2;
            this.totalKOs += b.weight;
            this.events.push({ kind: 'ko', x: b.x, z: b.z, y: b.y + b.scale * .5, team: a.team, power, victim: b.id, attacker: a.id, action: a.action, mass: a.stats.mass });
            if (gb.f.traits.includes('explosive')) {
                this.events.push({ kind: 'special', x: b.x, z: b.z, y: 0, team: b.team, power: 100, label: 'PARTING GIFT', attacker: b.id, mass: b.stats.mass, element: 'fire', radius: 3 });
                for (const v of this.agents.filter(x => x.alive && x.team !== b.team && hyp(x.x - b.x, x.z - b.z) < 3).slice(0, 8)) {
                    v.hp = Math.max(1, v.hp - b.stats.damage * Math.sqrt(b.weight) * this.damageScale * 1.5);
                    v.vy = Math.max(v.vy, 5);
                    v.hit = 1;
                }
            }
        }
    }
    checkEnd() { const a = this.score(0), b = this.score(1); if (a.alive && b.alive && this.time < exports.TIME_LIMIT)
        return; this.finished = true; this.byDecision = !!a.alive && !!b.alive; this.winner = !a.alive && !b.alive ? -1 : !a.alive ? 1 : !b.alive ? 0 : Math.abs(a.health - b.health) < .005 ? -1 : a.health > b.health ? 0 : 1; this.events.push({ kind: 'end', x: 0, z: 0, y: 0, team: this.winner === 1 ? 1 : 0, power: 1 }); }
    /** Run to the end without rendering (used for checks and late joiners). */
    runToEnd(maxTicks = 4000) { while (!this.finished && this.tick < maxTicks)
        this.step(); return this; }
    fingerprint() { return JSON.stringify({ winner: this.winner, tick: this.tick, agents: this.agents.map(a => [a.id, a.alive, +a.hp.toFixed(5), +a.x.toFixed(5), +a.z.toFixed(5)]) }); }
}
exports.Simulation = Simulation;
},
"models": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEAM = void 0;
exports.makeModel = makeModel;
const schema_1 = require("./schema");
const math_1 = require("./math");
exports.TEAM = ['#e9794b', '#6eb2c9'];
function shade(hex, k) { const c = (0, math_1.color)(hex); const h = (v) => Math.round(Math.max(0, Math.min(1, v * k)) * 255).toString(16).padStart(2, '0'); return '#' + h(c[0]) + h(c[1]) + h(c[2]); }
const SKINS = ['#bf9572', '#8d5a3b', '#e0b08f', '#a87650', '#d6a582'];
/** Builds a fighter from reusable primitives. Pure data in, primitive list out. */
function makeModel(f, team) {
    const parts = [];
    const accent = exports.TEAM[team], dark = '#252b2c', white = '#e4dfca', metal = '#8d9da3', gold = '#d3a63c';
    const main = (fallback) => f.color || fallback, second = (fallback) => f.color2 || fallback;
    const v = f.variant || 0, h = (0, schema_1.hash)(f.id || f.name || 'x');
    const skin = f.skin || SKINS[h % SKINS.length];
    const add = (geo, p, s, c, r = [0, 0, 0], joint = 'none', pivot = null, mat = null) => parts.push({ geo: geo === 'sphere' && f.count <= 5 ? 'detail' : geo, p, s, c: (0, math_1.color)(c), r, joint, pivot, material: mat || (c === metal ? [.32, .8, 0] : c === dark ? [.72, .05, 0] : [.84, 0, 0]) });
    const box = (p, s, c, r = [0, 0, 0], j = 'none', pv = null) => add('box', p, s, c, r, j, pv);
    const ball = (p, s, c, j = 'none', pv = null) => add('sphere', p, s, c, [0, 0, 0], j, pv);
    const cyl = (p, s, c, r = [0, 0, 0], j = 'none', pv = null) => add('cylinder', p, s, c, r, j, pv);
    const cone = (p, s, c, r = [0, 0, 0], j = 'none', pv = null) => add('cone', p, s, c, r, j, pv);
    const glow = (geo, p, s, c, r = [0, 0, 0], j = 'none') => add(geo, p, s, c, r, j, null, [.5, 0, 4]);
    const angry = f.traits.includes('angry');
    const eyes = (x, y, z, size = .075, j = 'none') => { for (const sign of [-1, 1]) {
        ball([x * sign, y, z], [size, size, size * .7], white, j);
        ball([x * sign, y, z + size * .65], [size * .46, size * .58, size * .25], dark, j);
        if (angry)
            box([x * sign, y + size * 1.15, z + size * .4], [size * 1.6, size * .32, size * .3], dark, [0, 0, sign * .45], j);
    } };
    const feet = (x, y, s, c, z = .05) => { for (const sign of [-1, 1])
        ball([sign * x, y, z], [s, s * .6, s * 1.2], c, sign < 0 ? 'legL' : 'legR', [sign * x, y + .25, z]); };
    const arms = (x, y, s, c) => { for (const sign of [-1, 1])
        ball([sign * x, y, .05], [s, s * 1.5, s], c, sign < 0 ? 'armL' : 'armR', [sign * x, y + s * 1.2, .05]); };
    // Generic hat anchor: shape branches move it to the top of their head.
    let top = [0, 1.7, 0], hs = 1, topJoint = 'none', humanHat = false;
    const s = f.shape;
    if (s === 'human' || s === 'robot') {
        const robot = s === 'robot', golem = robot && v === 1;
        const body = robot ? main(metal) : f.hat === 'helmet' ? main(metal) : main(accent), legs = robot ? shade(body, .75) : second('#414449');
        ball([0, .96, 0], [.34, .4, .245], body);
        ball([0, .66, 0], [.25, .24, .21], robot ? body : shade(legs, 1));
        for (const sg of [-1, 1]) {
            const L = sg === -1 ? 'legL' : 'legR', A = sg === -1 ? 'armL' : 'armR';
            ball([sg * .19, .35, 0], [.125, .34, .15], legs, L);
            box([sg * .19, .08, .12], [.3, .16, .46], dark, [0, 0, 0], L);
            ball([sg * .43, .91, .02], [.13, .36, .14], body, A);
            ball([sg * .41, 1.14, 0], [.18, .16, .18], body, A);
            ball([sg * .48, .56, .08], [.135, .14, .13], robot ? shade(body, .8) : skin, A);
        }
        ball([0, 1.44, .015], [.235, .26, .23], robot ? body : skin);
        cyl([0, 1.21, 0], [.10, .16, .10], robot ? shade(body, .8) : skin);
        if (robot && !golem) {
            box([0, 1.48, .247], [.4, .13, .045], dark);
            glow('box', [0, 1.48, .28], [.29, .055, .02], second(accent));
            cyl([0, 1.83, 0], [.028, .3, .028], metal);
            glow('sphere', [0, 1.99, 0], [.07, .07, .07], second(accent));
            box([0, .95, .225], [.29, .22, .03], dark);
            box([0, .97, .25], [.15, .05, .02], second(accent));
            top = [0, 1.72, 0];
        }
        else if (golem) {
            for (let i = 0; i < 5; i++)
                box([Math.sin(i * 2.1) * .2, .7 + i * .2, .2], [.18, .12, .1], shade(body, .8), [0, 0, i]);
            glow('box', [0, 1.48, .23], [.3, .05, .03], '#ffb35a');
        }
        else
            eyes(.105, 1.49, .228, .029);
        humanHat = !robot;
        if (!robot) {
            if (v === 1)
                box([0, .95, .245], [.07, .42, .02], second('#a33b3b'));
            if (v === 2)
                box([0, .9, -.27], [.72, .95, .04], second('#a3202b'), [.12, 0, 0]);
            if (v === 3)
                for (let i = 0; i < 4; i++)
                    box([0, .7 + i * .14, .03], [.7, .045, .5], second(dark));
            if (v === 4)
                for (let i = 0; i < 4; i++)
                    box([0, .78 + i * .1, .245], [.4 - i * .03, .025, .02], second(dark));
        }
        if (f.hat === 'bun') {
            ball([0, 1.64, -.06], [.29, .17, .26], '#d9d8cd');
            ball([0, 1.82, -.13], [.17, .17, .17], '#b6b8b1');
            cone([0, .54, 0], [.53, .9, .38], main(accent));
            for (const sg of [-1, 1])
                add('ring', [sg * .12, 1.49, .29], [.09, .09, .09], dark, [Math.PI / 2, 0, 0]);
            box([0, 1.34, .242], [.13, .025, .02], '#955445');
        }
        else if (f.hat === 'helmet') {
            ball([0, 1.59, 0], [.265, .3, .255], metal);
            box([0, 1.47, .252], [.4, .23, .055], metal);
            box([0, 1.535, .285], [.33, .036, .012], dark);
            box([0, 1.89, -.02], [.07, .29, .29], second(accent), [-.25, 0, 0]);
            ball([-.55, .87, .22], [.28, .39, .065], metal, 'armL');
            ball([-.55, .87, .275], [.235, .34, .024], second(accent), 'armL');
            box([0, .89, .248], [.2, .39, .016], second(accent));
        }
        else if (f.hat === 'viking') {
            ball([0, 1.68, 0], [.29, .18, .27], '#74695c');
            for (const sg of [-1, 1])
                cone([sg * .35, 1.83, 0], [.08, .43, .08], white, [0, 0, -sg * .7]);
            cone([0, 1.16, .19], [.2, .33, .13], '#916443');
        }
        else if (f.hat === 'hood') {
            ball([0, 1.47, -.04], [.28, .3, .27], second(shade(body, .8)));
            box([0, 1.42, .2], [.3, .3, .06], '#1b1d20');
            eyes(.07, 1.47, .235, .025);
        }
        else if (f.hat === 'bandana') {
            ball([0, 1.6, 0], [.25, .14, .24], second('#c23b2f'));
            ball([0, 1.6, -.25], [.07, .07, .07], second('#c23b2f'));
        }
        else if (!robot && v !== 4 && f.hat === 'none')
            box([0, 1.71, -.025], [.5, .13, .45], h % 2 ? '#6d5143' : '#2f2622');
        box([0, .64, .235], [.67, .08, .07], robot ? dark : '#443b32');
    }
    else if (s === 'gorilla') {
        const fur = main('#302d2b'), face = f.skin || '#59504a', silver = second('#696864'), skinDark = shade(face, .66);
        ball([0, 1.04, -.1], [.62, .68, .45], fur);
        ball([0, 1.22, -.31], [.53, .48, .22], silver);
        ball([0, .63, -.13], [.41, .43, .35], fur);
        for (const sign of [-1, 1]) {
            ball([sign * .25, 1.16, .3], [.31, .36, .14], skinDark);
            ball([sign * .18, .83, .3], [.2, .22, .13], skinDark);
            ball([sign * .26, .55, -.18], [.28, .4, .3], fur, sign < 0 ? 'legL' : 'legR');
            ball([sign * .3, .22, -.06], [.19, .28, .22], fur, sign < 0 ? 'legL' : 'legR');
            ball([sign * .3, .075, .13], [.25, .115, .34], skinDark, sign < 0 ? 'legL' : 'legR');
            const arm = sign < 0 ? 'armL' : 'armR', fore = sign < 0 ? 'forearmL' : 'forearmR';
            ball([sign * .58, 1.21, .01], [.34, .37, .35], fur, arm);
            ball([sign * .76, .91, .1], [.23, .43, .27], fur, arm);
            ball([sign * .84, .57, .22], [.245, .34, .25], fur, fore);
            ball([sign * .88, .29, .35], [.255, .24, .28], skinDark, fore);
            for (let k = 0; k < 4; k++)
                ball([sign * (.74 + k * .09), .19, .53], [.063, .095, .11], face, fore);
            for (let k = 0; k < 3; k++)
                ball([sign * (.5 + k * .09), 1.25 - k * .12, -.14], [.15, .2, .22], k === 0 ? silver : fur, arm);
        }
        ball([0, 1.53, .19], [.38, .41, .35], fur, 'head');
        ball([0, 1.77, .14], [.21, .19, .21], fur, 'head');
        ball([0, 1.45, .46], [.29, .25, .2], face, 'head');
        ball([0, 1.28, .47], [.245, .17, .15], skinDark, 'jaw');
        for (const sign of [-1, 1]) {
            ball([sign * .145, 1.61, .46], [.125, .09, .08], skinDark, 'head');
            ball([sign * .148, 1.605, .512], [.044, .035, .028], '#201a16', 'head');
            ball([sign * .148, 1.605, .538], [.019, .021, .01], '#b58b45', 'head');
            ball([sign * .14, 1.69, .447], [.175, .07, .13], fur, 'head');
        }
        box([.65, 1.18, .29], [.045, .19, .035], accent, [0, 0, -.25], 'armR');
        top = [0, 1.92, .14];
        topJoint = 'head';
    }
    else if (s === 'rex') {
        const body = main('#8caa65'), belly = second('#cfcd9a');
        ball([0, .85, -.07], [.51, .72, .7], body);
        ball([0, 1.29, .38], [.32, .5, .34], body);
        box([0, 1.54, .63], [.59, .42, .76], body);
        box([0, 1.34, .69], [.53, .1, .69], belly);
        for (const sg of [-1, 1]) {
            ball([sg * .37, .38, -.01], [.25, .41, .29], body, sg === -1 ? 'legL' : 'legR');
            box([sg * .37, .09, .21], [.38, .17, .6], body, [0, 0, 0], sg === -1 ? 'legL' : 'legR');
            box([sg * .36, 1, .45], [.13, .3, .15], body, [-.7, 0, sg * .3], sg === -1 ? 'armL' : 'armR');
            for (let i = 0; i < 3; i++)
                cone([sg * .25, 1.35, .45 + i * .22], [.045, .15, .045], white, [Math.PI, 0, 0]);
            ball([sg * .32, 1.66, .65], [.077, .075, .11], white);
            ball([sg * .37, 1.67, .7], [.035, .04, .065], dark);
            if (v === 1) {
                box([sg * .75, 1.25, -.1], [1.0, .05, .6], belly, [0, sg * .2, sg * .35], sg < 0 ? 'wingL' : 'wingR', [sg * .3, 1.2, -.1]);
                cone([sg * .18, 1.85, .5], [.06, .3, .06], white, [-.5, 0, sg * .3]);
            }
        }
        add('cone', [0, .56, -.93], [.3, 1.35, .3], body, [-Math.PI / 2 - .18, 0, 0], 'tail');
        ball([0, .67, .4], [.31, .48, .11], belly);
        for (let i = 0; i < 4; i++)
            cone([0, 1.1 - i * .16, -.48 - i * .2], [.075, .2, .075], v === 1 ? belly : accent);
        top = [0, 1.76, .6];
    }
    else if (s === 'bird') {
        const body = main('#eec34f'), wing = second(shade(body, .9)), beak = v === 4 ? '#3f3f3f' : '#e78e35';
        if (v === 5) {
            ball([0, .7, 0], [.42, .62, .4], body);
            ball([0, .7, .2], [.3, .48, .25], second('#f2f2f0'));
            ball([0, 1.35, .05], [.27, .27, .27], body);
            cone([0, 1.32, .33], [.06, .16, .06], beak, [Math.PI / 2, 0, 0]);
            for (const sg of [-1, 1]) {
                ball([sg * .43, .75, 0], [.1, .38, .2], body, sg < 0 ? 'wingL' : 'wingR');
                box([sg * .15, .05, .12], [.17, .06, .28], '#e78e35', [0, 0, 0], sg < 0 ? 'legL' : 'legR');
            }
            eyes(.11, 1.42, .23, .05);
            top = [0, 1.62, .05];
        }
        else {
            ball([0, .6, -.04], [.45, .48, .55], body);
            if (v === 3) {
                cyl([0, 1.05, .32], [.1, .7, .1], body, [.35, 0, 0]);
                ball([0, 1.45, .46], [.17, .17, .2], second('#2b2b2b'));
                box([0, 1.42, .66], [.13, .07, .22], beak);
                for (const sg of [-1, 1])
                    ball([sg * .1, 1.5, .55], [.03, .03, .03], white);
                top = [0, 1.62, .46];
            }
            else {
                ball([0, 1.06, .22], [.29, .34, .3], body);
                box([0, .99, .56], [.34, .11, .31], beak);
                for (const sg of [-1, 1])
                    ball([sg * .25, 1.13, .4], [.065, .07, .07], dark);
                top = [0, 1.4, .2];
            }
            for (const sg of [-1, 1]) {
                box([sg * .16, .17, .02], [.065, .29, .07], '#d58b3b', [0, 0, 0], sg === -1 ? 'legL' : 'legR');
                box([sg * .16, .04, .15], [.2, .07, .3], '#d58b3b', [0, 0, 0], sg === -1 ? 'legL' : 'legR');
                ball([sg * .4, .62, -.06], [.13, .32, .38], wing, sg === -1 ? 'wingL' : 'wingR');
            }
            cone([0, .85, -.59], [.2, .43, .2], v === 2 ? wing : body, [-.9, 0, 0]);
            if (v === 1)
                for (let i = 0; i < 3; i++)
                    ball([0, 1.37, .09 + i * .13], [.08, .16, .1], '#d95743');
            if (v === 2) {
                for (let i = 0; i < 5; i++)
                    glow('cone', [(i - 2) * .12, .9, -.85], [.07, .6, .07], i % 2 ? wing : body, [-1.1, 0, (i - 2) * .2]);
                for (let i = 0; i < 3; i++)
                    glow('cone', [0, 1.42 + i * .03, .1 + i * .12], [.05, .25, .05], wing, [-.3, 0, 0]);
            }
            if (v === 4)
                ball([0, .95, .38], [.22, .14, .1], second('#6d8f84'));
        }
        box([0, .6, .47], [.16, .14, .02], accent);
    }
    else if (s === 'ant') {
        const body = main('#493f39'), bee = v === 1, cray = v === 2;
        ball([0, .4, -.6], [.42, .42, .5], body);
        ball([0, .4, .03], [.29, .29, .3], body);
        ball([0, .47, .51], [.36, .33, .35], body);
        if (bee) {
            for (let i = 0; i < 3; i++)
                box([0, .4, -.75 + i * .22], [.86, .86, .07], second('#2b2622'));
            for (const sg of [-1, 1])
                glow('box', [sg * .38, .85, -.1], [.6, .03, .38], '#e8f2f6', [0, 0, sg * .3], sg < 0 ? 'wingL' : 'wingR');
        }
        for (const sg of [-1, 1])
            for (let i = 0; i < 3; i++)
                box([sg * .46, .24, -.3 + i * .3], [.77, .09, .1], body, [0, sg * .35 * (i - 1), sg * -.42], sg === -1 ? 'legL' : 'legR');
        if (cray)
            for (const sg of [-1, 1]) {
                box([sg * .35, .45, .95], [.12, .12, .5], body, [0, -sg * .3, 0], sg < 0 ? 'armL' : 'armR');
                ball([sg * .45, .48, 1.25], [.17, .12, .25], second(body), sg < 0 ? 'armL' : 'armR');
            }
        eyes(.16, .58, .81, .083);
        for (const sg of [-1, 1])
            box([sg * .2, .8, .64], [.05, .49, .05], body, [-.3, 0, sg * -.4]);
        ball([0, .45, -.11], [.31, .3, .15], accent);
        top = [0, .82, .5];
    }
    else if (s === 'shark') {
        const body = main('#779eaf');
        if (v === 2) {
            ball([0, .7, 0], [.45, .45, 1.05], body);
            cyl([0, 1.15, .1], [.18, .35, .3], body);
            cyl([0, 1.5, .2], [.03, .4, .03], dark);
            for (let i = 0; i < 3; i++)
                glow('sphere', [.44, .75, .45 - i * .35], [.03, .1, .1], '#c8ecff');
            box([0, .7, -1.08], [.6, .05, .05], dark, [0, 0, 0], 'rotor', [0, .7, -1.08]);
            eyes(.2, .9, .95, .06);
        }
        else {
            ball([0, .7, 0], [.38, .4, 1], body);
            ball([0, .56, .25], [.32, .2, .78], v === 1 ? second(white) : white);
            cone([0, .7, 1], [.31, .6, .29], body, [Math.PI / 2, 0, 0]);
            if (v === 1)
                for (let i = 0; i < 6; i++) {
                    const a = i / 6 * Math.PI * 2;
                    cone([Math.sin(a) * .45, .35, Math.cos(a) * .5 - .2], [.1, .9, .1], second(body), [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2], 'tail');
                }
            else {
                cone([0, 1.21, -.12], [.14, .68, .4], body, [-.15, 0, 0]);
                for (const sg of [-1, 1])
                    cone([sg * .54, .61, .12], [.19, .8, .29], body, [0, 0, -sg * 1.12]);
                add('cone', [0, .76, -1.04], [.1, .95, .32], body, [0, 0, .3], 'tail');
            }
            eyes(.26, .79, .79, .064);
            box([0, .48, .9], [.36, .05, .08], dark);
        }
        box([0, 1.02, .07], [.15, .03, .22], accent);
        top = [0, 1.15, .1];
    }
    else if (s === 'helicopter') {
        const body = main('#8caa97');
        if (v === 1) {
            box([0, .8, 0], [.6, .25, .6], body);
            for (const a of [.785, 2.356, 3.927, 5.498]) {
                box([Math.sin(a) * .45, .85, Math.cos(a) * .45], [.08, .05, .6], dark, [0, a, 0]);
                cyl([Math.sin(a) * .7, .92, Math.cos(a) * .7], [.25, .02, .25], second(dark));
            }
            box([0, .5, 0], [.4, .35, .4], '#b88a5a');
            eyes(.12, .82, .31, .05);
        }
        else {
            ball([0, .8, .13], [.55, .52, .88], body);
            ball([0, .93, .64], [.46, .33, .45], '#435a63');
            box([0, .72, -1.13], [.17, .18, 1.25], body);
            box([0, .92, -1.73], [.1, .65, .36], body);
            cyl([0, 1.45, 0], [.05, .35, .05], dark);
            box([0, 1.64, 0], [2.9, .04, .14], dark, [0, 0, 0], 'rotor');
            box([0, 1.65, 0], [.14, .04, 2.9], dark, [0, 0, 0], 'rotor');
            for (const sg of [-1, 1]) {
                box([sg * .43, .12, .04], [.07, .09, 1.4], dark);
                box([sg * .43, .29, .25], [.065, .39, .06], dark);
            }
            box([0, .46, .89], [.13, .14, .42], dark);
        }
        box([-.51, .8, .02], [.02, .3, .35], accent);
        top = [0, 1.7, 0];
    }
    else if (s === 'car') {
        const body = main('#aeb8bb'), trim = second(dark);
        const wheel = (x, y, z, r, w) => { cyl([x, y, z], [r, w, r], dark, [0, 0, Math.PI / 2]); cyl([x + Math.sign(x) * w * .55, y, z], [r * .45, .02, r * .45], metal, [0, 0, Math.PI / 2]); };
        if (v === 4) {
            for (const sg of [-1, 1])
                box([sg * .45, .75, 0], [.03, .55, 1.2], metal);
            box([0, .75, .6], [.9, .55, .03], metal);
            box([0, .75, -.6], [.9, .55, .03], metal);
            box([0, .5, 0], [.9, .03, 1.2], metal);
            box([0, .9, -.75], [.8, .06, .06], trim);
            for (const sg of [-1, 1])
                for (const z of [-.5, .5])
                    wheel(sg * .38, .12, z, .1, .06);
            eyes(.2, .95, .63, .08);
        }
        else if (v === 5) {
            box([0, .2, 0], [.35, .08, 1.3], body);
            cyl([0, .75, .55], [.04, 1.1, .04], metal, [-.2, 0, 0]);
            box([0, 1.3, .66], [.6, .06, .06], trim);
            wheel(.0001, .14, .62, .14, .1);
            wheel(.0001, .14, -.62, .14, .1);
            eyes(.08, 1.05, .67, .05);
        }
        else {
            const tall = v === 3 || v === 7, lift = v === 1 ? .55 : 0, len = v === 3 ? 2.3 : v === 7 ? 2.0 : 1.8;
            box([0, .49 + lift, 0], [1.02, .43, len], body);
            box([0, (tall ? .95 : .84) + lift, tall ? -.05 : -.11], [.95, tall ? .55 : .32, tall ? len * .92 : .99], v === 3 ? second('#f2f2f2') : body);
            if (tall)
                for (const sg of [-1, 1])
                    for (let i = 0; i < 4; i++)
                        box([sg * .48, 1.0 + lift, -len * .32 + i * len * .2], [.02, .22, len * .14], '#37464b');
            box([0, (tall ? 1.0 : .88) + lift, len * .2], [.81, .23, .06], '#37464b', [-.35, 0, 0]);
            if (v === 2) {
                box([0, 1.25, -.35], [.7, .7, .7], second('#e8b23c'));
                cyl([.3, 1.2, .6], [.05, .6, .05], dark);
                wheel(.55, .55, -.55, .55, .3);
                wheel(-.55, .55, -.55, .55, .3);
                wheel(.55, .3, .65, .3, .2);
                wheel(-.55, .3, .65, .3, .2);
            }
            else if (v === 6) {
                cyl([0, .45, .95], [.45, 1.2, .45], second(metal), [0, 0, Math.PI / 2]);
                wheel(.55, .4, -.55, .4, .2);
                wheel(-.55, .4, -.55, .4, .2);
            }
            else {
                const r = v === 1 ? .55 : .3;
                for (const sg of [-1, 1])
                    for (const z of [-len * .33, len * .34])
                        wheel(sg * (v === 1 ? .6 : .53), r, z, r, v === 1 ? .3 : .16);
            }
            box([0, .65 + lift, len / 2 + .04], [.88, .045, .035], white);
            box([0, .31 + lift, len / 2 + .03], [1.01, .14, .09], trim);
            box([0, .65 + lift, -len / 2 - .03], [.86, .05, .04], accent);
            if (v === 3 && f.element === 'ice')
                ball([0, 1.45, .2], [.25, .3, .25], '#f3e4ec');
        }
        top = [0, 1.25, 0];
    }
    else if (s === 'toaster') {
        const body = main('#b6c8ca');
        box([0, .57, 0], [1.02, .92, .67], body);
        box([0, .09, 0], [1.09, .11, .73], dark);
        for (const z of [-.14, .15]) {
            box([0, 1.04, z], [.7, .025, .085], dark);
            box([0, 1.14, z], [.6, .31, .06], '#c59253');
            box([0, 1.15, z + .037], [.47, .2, .016], '#edcb91');
        }
        eyes(.21, .65, .355, .086);
        box([0, .38, .345], [.17, .046, .03], dark);
        box([.59, .73, 0], [.17, .08, .11], dark);
        for (const sg of [-1, 1])
            box([sg * .33, .07, .13], [.24, .12, .33], dark, [0, 0, 0], sg === -1 ? 'legL' : 'legR');
        box([0, .22, .345], [.31, .055, .03], accent);
        top = [0, 1.3, 0];
    }
    else if (s === 'hamster') {
        const body = main('#c89c73'), belly = second(white);
        if (v === 1) {
            ball([0, .45, 0], [.55, .4, .5], body);
            ball([0, .4, .25], [.42, .25, .3], belly);
            for (const sg of [-1, 1]) {
                ball([sg * .22, .85, .25], [.15, .15, .15], body);
                ball([sg * .22, .88, .36], [.08, .08, .05], dark);
                ball([sg * .45, .12, .2], [.2, .08, .25], body, sg < 0 ? 'legL' : 'legR');
                ball([sg * .4, .2, -.25], [.2, .15, .3], body, sg < 0 ? 'legR' : 'legL');
            }
            box([0, .5, .5], [.5, .03, .03], dark);
            top = [0, 1.0, .1];
        }
        else {
            ball([0, .63, 0], [.52, .63, .54], body);
            ball([0, .96, .21], [.42, .44, .38], body);
            ball([0, .62, .42], [.37, .42, .14], belly);
            for (const sg of [-1, 1]) {
                if (v === 2) {
                    ball([sg * .17, 1.55, 0], [.09, .35, .06], body);
                    ball([sg * .17, 1.55, .04], [.05, .28, .02], '#dfaf9e');
                }
                else {
                    ball([sg * .29, 1.32, .12], [.19, .21, .1], body);
                    ball([sg * .29, 1.33, .2], [.12, .14, .05], '#dfaf9e');
                }
                ball([sg * .3, .91, .47], [.18, .2, .14], white);
                ball([sg * .26, .12, .12], [.17, .15, .23], body, sg === -1 ? 'legL' : 'legR');
                ball([sg * .48, .61, .19], [.13, .22, .13], body, sg === -1 ? 'armL' : 'armR');
            }
            eyes(.19, 1.12, .52, .092);
            ball([0, .97, .6], [.08, .06, .07], '#b2766c');
            top = [0, 1.42, .1];
        }
        box([0, .44, .54], [.16, .12, .035], accent);
    }
    else if (s === 'quad') {
        // Four-legged animals: dog base with variants (horse, wooden horse, cat, bear, goat, capybara, moose).
        const body = main('#8a6a4a'), alt = second(shade(body, .8)), wood = v === 2;
        const legLen = v === 1 || v === 2 || v === 7 ? .95 : v === 4 || v === 6 ? .5 : .7, hip = legLen + .05;
        const torso = v === 4 ? [.5, .45, .7] : v === 6 ? [.45, .38, .7] : v === 3 ? [.3, .28, .6] : [.4, .38, .72];
        const bodyY = hip + torso[1] * .55;
        if (wood) {
            box([0, bodyY, 0], [torso[0] * 2, torso[1] * 1.7, torso[2] * 2.1], body);
            for (let i = 0; i < 3; i++)
                ball([(i - 1) * .18, bodyY + .05, torso[2] * 1.06], [.08, .12, .02], alt);
            for (const sg of [-1, 1])
                for (let i = 0; i < 3; i++)
                    ball([sg * torso[0] * 1.02, bodyY + .05, (i - 1) * .35], [.02, .13, .12], i === 1 ? '#3f7a9a' : alt);
        }
        else
            ball([0, bodyY, 0], torso, body);
        if (v === 7)
            ball([0, bodyY + .25, .35], [.36, .3, .38], body);
        const hx = 0, hy = bodyY + (v === 6 ? .1 : v === 4 ? .15 : .42), hz = torso[2] + (v === 6 ? .18 : .1);
        if (v !== 6 && v !== 4)
            (wood ? box : (p, sc, c) => ball(p, sc, c))([0, bodyY + .25, torso[2] * .8], wood ? [.3, .55, .3] : [.19, .32, .2], body, wood ? [-.5, 0, 0] : undefined);
        const headScale = v === 4 ? [.3, .27, .3] : v === 3 ? [.2, .18, .18] : v === 6 ? [.27, .24, .3] : [.22, .22, .3];
        (wood ? box : ball)([hx, hy, hz], wood ? [headScale[0] * 1.8, headScale[1] * 1.8, headScale[2] * 2.2] : headScale, body, wood ? [0, 0, 0] : 'head', wood ? 'head' : undefined);
        const snout = v === 7 ? [.17, .17, .26] : v === 6 ? [.2, .18, .2] : v === 3 ? [.09, .08, .07] : [.13, .12, .17];
        if (wood)
            box([0, hy - .05, hz + .3], [.25, .22, .25], body, [0, 0, 0], 'head');
        else
            ball([0, hy - .06, hz + headScale[2] * .85], snout, v === 6 || v === 4 ? shade(body, .7) : alt, 'head');
        ball([0, hy - .02, hz + headScale[2] * .85 + snout[2] * .9], [.05, .04, .03], dark, 'head');
        eyes(headScale[0] * .55, hy + headScale[1] * .3, hz + headScale[2] * .75, .045 + headScale[0] * .08, 'head');
        if (v === 1 || v === 2)
            for (let i = 0; i < 5; i++)
                box([0, bodyY + .35 + i * .06, torso[2] * .55 + i * .1], [.06, .14, .1], alt, [-.5, 0, 0]);
        if (v === 5)
            cone([0, hy - .25, hz + .15], [.07, .2, .07], alt, [Math.PI, 0, 0], 'head');
        if (v === 5 || wood)
            for (const sg of [-1, 1])
                box([sg * (torso[0] + .01), bodyY, 0], [.02, .12, torso[2] * 1.6], second('#c8262b'));
        for (const [x, z, j] of [[-1, 1, 'legL'], [1, -1, 'legL'], [1, 1, 'legR'], [-1, -1, 'legR']]) {
            const lx = x * torso[0] * .6, lz = z * torso[2] * .6, pv = [lx, hip, lz], w = v === 4 ? .17 : v === 3 ? .07 : .1;
            box([lx, hip / 2, lz], [w, hip, w], wood ? body : shade(body, .9), [0, 0, 0], j, pv);
            box([lx, .04, lz + .03], [w * 1.2, .08, w * 1.4], v === 3 || v === 4 ? shade(body, .7) : dark, [0, 0, 0], j, pv);
        }
        if (v === 3)
            cone([0, bodyY + .35, -torso[2] - .15], [.05, .7, .05], body, [-.4, 0, 0], 'tail');
        else if (v !== 6)
            cone([0, bodyY + .05, -torso[2] - .1], [.07, .35, .07], wood ? body : alt, [-2.2, 0, 0], 'tail');
        if (v === 7)
            ball([0, hy - .3, hz + .05], [.06, .14, .06], alt, 'head');
        box([0, bodyY + torso[1] * .9, 0], [.12, .02, torso[2] * 1.2], accent);
        top = [hx, hy + headScale[1], hz];
        hs = headScale[0] / .22;
        topJoint = wood ? 'none' : 'head';
    }
    else if (s === 'cloud') {
        const c1 = main('#e6e8ea'), c2 = second(shade(c1, .85));
        if (v === 1) {
            glow('sphere', [0, .9, 0], [.55, .55, .55], c1);
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2;
                glow('cone', [Math.sin(a) * .8, .9 + Math.cos(a) * .8, 0], [.11, .3, .11], c2, [0, 0, -a], 'rotor');
            }
            eyes(.18, 1.0, .5, .08);
            top = [0, 1.45, 0];
        }
        else if (v === 2) {
            ball([0, 1.65, 0], [.72, .82, .72], c1);
            for (let i = 0; i < 6; i++)
                ball([Math.sin(i * 1.047) * .62, 1.7, Math.cos(i * 1.047) * .62], [.14, .6, .14], c2);
            for (const sg of [-1, 1])
                for (const z of [-1, 1])
                    cyl([sg * .2, .75, z * .2], [.012, .6, .012], dark);
            box([0, .3, 0], [.5, .36, .5], '#a5774a');
            eyes(.25, 1.7, .66, .1);
            top = [0, 2.45, 0];
        }
        else if (v === 3) {
            for (let i = 0; i < 3; i++)
                box([0, .7, 0], [.9, .07, .07], c1, [0, 0, i * 1.047]);
            glow('sphere', [0, .7, 0], [.14, .14, .14], c2);
            eyes(.07, .72, .08, .04);
            top = [0, 1.1, 0];
        }
        else {
            ball([0, .9, 0], [.6, .42, .5], c1);
            ball([-.48, .8, 0], [.4, .32, .38], c1);
            ball([.48, .8, .05], [.42, .34, .4], c1);
            ball([0, 1.2, -.05], [.42, .38, .4], c1);
            ball([0, .66, 0], [.75, .2, .45], c2);
            eyes(.18, 1.0, .47, .08);
            if (f.element === 'electric')
                for (const sg of [-1, 1])
                    glow('box', [sg * .3, .3, .2], [.06, .4, .06], '#ffe14d', [0, 0, sg * .5]);
            top = [0, 1.5, 0];
        }
    }
    else if (s === 'can') {
        const body = main('#b9c2c6'), label = second(accent);
        if (v === 3) {
            cyl([0, .2, 0], [.62, .32, .62], body);
            cyl([0, .37, 0], [.58, .03, .58], label);
            eyes(.16, .42, .45, .07);
            if (f.element === 'earth')
                box([.35, .25, .4], [.4, .3, .25], second('#e2a93a'), [0, .7, 0]);
            top = [0, .4, 0];
        }
        else if (v === 2) {
            cyl([0, .9, 0], [.32, 1.4, .32], body);
            cone([0, 1.9, 0], [.32, .6, .32], label);
            glow('cylinder', [0, 1.2, .3], [.12, .04, .12], '#8fd3e8', [Math.PI / 2, 0, 0]);
            for (let i = 0; i < 3; i++) {
                const a = i * 2.094;
                box([Math.sin(a) * .38, .35, Math.cos(a) * .38], [.04, .5, .3], label, [0, a, 0]);
            }
            glow('cone', [0, .1, 0], [.2, .3, .2], '#ff9a3d', [Math.PI, 0, 0]);
            eyes(.1, 1.45, .3, .06);
            top = [0, 2.2, 0];
        }
        else {
            const r = v === 5 ? .45 : .42, hgt = v === 5 ? .7 : 1.0, y = v === 5 ? .42 : .55;
            cyl([0, y, 0], [r, hgt, r], body);
            if (v !== 5)
                cyl([0, y, 0], [r + .006, hgt * .45, r + .006], label);
            cyl([0, y + hgt / 2 + .02, 0], [r * .95, .04, r * .95], v === 1 ? '#4a2c1d' : shade(body, .8));
            if (v === 1)
                add('ring', [r + .12, y + .05, 0], [.18, .18, .18], body, [Math.PI / 2, 0, 0]);
            if (v === 5) {
                cyl([.55, .55, 0], [.06, .45, .06], body, [0, 0, -.9]);
                cyl([0, .85, 0], [.05, .12, .05], label);
            }
            if (f.traits.includes('explosive') && f.element === 'electric')
                cyl([0, y + hgt / 2 + .08, 0], [.12, .1, .12], metal);
            eyes(.14, y + .15, r - .01, .075);
            arms(r + .08, y - .05, .07, body);
            top = [0, y + hgt / 2 + .05, 0];
        }
        feet(.18, .05, .1, dark);
    }
    else if (s === 'lamp') {
        const body = main('#f2efe6');
        if (v === 1) {
            cyl([0, 1.3, 0], [.07, 2.6, .07], body);
            box([0, 2.1, 0], [1.3, .08, .08], body);
            for (const sg of [-1, 1])
                add('ring', [sg * .55, 1.75, 0], [.25, .25, .25], second('#f2d24b'), [Math.PI / 2, 0, 0], sg < 0 ? 'armL' : 'armR', [sg * .55, 2.05, 0]);
            for (let i = 0; i < 6; i++)
                ball([Math.sin(i) * .1, 1.2 + i * .2, Math.cos(i) * .1], [.1, .1, .1], i % 2 ? '#7cc24f' : '#e98fd0');
            eyes(.06, 1.6, .07, .045);
            top = [0, 2.6, 0];
        }
        else {
            cyl([0, .05, 0], [.38, .08, .38], second(dark));
            cyl([0, .7, 0], [.04, 1.3, .04], metal);
            cone([0, 1.5, 0], [.45, .5, .45], body);
            glow('sphere', [0, 1.26, 0], [.13, .13, .13], '#ffe9a8');
            eyes(.13, 1.42, .3, .06);
            top = [0, 1.75, 0];
        }
        feet(.22, .05, .09, dark);
    }
    else if (s === 'ghost') {
        const body = main('#eef0f2');
        if (v === 1) {
            ball([0, 1.05, 0], [.5, .38, .5], body);
            ball([0, .85, 0], [.48, .08, .48], second(body));
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2;
                cyl([Math.sin(a) * .3, .45, Math.cos(a) * .3], [.04, .7, .04], second(body), [0, 0, 0], i % 2 ? 'tail' : 'none');
            }
            eyes(.15, 1.08, .45, .06);
            top = [0, 1.43, 0];
        }
        else if (v === 2) {
            box([0, .75, 0], [.35, .9, .3], body);
            box([0, .3, .15], [.35, .3, .55], body);
            box([0, 1.05, 0], [.36, .12, .31], second('#c9423a'));
            box([0, .3, .42], [.36, .28, .06], second('#c9423a'));
            eyes(.08, .85, .16, .05);
            top = [0, 1.2, 0];
        }
        else {
            ball([0, 1.05, 0], [.45, .5, .42], body);
            cone([0, .6, 0], [.5, 1.0, .46], body);
            for (const sg of [-1, 1])
                ball([sg * .14, 1.1, .38], [.07, .11, .05], dark);
            ball([0, .9, .4], [.07, .09, .04], dark);
            arms(.5, .85, .1, body);
            top = [0, 1.55, 0];
        }
    }
    else if (s === 'fruit') {
        const body = main('#d9423a'), alt = second('#4f8a3a');
        if (v === 1) {
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2;
                ball([Math.cos(a) * .4, .62 + Math.sin(a) * .4, 0], [.24, .24, .24], body);
                ball([Math.cos(a) * .4, .62 + Math.sin(a) * .4, .1], [.2, .2, .18], alt);
            }
            for (let i = 0; i < 8; i++)
                box([Math.cos(i) * .45, .62 + Math.sin(i) * .45, .28], [.08, .025, .02], ['#f2f2f0', '#7cc2e8', '#f2d24b'][i % 3], [0, 0, i]);
            eyes(.12, 1.0, .25, .06);
            top = [0, 1.2, 0];
        }
        else if (v === 2 || v === 3) {
            ball([0, .4, 0], [.55, .35, .55], body);
            if (v === 2)
                for (let i = 0; i < 9; i++) {
                    const a = i * .9, r = .1 + i * .045;
                    ball([Math.cos(a) * r, .68, Math.sin(a) * r], [.1, .05, .1], alt);
                }
            else {
                ball([0, .78, 0], [.42, .22, .42], alt);
                ball([0, .95, 0], [.32, .14, .32], body);
                ball([0, 1.02, 0], [.25, .06, .25], '#fbf7ef');
            }
            eyes(.17, .45, .5, .07);
            top = [0, v === 3 ? 1.08 : .78, 0];
        }
        else if (v === 4) {
            ball([0, .55, 0], [.36, .5, .36], body);
            eyes(.12, .65, .32, .06);
            top = [0, 1.05, 0];
        }
        else {
            const lumpy = v === 7 || v === 8;
            ball([0, .55, 0], [.5, .5, .5], body);
            if (lumpy)
                for (let i = 0; i < 9; i++) {
                    const a = i * 2.4, y = .3 + (i % 3) * .25;
                    ball([Math.sin(a) * .42, y, Math.cos(a) * .42], [.17, .15, .17], v === 8 ? body : shade(body, 1.15));
                }
            if (v === 8)
                ball([0, .2, .1], [.3, .15, .3], alt);
            if (v === 5) {
                for (let i = 0; i < 12; i++)
                    box([Math.sin(i * 1.3) * .5, .25 + (i % 4) * .18, Math.cos(i * 1.3) * .5], [.06, .06, .02], shade(body, .7), [0, i * 1.3, .78]);
                for (let i = 0; i < 6; i++)
                    cone([Math.sin(i) * .08, 1.25, Math.cos(i) * .08], [.07, .5, .07], alt, [Math.sin(i) * .4, 0, Math.cos(i) * .4]);
            }
            if (v === 6) {
                box([0, .38, .48], [.28, .07, .04], dark);
                eyes(.17, .65, .44, .09);
            }
            else
                eyes(.17, .65, .44, .07);
            if (v === 7)
                ball([0, 1.0, 0], [.2, .1, .2], alt);
            top = [0, 1.05, 0];
        }
        feet(.2, .05, .1, shade(body, .6));
        if (f.hat === 'leaf' || v === 0 && !f.traits.includes('tiny')) {
            cyl([0, 1.1, 0], [.03, .16, .03], '#5a4630');
            box([.12, 1.15, 0], [.24, .02, .12], alt, [0, 0, .4]);
        }
    }
    else if (s === 'worm') {
        const body = main('#d98a8a'), alt = second(shade(body, .8));
        if (v === 1) {
            for (let i = 0; i < 9; i++) {
                const a = -Math.PI * .1 + i / 8 * Math.PI * 1.2;
                ball([Math.cos(a) * .6, .32, Math.sin(a) * .6 - .1], [.27, .27, .27], body, i > 5 ? 'tail' : 'none');
            }
            for (const a of [-Math.PI * .1, Math.PI * 1.1])
                cyl([Math.cos(a) * .6, .32, Math.sin(a) * .6 - .1], [.12, .1, .12], alt, [0, 0, Math.PI / 2]);
            eyes(.12, .5, .7, .06);
            top = [0, .6, .5];
        }
        else if (v === 2 || v === 3 || v === 4) {
            const n = 7;
            for (let i = 0; i < n; i++) {
                const t = i / (n - 1), y = .35 + (v === 3 ? Math.sin(t * Math.PI) * .5 : 0), r = v === 4 ? .22 * (1 - t * .7) : .2;
                ball([0, y, .7 - t * 1.4], [r, r, r * 1.2], body, t > .6 ? 'tail' : 'none');
            }
            if (v === 4)
                cyl([0, .38, .85], [.08, .2, .08], alt, [Math.PI / 2, 0, 0]);
            if (v === 3)
                cyl([0, .38, .78], [.06, .12, .06], alt, [Math.PI / 2, 0, 0]);
            eyes(.09, v === 3 ? .5 : .45, .55, .055);
            top = [0, .7, .5];
        }
        else {
            for (let i = 0; i < 6; i++) {
                const r = .26 * (1 - i * .09);
                ball([0, r + .02, .65 - i * .3], [r, r, r], i % 2 ? alt : body, i >= 3 ? 'tail' : i === 0 ? 'head' : 'none');
            }
            eyes(.1, .4, .86, .06, 'head');
            top = [0, .55, .65];
        }
    }
    else if (s === 'crate') {
        const body = main('#c49a6c'), alt = second(shade(body, .75));
        if (v === 1) {
            box([0, .95, 0], [.85, 1.8, .6], body);
            box([0, .95, .31], [.015, 1.7, .01], alt);
            for (const sg of [-1, 1])
                box([sg * .08, 1.0, .32], [.03, .25, .03], metal);
            eyes(.2, 1.45, .31, .08);
            arms(.5, .9, .09, body);
            top = [0, 1.85, 0];
        }
        else if (v === 2) {
            box([0, .7, 0], [.95, .75, .12], body);
            box([0, .72, .065], [.85, .55, .01], alt);
            for (const sg of [-1, 1])
                box([sg * .2, .45, .08], [.25, .1, .02], sg < 0 ? accent : body);
            eyes(.15, .82, .08, .07);
            box([0, .2, 0], [.08, .3, .08], dark);
            top = [0, 1.1, 0];
        }
        else if (v === 3) {
            box([0, .5, 0], [.8, .5, .08], body);
            box([0, .62, .045], [.6, .04, .01], alt, [0, 0, .5]);
            box([0, .62, .045], [.6, .04, .01], alt, [0, 0, -.5]);
            glow('box', [.3, .7, .05], [.1, .1, .01], alt);
            eyes(.12, .45, .05, .06);
            top = [0, .76, 0];
        }
        else if (v === 5) {
            for (let i = 0; i < 4; i++) {
                box([0, .15 + i * .2, 0], [.95, .12, .7], i % 2 ? body : alt, [0, i * .2, 0]);
                for (let k = 0; k < 4; k++)
                    ball([(k - 1.5) * .2, .21 + i * .2, .1], [.03, .01, .03], shade(body, .6));
            }
            eyes(.18, .5, .36, .07);
            top = [0, .9, 0];
        }
        else {
            const hgt = v === 6 ? .5 : .9;
            box([0, hgt / 2 + .1, 0], [.9, hgt, .9], body);
            if (v === 0)
                box([0, hgt / 2 + .1, 0], [.92, .12, .92], alt);
            if (v === 4) {
                cyl([0, .58, .45], [.28, .04, .28], dark, [Math.PI / 2, 0, 0]);
                glow('cylinder', [0, .58, .47], [.22, .02, .22], alt, [Math.PI / 2, 0, 0], 'rotor');
                box([0, .95, .3], [.8, .08, .3], shade(body, .9));
            }
            if (v === 6)
                for (const x of [-.22, .22])
                    for (const z of [-.22, .22])
                        cyl([x, hgt + .15, z], [.13, .1, .13], body);
            eyes(.2, v === 6 ? .38 : .78, .455, .08);
            arms(.52, .55, .09, body);
            top = [0, hgt + .15, 0];
        }
        feet(.22, .05, .1, dark);
    }
    else if (s === 'tree') {
        const leaf = main('#4f8a3a'), alt = second(shade(leaf, 1.25));
        if (v === 3) {
            cyl([0, .75, 0], [.28, 1.3, .28], leaf);
            ball([0, 1.4, 0], [.28, .2, .28], leaf);
            for (const sg of [-1, 1]) {
                cyl([sg * .45, .8, 0], [.13, .2, .13], leaf, [0, 0, Math.PI / 2], sg < 0 ? 'armL' : 'armR', [sg * .3, .8, 0]);
                cyl([sg * .58, 1.0, 0], [.12, .45, .12], leaf, [0, 0, 0], sg < 0 ? 'armL' : 'armR', [sg * .3, .8, 0]);
            }
            ball([0, 1.6, 0], [.12, .08, .12], alt);
            for (let i = 0; i < 10; i++)
                box([Math.sin(i * 2.4) * .29, .3 + i * .1, Math.cos(i * 2.4) * .29], [.02, .02, .1], white, [0, i * 2.4, 0]);
            eyes(.1, 1.1, .27, .055);
            top = [0, 1.62, 0];
        }
        else if (v === 2) {
            cyl([0, .4, 0], [.2, .8, .2], alt);
            for (let i = 0; i < 9; i++) {
                const a = i * 2.4, r = i === 0 ? 0 : .32;
                ball([Math.sin(a) * r, 1.0 + (i % 3) * .08, Math.cos(a) * r], [.3, .26, .3], leaf);
            }
            eyes(.09, .55, .19, .05);
            top = [0, 1.35, 0];
        }
        else {
            cyl([0, .45, 0], [.14, .9, .14], '#6b4c35');
            if (v === 1)
                for (let i = 0; i < 3; i++)
                    cone([0, .9 + i * .38, 0], [.62 - i * .15, .55, .62 - i * .15], leaf);
            else {
                ball([0, 1.25, 0], [.6, .55, .6], leaf);
                for (const sg of [-1, 1])
                    ball([sg * .38, 1.05, 0], [.4, .38, .4], alt, sg < 0 ? 'armL' : 'armR', [sg * .1, .9, 0]);
            }
            eyes(.07, .6, .13, .045);
            top = [0, v === 1 ? 2.05 : 1.75, 0];
        }
        feet(.18, .05, .1, '#6b4c35');
    }
    else if (s === 'vortex') {
        const c1 = main('#9aa3a8'), c2 = second(shade(c1, .85));
        if (v === 1) {
            for (let i = 0; i < 8; i++) {
                const a = i / 8 * Math.PI * 2, k = .4 + i / 8 * .6;
                glow('sphere', [Math.sin(a) * .6, 1.0, Math.cos(a) * .6], [.12 * k + .03, .12 * k + .03, .12 * k + .03], i > 4 ? c1 : c2, [0, 0, 0], 'rotor');
            }
            eyes(.12, 1.0, .1, .07);
            top = [0, 1.25, 0];
        }
        else {
            for (let i = 0; i < 7; i++)
                cyl([0, .12 + i * .3, 0], [.14 + i * .14, .26, .14 + i * .14], i % 2 ? c1 : c2, [0, 0, 0], 'rotor');
            for (let i = 0; i < 4; i++)
                box([Math.sin(i * 1.57) * 1.1, .8 + i * .3, Math.cos(i * 1.57) * 1.1], [.12, .12, .12], '#7a6a55', [i, i, 0], 'rotor');
            eyes(.15, 1.3, .55, .08);
            top = [0, 2.2, 0];
        }
    }
    else if (s === 'snowman') {
        const snow = main('#f4f6f8');
        ball([0, .42, 0], [.45, .42, .45], snow);
        ball([0, 1.0, 0], [.33, .31, .33], snow);
        ball([0, 1.45, 0], [.24, .23, .24], snow);
        cone([0, 1.44, .3], [.05, .22, .05], '#e8752f', [Math.PI / 2, 0, 0]);
        for (const sg of [-1, 1]) {
            ball([sg * .08, 1.52, .21], [.03, .03, .03], dark);
            box([sg * .5, 1.05, 0], [.5, .03, .03], '#6b4c35', [0, 0, sg * .4], sg < 0 ? 'armL' : 'armR', [sg * .3, 1.05, 0]);
        }
        for (let i = 0; i < 3; i++)
            ball([0, .85 + i * .12, .31], [.03, .03, .03], dark);
        cyl([0, 1.25, 0], [.27, .07, .27], second('#c9423a'));
        if (angry)
            eyes(.08, 1.52, .21, .03);
        top = [0, 1.66, 0];
        hs = .9;
    }
    else if (s === 'peak') {
        const rock = main('#7d7266'), cap = second('#ff6a2b');
        if (v === 1) {
            for (let i = 0; i < 6; i++)
                box([Math.sin(i * 2.1) * .35, .35 + i * .22, Math.cos(i * 2.1) * .3], [1.0 - i * .12, .5, .9 - i * .1], i % 2 ? rock : cap, [0, i * .7, 0]);
            eyes(.2, .9, .5, .1);
            top = [0, 1.7, 0];
        }
        else {
            cone([0, .9, 0], [1.2, 1.8, 1.2], rock);
            glow('cylinder', [0, 1.78, 0], [.32, .05, .32], cap);
            for (let i = 0; i < 4; i++)
                glow('box', [Math.sin(i * 1.6) * .3, 1.5 - i * .15, Math.cos(i * 1.6) * .3 + .1], [.07, .3, .05], cap, [0, i * 1.6, .2]);
            eyes(.26, .9, .6, .11);
            top = [0, 1.85, 0];
        }
        feet(.45, .05, .2, shade(rock, .7));
    }
    else {
        const body = main(accent);
        if (v === 1) {
            ball([0, .12, 0], [.9, .12, .8], body);
            eyes(.18, .3, .4, .1);
            top = [0, .3, 0];
        }
        else {
            ball([0, .63, 0], [.58, .64, .52], body);
            eyes(.21, .93, .47, .13);
            box([0, .56, .5], [.16, .06, .035], dark);
            for (const sg of [-1, 1]) {
                ball([sg * .4, .1, .12], [.22, .13, .28], dark, sg === -1 ? 'legL' : 'legR');
                ball([sg * .56, .64, 0], [.15, .25, .15], body, sg === -1 ? 'armL' : 'armR');
            }
            top = [0, 1.27, 0];
        }
    }
    if (s === 'human' || (s === 'blob' && f.weapon !== 'fists')) {
        if (f.weapon === 'pan') {
            cyl([.57, .91, .37], [.27, .09, .27], dark, [Math.PI / 2, 0, 0], 'armR');
            box([.57, .61, .36], [.07, .42, .07], dark, [0, 0, 0], 'armR');
        }
        if (f.weapon === 'sword') {
            box([.57, 1.04, .32], [.12, 1.12, .06], metal, [0, 0, 0], 'armR');
            box([.57, .62, .32], [.35, .07, .13], '#b29659', [0, 0, 0], 'armR');
        }
        if (f.weapon === 'axe' || f.weapon === 'club') {
            box([.57, .96, .26], [.11, .9, .11], '#816043', [0, 0, 0], 'armR');
            box([.68, 1.31, .26], f.weapon === 'axe' ? [.4, .3, .12] : [.25, .42, .23], f.weapon === 'axe' ? metal : '#8a6240', [0, 0, .2], 'armR');
        }
        if (f.weapon === 'blaster' || f.weapon === 'cannon') {
            box([.57, .7, .43], [.22, .23, .68], dark, [0, 0, 0], 'armR');
            box([.57, .7, .8], [.14, .14, .03], accent, [0, 0, 0], 'armR');
        }
        if (f.weapon === 'staff') {
            cyl([.57, .9, .25], [.035, 1.4, .035], '#6b4c35', [0, 0, 0], 'armR');
            glow('sphere', [.57, 1.65, .25], [.1, .1, .1], f.element === 'electric' ? '#ffe14d' : '#c08cf0', 'armR');
        }
    }
    if (f.traits.includes('armored') && ['gorilla', 'rex', 'hamster', 'blob', 'quad', 'fruit'].includes(s))
        box([0, s === 'quad' ? .9 : .76, s === 'quad' ? .55 : .46], [.52, .36, .06], metal);
    if (f.traits.includes('electric'))
        for (const sg of [-1, 1])
            glow('cone', [top[0] + sg * .3, top[1] + .1, top[2]], [.07, .3, .07], '#e1b633', [0, 0, -sg * .35], topJoint);
    // Generic hats sit on the head anchor of every shape.
    const T = (dx, dy, dz) => [top[0] + dx * hs, top[1] + dy * hs, top[2] + dz * hs];
    const hat = f.hat, J = topJoint;
    if (hat === 'crown') {
        cyl(T(0, .07, 0), [.31 * hs, .14 * hs, .31 * hs], gold, [0, 0, 0], J);
        for (const sg of [-1, 0, 1])
            cone(T(sg * .19, .25, .18), [.05 * hs, .25 * hs, .05 * hs], gold, [0, 0, 0], J);
    }
    else if (hat === 'wizard') {
        cone(T(0, .3, 0), [.35 * hs, .7 * hs, .35 * hs], second(main(accent)), [0, 0, 0], J);
        cyl(T(0, .0, 0), [.43 * hs, .06 * hs, .43 * hs], second(main(accent)), [0, 0, 0], J);
    }
    else if (hat === 'chef') {
        cyl(T(0, .12, 0), [.22 * hs, .3 * hs, .22 * hs], '#f6f6f2', [0, 0, 0], J);
        ball(T(0, .32, 0), [.28 * hs, .16 * hs, .28 * hs], '#f6f6f2', J);
    }
    else if (hat === 'cap') {
        ball(T(0, -.02, 0), [.25 * hs, .14 * hs, .25 * hs], second(accent), J);
        box(T(0, -.04, .26), [.3 * hs, .03 * hs, .2 * hs], second(accent), [0, 0, 0], J);
    }
    else if (hat === 'tophat') {
        cyl(T(0, .2, 0), [.18 * hs, .38 * hs, .18 * hs], dark, [0, 0, 0], J);
        cyl(T(0, .02, 0), [.28 * hs, .03 * hs, .28 * hs], dark, [0, 0, 0], J);
        cyl(T(0, .06, 0), [.185 * hs, .06 * hs, .185 * hs], second(accent), [0, 0, 0], J);
    }
    else if (hat === 'halo') {
        add('ring', T(0, .25, 0), [.25 * hs, .3 * hs, .25 * hs], '#ffe9a8', [0, 0, 0], J, null, [.5, 0, 4]);
    }
    else if (hat === 'horns') {
        for (const sg of [-1, 1])
            cone(T(sg * .2, .08, 0), [.06 * hs, .35 * hs, .06 * hs], '#e8dcc0', [0, 0, -sg * .8], J);
    }
    else if (hat === 'horn') {
        add('cone', T(0, .12, .18), [.06 * hs, .45 * hs, .06 * hs], '#f3d77a', [.7, 0, 0], J, null, [.3, .4, 0]);
    }
    else if (hat === 'antlers') {
        for (const sg of [-1, 1]) {
            box(T(sg * .3, .1, 0), [.45 * hs, .05 * hs, .08 * hs], '#d6c7a5', [0, 0, sg * .35], J);
            box(T(sg * .55, .25, 0), [.4 * hs, .05 * hs, .3 * hs], '#d6c7a5', [0, 0, sg * .6], J);
            for (let k = 0; k < 3; k++)
                cone(T(sg * (.45 + k * .1), .38 + k * .04, -.1 + k * .1), [.03 * hs, .2 * hs, .03 * hs], '#d6c7a5', [0, 0, -sg * .2], J);
        }
    }
    else if (hat === 'ears' && !humanHat) {
        for (const sg of [-1, 1])
            (s === 'quad' && f.variant === 3 ? cone : (p, sc, c, r, j) => ball(p, sc, c, j))(T(sg * .14, -.02, -.03), s === 'quad' && f.variant === 3 ? [.06 * hs, .14 * hs, .05 * hs] : [.07 * hs, .07 * hs, .04 * hs], shade(main('#8a6a4a'), .8), [0, 0, 0], J);
    }
    else if (hat === 'leaf' && s !== 'fruit') {
        box(T(.08, .05, 0), [.2 * hs, .02, .1 * hs], '#5a9a4a', [0, 0, .4], J);
    }
    return parts;
}
},
"audio": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioEngine = void 0;
const schema_1 = require("./schema");
/** Procedural stereo Foley. No downloads, permission waits, or unbounded voices. */
class AudioEngine {
    context = null;
    master = null;
    destination = null;
    muted = false;
    last = 0;
    noise = null;
    bus = null;
    reverb = null;
    air = null;
    voices = 0;
    footAt = 0;
    growlAt = 0;
    lastSwing = 0;
    stepPhase = new Map();
    init() {
        if (this.context)
            return;
        try {
            const c = this.context = new AudioContext();
            this.master = c.createGain();
            this.master.gain.value = this.muted ? 0 : .48;
            const compressor = c.createDynamicsCompressor();
            compressor.threshold.value = -18;
            compressor.knee.value = 20;
            compressor.ratio.value = 5;
            compressor.attack.value = .003;
            compressor.release.value = .17;
            this.bus = c.createGain();
            this.bus.connect(compressor);
            compressor.connect(this.master);
            this.master.connect(c.destination);
            this.destination = c.createMediaStreamDestination();
            this.master.connect(this.destination);
            const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
            let seed = 7;
            const samples = noise.getChannelData(0);
            for (let i = 0; i < samples.length; i++) {
                seed = (seed * 16807) % 2147483647;
                samples[i] = seed / 2147483647 * 2 - 1;
            }
            this.noise = noise;
            this.reverb = c.createConvolver();
            const ir = c.createBuffer(2, Math.floor(c.sampleRate * .82), c.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const d = ir.getChannelData(ch);
                for (let i = 0; i < d.length; i++) {
                    seed = (seed * 16807) % 2147483647;
                    d[i] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - i / d.length, 3.8) * .3;
                }
            }
            this.reverb.buffer = ir;
            const wet = c.createGain();
            wet.gain.value = .14;
            this.reverb.connect(wet);
            wet.connect(this.bus);
            const room = c.createBufferSource(), lp = c.createBiquadFilter();
            room.buffer = noise;
            room.loop = true;
            lp.type = 'lowpass';
            lp.frequency.value = 430;
            this.air = c.createGain();
            this.air.gain.value = .003;
            room.connect(lp);
            lp.connect(this.air);
            this.air.connect(this.bus);
            room.start();
        }
        catch { /* Missing or blocked audio must not block the game. */ }
    }
    unlock() { this.init(); if (this.context?.state === 'suspended') {
        try {
            void this.context.resume().catch(() => { });
        }
        catch { }
    } }
    toggle() { this.muted = !this.muted; this.init(); if (this.master && this.context)
        this.master.gain.setTargetAtTime(this.muted ? 0 : .48, this.context.currentTime, .025); this.unlock(); return this.muted; }
    route(node, pan) { const c = this.context, p = c.createStereoPanner(); p.pan.value = (0, schema_1.clamp)(pan, -.8, .8); node.connect(p); p.connect(this.bus || this.master); if (this.reverb)
        p.connect(this.reverb); return () => p.disconnect(); }
    tone(freq, end, duration, volume = .35, type = 'sine', offset = 0, pan = 0) {
        const c = this.context;
        if (!c || !this.master || c.state !== 'running' || this.muted || this.voices > 54)
            return;
        this.voices++;
        const t = c.currentTime + offset, osc = c.createOscillator(), g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(12, end), t + duration);
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(volume, t + .004);
        g.gain.exponentialRampToValueAtTime(.0001, t + duration);
        osc.connect(g);
        const release = this.route(g, pan);
        osc.start(t);
        osc.stop(t + duration + .03);
        let ended = false;
        osc.onended = () => { if (ended)
            return; ended = true; osc.disconnect(); g.disconnect(); release(); this.voices = Math.max(0, this.voices - 1); };
    }
    burst(duration, volume, frequency, end, pan = 0, offset = 0, kind = 'lowpass') {
        const c = this.context;
        if (!c || !this.noise || !this.master || c.state !== 'running' || this.muted || this.voices > 54)
            return;
        this.voices++;
        const t = c.currentTime + offset, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        n.buffer = this.noise;
        f.type = kind;
        f.Q.value = .65;
        f.frequency.setValueAtTime(frequency, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(35, end), t + duration);
        g.gain.setValueAtTime(.0001, t);
        g.gain.linearRampToValueAtTime(volume, t + Math.min(.025, duration * .15));
        g.gain.exponentialRampToValueAtTime(.0001, t + duration);
        n.connect(f);
        f.connect(g);
        const release = this.route(g, pan);
        n.start(t, .31);
        n.stop(t + duration + .025);
        let ended = false;
        n.onended = () => { if (ended)
            return; ended = true; n.disconnect(); f.disconnect(); g.disconnect(); release(); this.voices = Math.max(0, this.voices - 1); };
    }
    beep(last = false) { if (last) {
        this.tone(85, 31, .55, .55);
        this.burst(.23, .17, 1300, 180);
        this.tone(260, 65, .4, .07, 'sawtooth');
    }
    else {
        this.tone(210, 135, .14, .2, 'sine');
        this.tone(640, 510, .055, .045, 'sine');
    } }
    click() { this.tone(580, 420, .05, .06); }
    win() { this.tone(70, 30, .7, .32); [196, 246.94, 293.66, 392].forEach((f, i) => { this.tone(f, f * .999, .6, .085, 'triangle', i * .11); this.tone(f * 2, f * 2, .5, .028, 'sine', i * .11); }); this.burst(.9, .11, 1500, 700, 0, .2); }
    roar(pan = 0) { const now = this.context?.currentTime || 0; if (now - this.growlAt < 2.3)
        return; this.growlAt = now; this.burst(.72, .23, 460, 100, pan); for (let i = 0; i < 5; i++) {
        this.tone(93 - i * 5, 38, .24, .09, 'sawtooth', i * .09, pan);
        this.tone(55, 26, .22, .16, 'sine', i * .08, pan);
    } }
    hits(events) {
        const now = this.context?.currentTime || 0;
        if (this.muted)
            return;
        const swing = events.find(e => e.kind === 'swing' && (e.mass || 0) > 6);
        if (swing && now - this.lastSwing > .18) {
            this.lastSwing = now;
            this.burst(swing.action === 'slam' ? .38 : .22, .15, 200, 2100, (0, schema_1.clamp)(swing.x / 14, -.7, .7), 0, 'bandpass');
        }
        const charge = events.find(e => e.kind === 'charge');
        if (charge)
            this.roar((0, schema_1.clamp)(charge.x / 14, -.7, .7));
        if (now - this.last < .048)
            return;
        const e = events.find(x => x.kind === 'special') || events.find(x => x.kind === 'ko') || events.find(x => x.kind === 'hit' && (x.mass || 0) > 6) || events.find(x => x.kind === 'hit') || events.find(x => x.kind === 'shot') || events.find(x => x.kind === 'land');
        if (!e)
            return;
        this.last = now;
        const pan = (0, schema_1.clamp)(e.x / 13, -.7, .7), heavy = (e.mass || 0) > 6, big = e.kind === 'special', ko = e.kind === 'ko';
        if (e.kind === 'shot') {
            this.tone(350, 95, .14, .13, 'triangle', 0, pan);
            this.burst(.09, .1, 2000, 500, pan);
            return;
        }
        if (big) {
            this.tone(95, 23, .6, .75, 'sine', 0, pan);
            this.tone(180, 40, .17, .13, 'triangle', 0, pan);
            this.burst(.6, .36, 1500, 90, pan);
            this.burst(.17, .25, 4300, 650, pan);
            return;
        }
        if (heavy || ko) {
            this.tone(116, 32, .28, .45, 'sine', 0, pan);
            this.burst(.2, .21, 2200, 250, pan);
            this.burst(.4, .06, 700, 180, -pan, .065);
        }
        else {
            this.tone(165, 65, .105, .11, 'sine', 0, pan);
            this.burst(.078, .14, 3500, 800, pan);
            if (e.kind === 'hit')
                this.tone(970 + (e.victim || 0) % 7 * 135, 700, .16, .025, 'triangle', .01, pan);
        }
    }
    update(sim, active, paused) {
        const c = this.context;
        if (!c || c.state !== 'running')
            return;
        this.air?.gain.setTargetAtTime(paused ? 0 : active ? .013 : .003, c.currentTime, .5);
        if (!active || paused || this.muted)
            return;
        for (const a of sim.agents) {
            if (!a.alive || a.locomotion < .35 || a.y > a.stats.fly + .15 || a.stats.fly > 0)
                continue;
            const beat = Math.floor(a.gait / Math.PI);
            if (this.stepPhase.get(a.id) === beat)
                continue;
            this.stepPhase.set(a.id, beat);
            if (c.currentTime - this.footAt < (a.stats.mass > 6 ? .10 : .13))
                continue;
            this.footAt = c.currentTime;
            const heavy = a.stats.mass > 6, pan = (0, schema_1.clamp)(a.x / 13, -.65, .65);
            this.tone(heavy ? 84 : 155, heavy ? 36 : 90, heavy ? .15 : .065, heavy ? .15 : .035, 'sine', 0, pan);
            this.burst(heavy ? .13 : .065, heavy ? .09 : .045, heavy ? 550 : 1900, 180, pan);
        }
    }
    reset() { this.stepPhase.clear(); this.growlAt = -10; this.footAt = 0; }
    diagnostics() { return { state: this.context?.state || 'uninitialized', muted: this.muted, voices: this.voices }; }
}
exports.AudioEngine = AudioEngine;
},
"recorder": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClipRecorder = void 0;
class ClipRecorder {
    canvas = document.createElement('canvas');
    ctx;
    recorder = null;
    chunks = [];
    active = false;
    url = null;
    mime = '';
    frames = 0;
    started = 0;
    discard = false;
    onReady = null;
    onError = null;
    constructor() { this.canvas.width = 720; this.canvas.height = 1280; this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true }); }
    supported() { return typeof MediaRecorder !== 'undefined' && typeof this.canvas.captureStream === 'function'; }
    start(audio) {
        if (!this.supported())
            throw new Error('Video recording is not available in this browser. Try desktop Chrome or Edge.');
        this.mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
        if (!this.mime)
            throw new Error('This browser has no supported recording format.');
        const stream = this.canvas.captureStream(30);
        const tracks = !audio.muted && audio.context?.state === 'running' ? (audio.destination?.stream.getAudioTracks() || []) : [];
        // Clone so stopping a recording never stops the game's audio source.
        for (const track of tracks)
            stream.addTrack(track.clone());
        this.discard = false;
        if (this.url) {
            URL.revokeObjectURL(this.url);
            this.url = null;
        }
        this.chunks = [];
        this.recorder = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 3800000 });
        this.recorder.ondataavailable = e => { if (e.data.size)
            this.chunks.push(e.data); };
        this.recorder.onstop = () => { for (const t of stream.getTracks())
            t.stop(); if (this.chunks.length && !this.discard) {
            if (this.url)
                URL.revokeObjectURL(this.url);
            this.url = URL.createObjectURL(new Blob(this.chunks, { type: this.mime }));
            this.onReady?.(this.url, this.mime.includes('mp4') ? 'mp4' : 'webm');
        } };
        this.recorder.onerror = () => { this.active = false; this.onError?.('Recording failed in this browser. The fight itself still works.'); for (const t of stream.getTracks())
            t.stop(); };
        this.recorder.start(250);
        this.active = true;
        this.frames = 0;
        this.started = performance.now();
    }
    stop(discard = false) { this.discard = discard; if (this.recorder?.state === 'recording' || this.recorder?.state === 'paused')
        this.recorder.stop(); this.active = false; }
    pause(p) { if (p && this.recorder?.state === 'recording')
        this.recorder.pause();
    else if (!p && this.recorder?.state === 'paused')
        this.recorder.resume(); }
    paint(scene, s) {
        if (!this.active)
            return;
        const c = this.ctx, W = 720, H = 1280;
        c.fillStyle = '#252c2c';
        c.fillRect(0, 0, W, H);
        const top = 195, area = 940, ratio = scene.width / scene.height, drawW = ratio > W / area ? W : area * ratio, drawH = drawW / ratio;
        c.drawImage(scene, (W - drawW) / 2, top + (area - drawH) / 2, drawW, drawH);
        const shade = c.createLinearGradient(0, 0, 0, 380);
        shade.addColorStop(0, '#172022');
        shade.addColorStop(1, '#17202200');
        c.fillStyle = shade;
        c.fillRect(0, 0, W, 380);
        this.text(s.sim.teams[0].label.toUpperCase(), W / 2, 66, 620, 34, 2, '#edb083');
        c.textAlign = 'center';
        c.fillStyle = '#c8c6b9';
        c.font = 'italic 22px Georgia';
        c.fillText('vs', W / 2, 138);
        this.text(s.sim.teams[1].label.toUpperCase(), W / 2, 184, 620, 34, 2, '#a1c8d3');
        c.fillStyle = '#ffffff22';
        c.fillRect(35, 249, 294, 4);
        c.fillRect(391, 249, 294, 4);
        c.fillStyle = '#e9794b';
        c.fillRect(35, 249, 294 * s.sim.score(0).health, 4);
        c.fillStyle = '#6eb2c9';
        const bw = 294 * s.sim.score(1).health;
        c.fillRect(685 - bw, 249, bw, 4);
        if (s.phase === 'countdown') {
            c.fillStyle = '#fff0d5';
            c.font = '850 122px Arial';
            c.fillText(s.countdown, W / 2, 735);
        }
        if (s.sim.finished) {
            const grad = c.createLinearGradient(0, 890, 0, 1140);
            grad.addColorStop(0, '#20282900');
            grad.addColorStop(1, '#202829');
            c.fillStyle = grad;
            c.fillRect(0, 890, W, 250);
            c.fillStyle = '#f2bc80';
            c.font = '600 16px Arial';
            c.fillText(s.sim.winner === -1 ? 'DRAW' : 'WINNER', W / 2, 994);
            this.text(s.sim.winner === -1 ? 'A DRAW' : s.sim.teams[s.sim.winner].label.toUpperCase(), W / 2, 1043, 640, 42, 2, '#fff2d9');
        }
        else if (s.caption) {
            this.text(s.caption, W / 2, 1111, 622, 23, 1, '#faf0dc');
        }
        c.fillStyle = '#e9e7dd';
        c.font = '750 23px Arial';
        c.fillText('ANYTHING ARENA', W / 2, 1203);
        c.fillStyle = '#86918b';
        c.font = '13px monospace';
        c.fillText(s.seed.toString(36).toUpperCase(), W / 2, 1235);
        this.frames++;
    }
    text(text, x, y, width, size, maxLines, fill) { const c = this.ctx; c.font = `900 ${size}px Arial`; c.fillStyle = fill; c.textAlign = 'center'; let words = text.split(' '), line = '', lines = []; for (const w of words) {
        if (c.measureText(line + ' ' + w).width > width && line) {
            lines.push(line);
            line = w;
        }
        else
            line += (line ? ' ' : '') + w;
    } if (line)
        lines.push(line); if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -2) + '…';
    } lines.forEach((l, i) => { if (c.measureText(l).width > width)
        c.font = `900 ${Math.max(16, size * width / c.measureText(l).width)}px Arial`; c.fillText(l, x, y + i * size * 1.12); }); }
}
exports.ClipRecorder = ClipRecorder;
},
"render": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Renderer = void 0;
const schema_1 = require("./schema");
const math_1 = require("./math");
const models_1 = require("./models");
const VERT = `#version 300 es
layout(location=0) in vec3 position;layout(location=1) in vec3 normal;
layout(location=2) in mat4 instance;layout(location=6) in vec4 tint;layout(location=7) in vec3 surface;
uniform mat4 vp;uniform mat4 lightVP;
out vec3 n;out vec4 c;out vec3 world;out vec3 local;out vec4 shadow;flat out vec3 material;
void main(){vec4 p=instance*vec4(position,1.);world=p.xyz;local=position;mat3 m=mat3(instance);vec3 q=vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));n=normalize(m*(normal/max(q,vec3(.000001))));c=tint;material=surface;shadow=lightVP*p;gl_Position=vp*p;}`;
const FRAG = `#version 300 es
precision highp float;
in vec3 n;in vec4 c;in vec3 world;in vec3 local;in vec4 shadow;flat in vec3 material;
uniform vec3 eye;uniform sampler2D shadowMap;uniform bool hasShadow;uniform vec2 resolution;uniform float shadowSize;uniform bool fastMode;
out vec4 frag;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float visibility(vec3 N,vec3 L){if(!hasShadow)return 1.;vec3 p=shadow.xyz/shadow.w*.5+.5;if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)return 1.;float bias=max(.0032*(1.-dot(N,L)),fastMode?.0038:.0018),v=0.;vec2 texel=vec2(1./shadowSize);if(fastMode){for(int x=0;x<2;x++)for(int y=0;y<2;y++){float z=texture(shadowMap,p.xy+(vec2(float(x),float(y))-.5)*texel*1.5).r;v+=p.z-bias<=z?1.:0.;}return .35+.65*v*.25;}for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float z=texture(shadowMap,p.xy+vec2(float(x),float(y))*texel*1.3).r;v+=p.z-bias<=z?1.:0.;}return .24+.76*v/9.;}
void main(){
 vec3 N=normalize(n),L=normalize(vec3(-.68,1.,.52)),V=normalize(eye-world),H=normalize(L+V);
 float rough=material.x,metal=material.y,tex=material.z;vec3 base=pow(max(c.rgb,vec3(.001)),vec3(2.2));
 if(tex>1.5&&tex<2.5){float grain=fastMode?.5:noise(world*13.),broad=noise(world*.55);base*=.83+.18*broad+.14*grain;float ripple=sin(world.x*6.+sin(world.z*1.9)*.7);N=normalize(N+vec3(ripple*.015,0.,cos(world.z*11.)*.013));}
 else if(tex>2.5&&tex<3.5){base*=fastMode?1.:.87+.2*noise(world*7.)+.065*noise(world*45.);}
 else if(tex>.5&&tex<1.5){float hair=fastMode?.5:noise(vec3(local.x*110.,local.y*17.,local.z*110.));base*=.72+.5*hair;}
 else if(!fastMode){base*=.95+.08*noise(local*28.);}
 float NoL=max(dot(N,L),0.),NoV=max(dot(N,V),.01),NoH=max(dot(N,H),0.);
 float shade=visibility(N,L),ao=.76+.24*smoothstep(0.,.65,world.y);
 vec3 hemi=mix(vec3(.23,.20,.16),vec3(.43,.50,.59),N.y*.5+.5)*ao;
 vec3 diffuse=base*(hemi+vec3(2.35,1.96,1.47)*NoL*shade);
 float exponent=mix(100.,6.,rough*rough);float spec=pow(NoH,exponent)*(exponent+2.)*.07;
 vec3 F0=mix(vec3(.045),base,metal);vec3 F=F0+(1.-F0)*pow(1.-max(dot(V,H),0.),5.);
 vec3 rgb=diffuse*(1.-metal*.65)+F*spec*shade*NoL;
 rgb+=mix(vec3(.09,.14,.18),base,metal)*pow(1.-NoV,3.)*(.22+metal*.48);
 if(tex>3.5)rgb=base*2.9;
 rgb=pow(aces(rgb),vec3(1./2.2));
 if(c.a<.99)rgb=c.rgb;
 float fog=1.-exp(-max(0.,length(eye-world)-30.)*.017);rgb=mix(rgb,vec3(.25,.265,.265),fog*.65);
 vec2 uv=gl_FragCoord.xy/resolution;float vignette=smoothstep(.95,.22,length((uv-.5)*vec2(1.,.85)));rgb*=.89+.11*vignette;
 frag=vec4(rgb,c.a);
}`;
const DEPTH_VERT = `#version 300 es
layout(location=0) in vec3 position;layout(location=2) in mat4 instance;uniform mat4 lightVP;void main(){gl_Position=lightVP*instance*vec4(position,1.);}`;
const DEPTH_FRAG = `#version 300 es
precision highp float;void main(){}`;
class Renderer {
    canvas;
    gl;
    program;
    uniform;
    batches = new Map();
    models = [];
    particles = [];
    rings = [];
    scars = [];
    width = 1;
    height = 1;
    aspect = 1;
    quality = 1;
    frameMs = 16.7;
    slowFrames = 0;
    half = 9;
    focus = [0, .9, 0];
    shake = 0;
    focusPoint = null;
    focusTimer = 0;
    rng = (0, schema_1.random)(901);
    now = 0;
    frame = 0;
    drawCalls = 0;
    triangles = 0;
    vp = (0, math_1.identity)();
    reducedMotion = false;
    contextLost = false;
    depthProgram;
    shadowFBO = null;
    shadowTexture = null;
    lightVP = (0, math_1.multiply)((0, math_1.ortho)(18, 18, .5, 85), (0, math_1.lookAt)([-24, 35, 18], [0, 0, 0]));
    eye = [8, 15, 28];
    cameraYaw = .14;
    footsteps = new Map();
    shadowsReady = false;
    shadowSize = 1024;
    software = false;
    cameraNeedsSnap = true;
    resultAge = 0;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
        if (!gl)
            throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or use a browser with WebGL 2 support.');
        this.gl = gl;
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        this.software = !!debug && /swiftshader|llvmpipe|software/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
        if (this.software) {
            this.quality = .6;
            this.shadowSize = 512;
        }
        const program = (vs, fs) => { const p = gl.createProgram(); for (const [kind, code] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
            const s = gl.createShader(kind);
            gl.shaderSource(s, code);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(s) || 'Shader failed');
            gl.attachShader(p, s);
        } gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(p) || 'Renderer initialization failed'); return p; };
        this.program = program(VERT, FRAG);
        this.depthProgram = program(DEPTH_VERT, DEPTH_FRAG);
        this.uniform = gl.getUniformLocation(this.program, 'vp');
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(.22, .24, .25, 1);
        for (const name of ['box', 'sphere', 'detail', 'cylinder', 'cone', 'ring']) {
            const data = (0, math_1.geometry)(name, this.software), vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
            gl.bindBuffer(gl.ARRAY_BUFFER, ibo);
            const cap = 14000;
            gl.bufferData(gl.ARRAY_BUFFER, cap * 23 * 4, gl.DYNAMIC_DRAW);
            for (let i = 0; i < 4; i++) {
                gl.enableVertexAttribArray(2 + i);
                gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, 92, i * 16);
                gl.vertexAttribDivisor(2 + i, 1);
            }
            gl.enableVertexAttribArray(6);
            gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 92, 64);
            gl.vertexAttribDivisor(6, 1);
            gl.enableVertexAttribArray(7);
            gl.vertexAttribPointer(7, 3, gl.FLOAT, false, 92, 80);
            gl.vertexAttribDivisor(7, 1);
            this.batches.set(name, { vao, buffer: ibo, vertices: data.length / 6, data: new Float32Array(cap * 23), count: 0, capacity: cap });
        }
        this.shadowTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.shadowFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTexture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
            this.shadowFBO = null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.contextLost = true; });
        canvas.addEventListener('webglcontextrestored', () => location.reload());
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    setFighters(sim) { this.resize(); this.cameraNeedsSnap = true; this.resultAge = 0; this.models = sim.groups.map(g => (0, models_1.makeModel)(g.f, g.team)); this.particles = []; this.rings = []; this.scars = []; this.footsteps.clear(); this.focusTimer = 0; this.focusPoint = null; this.half = Math.max(8.2, 10.6 / this.aspect); this.focus = [0, .9, 0]; this.cameraYaw = .14; this.rng = (0, schema_1.random)(901); this.shadowsReady = false; }
    resize() { const r = this.canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.6) * this.quality, w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (w !== this.width || h !== this.height) {
        this.width = w;
        this.height = h;
        this.aspect = w / h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    } }
    add(name, m, c, material = [.88, 0, 0]) { const b = this.batches.get(name); if (b.count >= b.capacity)
        return; const i = b.count++ * 23; b.data.set(m, i); b.data.set(c, i + 16); b.data.set(material, i + 20); }
    obj(name, p, s, c, r = [0, 0, 0], material = [.88, 0, 0]) { this.add(name, (0, math_1.compose)(p, s, r), typeof c === 'string' ? (0, math_1.color)(c) : c, material); }
    reset() { for (const b of this.batches.values())
        b.count = 0; }
    flush(castShadow = false) {
        const gl = this.gl;
        for (const b of this.batches.values())
            if (b.count) {
                gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data.subarray(0, b.count * 23));
            }
        if (castShadow && this.shadowFBO && (!this.shadowsReady || this.frame % (this.software ? 3 : 2) === 0 || this.quality > .85)) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBO);
            gl.viewport(0, 0, this.shadowSize, this.shadowSize);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.disable(gl.BLEND);
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(1.1, 2);
            gl.useProgram(this.depthProgram);
            gl.uniformMatrix4fv(gl.getUniformLocation(this.depthProgram, 'lightVP'), false, this.lightVP);
            for (const b of this.batches.values())
                if (b.count) {
                    gl.bindVertexArray(b.vao);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, b.vertices, b.count);
                    this.drawCalls++;
                }
            gl.disable(gl.POLYGON_OFFSET_FILL);
            gl.enable(gl.BLEND);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, this.width, this.height);
            this.shadowsReady = true;
        }
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniform, false, this.vp);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'lightVP'), false, this.lightVP);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'eye'), this.eye);
        gl.uniform2f(gl.getUniformLocation(this.program, 'resolution'), this.width, this.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'shadowMap'), 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'hasShadow'), this.shadowsReady ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'shadowSize'), this.shadowSize);
        gl.uniform1i(gl.getUniformLocation(this.program, 'fastMode'), this.software ? 1 : 0);
        for (const b of this.batches.values())
            if (b.count) {
                gl.bindVertexArray(b.vao);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, b.vertices, b.count);
                this.drawCalls++;
                this.triangles += b.vertices / 3 * b.count;
            }
        this.reset();
    }
    particle(x, y, z, type, amount, power = 1, tint = null) {
        for (let i = 0; i < amount && this.particles.length < 520; i++) {
            const ang = this.rng() * Math.PI * 2, speed = (type === 'dust' ? .8 : 2) + this.rng() * (type === 'dust' ? 2 : 5) * power;
            this.particles.push({ x, y, z, vx: Math.cos(ang) * speed, vy: (type === 'dust' ? .5 : 2) + this.rng() * (type === 'dust' ? 1.7 : 5) * power, vz: Math.sin(ang) * speed, life: 0, max: type === 'dust' ? .7 + this.rng() * .8 : .2 + this.rng() * .5, size: type === 'dust' ? .16 + this.rng() * .34 : type === 'spark' ? .02 + this.rng() * .035 : .055 + this.rng() * .09, c: tint || (0, math_1.color)(type === 'dust' ? '#bda883' : type === 'spark' ? '#ffd59a' : '#6c6354'), spin: this.rng() * 10, type });
        }
    }
    effects(events, sim) {
        for (const e of events) {
            if (e.kind === 'end' || e.kind === 'swing' || e.kind === 'charge' || e.kind === 'counter')
                continue;
            const tint = e.element ? (0, math_1.color)(schema_1.ELEMENT_COLORS[e.element] || '#ffd59a') : null;
            if (e.kind === 'zap') {
                this.particle(e.x, e.y + 1.5, e.z, 'spark', 14, 1.4, tint);
                if (this.rings.length < 12)
                    this.rings.push({ x: e.x, z: e.z, life: 0, size: 1.6, c: tint });
                continue;
            }
            if (e.kind === 'shot') {
                this.particle(e.x, e.y, e.z, 'spark', 3, .4);
                continue;
            }
            const heavy = (e.mass || 0) > 6, slam = e.kind === 'special', ko = e.kind === 'ko';
            if (e.kind === 'land') {
                if (this.rng() < .3)
                    this.particle(e.x, .05, e.z, 'dust', 3, .5);
                continue;
            }
            if (e.kind === 'hit') {
                this.particle(e.x, e.y, e.z, 'spark', heavy ? 9 : 3, heavy ? 1.2 : .45, e.element && e.element !== 'none' ? tint : null);
                if (heavy)
                    this.particle(e.x, .2, e.z, 'dust', 5, .8);
            }
            if (ko) {
                this.particle(e.x, e.y, e.z, 'rock', 4);
                this.particle(e.x, .1, e.z, 'dust', 4);
            }
            if (slam) {
                const big = e.big || ['slam', 'quake', 'boom', 'dash'].includes(e.move);
                if (big) {
                    this.particle(e.x, .07, e.z, 'dust', 24, 1.8);
                    this.particle(e.x, .1, e.z, 'rock', 17, 1.3);
                }
                this.particle(e.x, 1, e.z, 'spark', 22, 1.6, tint);
                if (this.rings.length < 10)
                    this.rings.push({ x: e.x, z: e.z, life: 0, size: Math.max(2, (e.radius || 3) * 1.4), c: tint || (0, math_1.color)('#dbc6a2') });
                if (this.scars.length < 24)
                    this.scars.push({ x: e.x, z: e.z, size: 1.2 + this.rng() * .5, life: 0, angle: this.rng() * 6.28 });
            }
            if (!this.reducedMotion) {
                this.shake = Math.min(.27, this.shake + (slam ? .15 : heavy ? .07 : ko ? .032 : .002));
                if ((slam || heavy && ko) && this.focusTimer <= 0) {
                    this.focusPoint = [e.x, .9, e.z];
                    this.focusTimer = 1.0;
                }
            }
        }
    }
    render(sim, dt, mode, paused = false) {
        if (this.contextLost)
            return;
        if (dt > 0) {
            this.frameMs = this.frameMs * .95 + Math.min(dt * 1000, 300) * .05;
            if (this.frameMs > 36)
                this.slowFrames++;
            else
                this.slowFrames = Math.max(0, this.slowFrames - 1);
            if (this.slowFrames > 35 && this.quality > .65) {
                this.quality = Math.max(.65, this.quality - .12);
                this.slowFrames = 0;
            }
        }
        this.resize();
        this.now += paused ? 0 : dt;
        this.resultAge = mode === 'result' ? this.resultAge + (paused ? 0 : dt) : 0;
        this.frame++;
        this.drawCalls = 0;
        this.triangles = 0;
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.reset();
        this.camera(sim, dt, mode);
        this.arena(sim, mode);
        let corpses = 0;
        for (const a of sim.agents) {
            if (!a.alive && (a.koTime > 3.5 || corpses++ >= 36))
                continue;
            this.actor(a, sim, mode, paused);
            if (a.alive && mode === 'fight' && a.locomotion > .6 && a.y < .12 && !paused) {
                const step = Math.floor(a.gait / Math.PI);
                if (this.footsteps.get(a.id) !== step) {
                    this.footsteps.set(a.id, step);
                    if (a.stats.mass > 5 || this.rng() < .15)
                        this.particle(a.x, .06, a.z, 'dust', a.stats.mass > 5 ? 3 : 1, .4);
                }
            }
        }
        for (const s of sim.shots) {
            const a = sim.agents[s.from], gf = sim.groups[a.group].f;
            this.obj(a.stats.aoe > 1 || s.special ? 'sphere' : 'box', [s.x, s.y, s.z], a.stats.aoe > 1 || s.special ? [.15, .15, .15] : [.12, .08, .24], gf.weapon === 'toast' ? '#dbbb7c' : schema_1.ELEMENT_COLORS[gf.element] || '#ffd292', [this.now * 9, Math.atan2(a.x - s.x, a.z - s.z), 0], [.5, .3, 4]);
        }
        this.flush(true);
        // Soft contact darkening keeps feet planted even below the shadow-map texel size.
        gl.depthMask(false);
        for (const a of sim.agents)
            if (a.alive || a.koTime < 2) {
                const s = a.scale;
                for (let j = 0; j < 2; j++)
                    this.obj('cylinder', [a.x, .009 + j * .001, a.z], [s * (.38 + j * .15), .003, s * (.27 + j * .12)], j === 0 ? (0, math_1.color)('#191919', .095 / (1 + a.y)) : (0, math_1.color)(models_1.TEAM[a.team], a.alive ? .32 / (1 + a.y * .5) : .08));
            }
        for (const scar of this.scars) {
            scar.life += paused ? 0 : dt;
            this.obj('cylinder', [scar.x, .023, scar.z], [scar.size, .004, scar.size * .7], (0, math_1.color)('#695949', .13));
            for (let j = 0; j < 7; j++) {
                const ang = scar.angle + j * .897;
                this.obj('box', [scar.x + Math.sin(ang) * scar.size * .75, .027, scar.z + Math.cos(ang) * scar.size * .75], [.016, .003, scar.size * .8], (0, math_1.color)('#65564a', .3), [0, ang, 0]);
            }
        }
        this.flush();
        if (!paused) {
            for (const p of this.particles) {
                p.life += dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                if (p.type !== 'dust')
                    p.vy -= 15 * dt;
                else {
                    p.vx *= Math.exp(-dt * 2);
                    p.vz *= Math.exp(-dt * 2);
                    p.vy *= Math.exp(-dt * 2);
                }
                if (p.y < .035) {
                    p.y = .035;
                    p.vy = Math.abs(p.vy) * .25;
                }
            }
            for (const r of this.rings)
                r.life += dt;
        }
        this.particles = this.particles.filter(p => p.life < p.max);
        // Opaque splinters first; low-opacity dust last, with depth writes disabled.
        for (const p of this.particles)
            if (p.type !== 'dust') {
                const s = p.size * (1 - p.life / p.max);
                this.obj(p.type === 'spark' ? 'box' : 'sphere', [p.x, p.y, p.z], p.type === 'spark' ? [s * .6, s * .6, s * 4] : [s, s, s], p.c, [p.spin * p.life, p.spin, 0], [.7, 0, p.type === 'spark' ? 4 : 3]);
            }
        this.flush();
        for (const p of this.particles)
            if (p.type === 'dust') {
                const age = p.life / p.max, s = p.size * (.6 + age * 2);
                this.obj('sphere', [p.x, p.y, p.z], [s, s * .6, s], (0, math_1.color)('#bba689', Math.sin(age * Math.PI) * .105));
            }
        this.rings = this.rings.filter(r => r.life < .58);
        for (const r of this.rings) {
            const s = .3 + r.life * r.size * 1.8, rc = r.c || (0, math_1.color)('#dec49a');
            this.obj('ring', [r.x, .035, r.z], [s, .01, s], [rc[0], rc[1], rc[2], (1 - r.life / .58) * .42]);
        }
        this.flush();
        gl.depthMask(true);
    }
    camera(sim, dt, mode) {
        const all = sim.agents.filter(a => a.alive);
        let x = 0, z = 0, y = 1.0, targetHalf = Math.max(7.5, 10.6 / this.aspect);
        if (all.length) {
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
            for (const a of all) {
                minX = Math.min(minX, a.x - a.scale * .82);
                maxX = Math.max(maxX, a.x + a.scale * .82);
                minZ = Math.min(minZ, a.z - a.scale * .68);
                maxZ = Math.max(maxZ, a.z + a.scale * .68);
                maxY = Math.max(maxY, a.y + a.scale * 1.7);
            }
            x = (minX + maxX) / 2;
            z = (minZ + maxZ) / 2;
            y = Math.max(.8, Math.min(1.8, maxY * .35));
            const ex = (maxX - minX) / 2, ez = (maxZ - minZ) / 2;
            targetHalf = Math.max(mode === 'preview' ? 6.8 : 4.3, (ex + ez * .28 + 2.1) / this.aspect, ez * .56 + maxY * .4 + 1.5);
            targetHalf = Math.min(targetHalf, Math.max(11, 15 / this.aspect));
            if (this.focusTimer > 0 && this.focusPoint) {
                this.focusTimer -= dt;
                x = x * .85 + this.focusPoint[0] * .15;
                z = z * .85 + this.focusPoint[2] * .15;
                targetHalf *= .96;
            }
            if (mode === 'result') {
                const hero = all.find(a => a.team === sim.winner);
                if (hero && all.length < 6) {
                    x = hero.x;
                    z = hero.z;
                    y = hero.scale * .75;
                    targetHalf = Math.max(3.3, hero.scale * 1.7, hero.scale * 1.7 / this.aspect);
                }
            }
        }
        const k = this.cameraNeedsSnap ? 1 : 1 - Math.exp(-dt * (mode === 'preview' ? 2 : 1.8));
        this.cameraNeedsSnap = false;
        this.focus[0] += (x - this.focus[0]) * k;
        this.focus[1] += (y - this.focus[1]) * k;
        this.focus[2] += (z - this.focus[2]) * k;
        this.half += (targetHalf - this.half) * k;
        this.shake *= Math.exp(-dt * 11);
        const sx = this.reducedMotion ? 0 : Math.sin(this.now * 93) * this.shake, sz = this.reducedMotion ? 0 : Math.cos(this.now * 77) * this.shake;
        const targetYaw = this.reducedMotion ? .14 : mode === 'result' ? .24 + Math.sin(this.now * .17) * .07 : mode === 'preview' ? .14 + Math.sin(this.now * .16) * .035 : .14 + Math.sin(sim.time * .13) * .065;
        this.cameraYaw += (targetYaw - this.cameraYaw) * k;
        const f = [this.focus[0] + sx, this.focus[1], this.focus[2] + sz], distance = this.half / Math.tan(.64 / 2);
        const elevation = .5;
        this.eye = [f[0] + Math.sin(this.cameraYaw) * distance * Math.cos(elevation), f[1] + Math.sin(elevation) * distance, f[2] + Math.cos(this.cameraYaw) * distance * Math.cos(elevation)];
        this.vp = (0, math_1.multiply)((0, math_1.perspective)(.64, this.aspect, .3, 180), (0, math_1.lookAt)(this.eye, f));
    }
    arena(sim, mode) {
        this.obj('box', [0, -1.05, 0], [180, .4, 180], '#504c44', [0, 0, 0], [1, 0, 3]);
        this.obj('cylinder', [0, -.49, 0], [13.8, .83, 13.8], '#786b58', [0, 0, 0], [.95, 0, 3]);
        this.obj('cylinder', [0, -.13, 0], [13.54, .21, 13.54], '#b0a087', [0, 0, 0], [.96, 0, 3]);
        this.obj('cylinder', [0, -.02, 0], [13.03, .04, 13.03], '#b9a482', [0, 0, 0], [1, 0, 2]);
        this.obj('ring', [0, .012, 0], [12.2, .01, 12.2], '#dbcab0', [0, 0, 0], [1, 0, 2]);
        for (let i = 0; i < 64; i++) {
            const a = i * Math.PI * 2 / 64, r = 13.35;
            this.obj('box', [Math.cos(a) * r, -.02, Math.sin(a) * r], [1.20, .17, .64], i % 3 === 0 ? '#a18f74' : '#a9977e', [0, -a + Math.PI / 2, 0], [.96, 0, 3]);
        }
        // Terraced architecture stays behind the action. No billboard audience or noisy HUD.
        for (let i = 0; i < 26; i++) {
            const a = Math.PI + i / 25 * Math.PI, r = 14.3, tangent = -a + Math.PI / 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
            this.obj('box', [x, .47, z], [1.67, .96, .8], '#a59780', [0, tangent, 0], [.95, 0, 3]);
            this.obj('box', [x, 1.01, z], [1.79, .15, 1.0], '#c1b49b', [0, tangent, 0], [.95, 0, 3]);
            for (let tier = 0; tier < 3; tier++) {
                const rad = 15.3 + tier * .73;
                this.obj('box', [Math.cos(a) * rad, .45 + tier * .55, Math.sin(a) * rad], [2.3, .64, .89], tier % 2 ? '#8e8472' : '#9b8f7b', [0, tangent, 0], [.94, 0, 3]);
            }
            if (i % 2 === 0) {
                this.obj('box', [Math.cos(a) * 17.8, 2.92, Math.sin(a) * 17.8], [.46, 3.2, .6], '#b0a48e', [0, tangent, 0], [.9, 0, 3]);
                this.obj('box', [Math.cos(a) * 17.8, 4.55, Math.sin(a) * 17.8], [4.7, .29, .86], '#c1b298', [0, tangent, 0], [.9, 0, 3]);
                this.obj('box', [Math.cos(a) * 17.8, 1.44, Math.sin(a) * 17.8], [.81, .26, .9], '#b0a48e', [0, tangent, 0], [.9, 0, 3]);
            }
        }
        for (let arch = 1; arch < 26; arch += 2) {
            const a = Math.PI + arch / 25 * Math.PI, tangent = -a + Math.PI / 2, cx = Math.cos(a) * 17.8, cz = Math.sin(a) * 17.8;
            for (let j = 0; j < 9; j++) {
                const theta = (j + .5) * Math.PI / 9, offset = Math.cos(theta) * 1.93;
                this.obj('box', [cx + Math.cos(tangent) * offset, 2.55 + Math.sin(theta) * 1.49, cz - Math.sin(tangent) * offset], [.65, .36, .72], j % 2 ? '#ad9e85' : '#b6a78d', [0, tangent, theta - Math.PI / 2], [.95, 0, 3]);
            }
        }
        for (const sign of [-1, 1]) {
            const a = sign < 0 ? 3.55 : 5.88, x = Math.cos(a) * 14, z = Math.sin(a) * 14;
            this.obj('cylinder', [x, 2.2, z], [.047, 3.7, .047], '#615945', [0, 0, 0], [.44, .5, 0]);
            this.obj('box', [x + sign * .4, 3.18, z], [.83, 1.25, .055], models_1.TEAM[sign < 0 ? 0 : 1], [.02, 0, -sign * .04], [.97, 0, 0]);
            this.obj('box', [x + sign * .4, 3.18, z + .035], [.035, 1.05, .012], '#d8c8a2');
        }
        if (sim.time > 18 && mode === 'fight')
            this.obj('ring', [0, .038, 0], [sim.radius, .01, sim.radius], '#ad7c51');
    }
    actor(a, sim, mode, paused) {
        const shape = sim.groups[a.group].f.shape, gorilla = shape === 'gorilla', idle = mode === 'preview' || sim.finished, ko = !a.alive, airborne = a.y > a.stats.fly + .25;
        const walk = Math.sin(a.gait + a.phase), move = idle ? 0 : Math.min(1, a.locomotion), wind = a.windup > 0 ? 1 - a.windup / a.windupMax : 0, recover = a.attack, slam = a.action === 'slam';
        const shrink = ko ? (0, schema_1.clamp)(1 - (a.koTime - 2.7) / .8, .001, 1) : 1, size = a.scale * shrink;
        const breathing = Math.sin(this.now * 2 + a.phase) * .01, bounce = idle ? breathing : Math.abs(walk) * .033 * move;
        let pitch = ko ? a.koTime * 2.7 : airborne ? -.18 : gorilla ? move * .08 : move * .05;
        if (!ko) {
            if (slam)
                pitch += a.windup > 0 ? -.22 * Math.sin(wind * Math.PI * .5) : recover * .38;
            else
                pitch += a.windup > 0 ? -.06 * wind : recover * .1;
        }
        const lunge = !ko && !idle && gorilla && !slam ? recover * size * .14 : 0;
        const poseYaw = mode === 'result' && !ko && a.team === sim.winner ? a.yaw + Math.atan2(Math.sin(this.cameraYaw - a.yaw), Math.cos(this.cameraYaw - a.yaw)) * (1 - Math.exp(-this.resultAge * 2.4)) : a.yaw;
        const root = (0, math_1.compose)([a.x + Math.sin(a.yaw) * lunge, a.y + bounce + (ko ? size * .3 : 0), a.z + Math.cos(a.yaw) * lunge], [size, size * (1 + breathing * .5), size], [pitch, poseYaw + (gorilla && !slam ? ((a.attackCount - (a.windup > 0 ? 0 : 1) + 2) % 2 ? 1 : -1) * (wind * .16 - recover * .2) : 0), ko ? a.koTime * a.spin : a.dodged > 0 ? Math.sin(a.dodged * 15) * .14 : a.confused > 0 ? Math.sin(this.now * 9 + a.phase) * .18 : 0]);
        const jointCache = new Map();
        const joint = (j, override = null) => {
            const key = override ? j + override.join(',') : j;
            const known = jointCache.get(key);
            if (known)
                return known;
            let pivot = [0, 0, 0], rot = [0, 0, 0], parent = null;
            if (j === 'armL' || j === 'armR' || j === 'forearmL' || j === 'forearmR') {
                const sign = j.endsWith('L') ? -1 : 1, fore = j.startsWith('forearm'), active = ((a.attackCount - (a.windup > 0 ? 0 : 1) + 2) % 2 ? 1 : -1) === sign;
                pivot = gorilla ? [sign * .58, 1.24, .015] : [sign * .38, 1.15, 0];
                rot[0] = -walk * sign * (gorilla ? .28 : .46) * move + (idle ? Math.sin(this.now * 1.5 + a.phase) * .02 : 0);
                if (gorilla) {
                    if (slam) {
                        rot[0] = a.windup > 0 ? -wind * 2.65 : -recover * .65;
                        rot[2] = -sign * (a.windup > 0 ? wind * .27 : .1);
                    }
                    else if (active) {
                        rot[0] += a.windup > 0 ? wind * .48 : a.action === 'uppercut' ? -recover * 1.8 : -recover * 1.5;
                        rot[2] += sign * (a.windup > 0 ? wind * .43 : -recover * .46);
                    }
                    else
                        rot[0] += -recover * .24;
                }
                else {
                    rot[0] += a.windup > 0 ? -wind * 1.8 : -recover * .35;
                    rot[2] += sign * (a.windup > 0 ? .12 * wind : -.2 * recover);
                }
                if (fore) {
                    parent = joint(sign < 0 ? 'armL' : 'armR');
                    pivot = [sign * .8, .72, .18];
                    rot = [a.windup > 0 ? (slam ? -wind * .38 : active ? -wind * .85 : 0) : active ? -recover * .28 : 0, 0, 0];
                }
                if (ko) {
                    rot[0] = Math.sin(a.koTime * 9 + a.phase + sign) * .8;
                    rot[2] = sign * .35;
                }
            }
            else if (j === 'legL' || j === 'legR') {
                const sign = j === 'legL' ? -1 : 1;
                pivot = gorilla ? [sign * .26, .61, -.16] : [sign * .18, .63, 0];
                rot[0] = walk * sign * (gorilla ? .34 : .65) * move;
                if (ko)
                    rot[0] = Math.sin(a.koTime * 6 + sign) * .7;
            }
            else if (j === 'head') {
                pivot = [0, 1.37, .1];
                rot[0] = gorilla ? (a.windup > 0 && slam ? -wind * .2 : recover * .1) : 0;
            }
            else if (j === 'jaw') {
                pivot = [0, 1.4, .35];
                rot[0] = gorilla ? (a.charge > 0 ? .32 : a.windup > 0 ? .19 : .015) : 0;
                parent = joint('head');
            }
            else if (j === 'tail') {
                pivot = [0, .65, -.45];
                rot[1] = walk * .18;
            }
            else if (j === 'wingL' || j === 'wingR') {
                pivot = [j === 'wingL' ? -.25 : .25, .65, 0];
                rot[2] = Math.sin(this.now * (a.stats.fly ? 16 : 7) + a.phase) * (j === 'wingL' ? 1 : -1) * .35;
            }
            else if (j === 'rotor') {
                pivot = [0, 1.64, 0];
                rot[1] = (paused ? sim.time : this.now) * 29;
            }
            if (override)
                pivot = override;
            const r = (0, math_1.compose)(pivot, [1, 1, 1], rot);
            const back = (0, math_1.compose)([-pivot[0], -pivot[1], -pivot[2]]);
            let m = (0, math_1.multiply)(r, back);
            if (parent)
                m = (0, math_1.multiply)(parent, m);
            jointCache.set(key, m);
            return m;
        };
        const local = new Float32Array(16), combined = new Float32Array(16);
        for (const p of this.models[a.group] || []) {
            (0, math_1.compose)(p.p, p.s, p.r, local);
            const posed = p.joint === 'none' ? local : (0, math_1.multiply)(joint(p.joint, p.pivot), local);
            (0, math_1.multiply)(root, posed, combined);
            const flash = a.hit * .17, ice = a.chill > 0 ? .45 : 0, tint = [p.c[0] + (1 - p.c[0]) * flash - p.c[0] * ice * .5, p.c[1] + (1 - p.c[1]) * flash + (1 - p.c[1]) * ice * .3, p.c[2] + (1 - p.c[2]) * flash + (1 - p.c[2]) * ice, p.c[3]];
            const material = p.material ? [...p.material] : [.88, 0, 0];
            if (gorilla && p.c[0] < .48 && material[1] < .2)
                material[2] = 1;
            this.add(p.geo, combined, tint, material);
        }
    }
    screen(p) { const v = (0, math_1.project)(p, this.vp); return [(v[0] * .5 + .5) * this.width, (-v[1] * .5 + .5) * this.height]; }
}
exports.Renderer = Renderer;
}
};
const cache = {};
function load(id) { id = id.replace(/^\.\//, '').replace(/\.js$/, ''); if (cache[id]) return cache[id].exports; if (!modules[id]) throw new Error('Missing module ' + id); const m = { exports: {} }; cache[id] = m; modules[id](m, m.exports, load); return m.exports; }
root.ArenaEngine = { require: load };
})(typeof window !== 'undefined' ? window : globalThis);
