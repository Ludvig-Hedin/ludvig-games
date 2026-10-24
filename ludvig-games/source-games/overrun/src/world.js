import * as THREE from 'three';

export const MAPS = [
  { id: 'urban', name: 'HALCYON', subtitle: 'Old town · 16:40', description: 'Sunlit service streets, open courtyards and connected rooftops.', colors: ['#b8c4bd', '#e5d5b5', '#4c727a'] },
  { id: 'industrial', name: 'FOUNDRY', subtitle: 'Freight terminal · 07:15', description: 'A working freight yard. Warehouse interiors meet elevated steel walkways.', colors: ['#768b91', '#b99d66', '#5b7276'] },
  { id: 'desert', name: 'DUSTLINE', subtitle: 'Forward base · 14:20', description: 'Long desert sightlines, fortified barracks and a central maintenance depot.', colors: ['#c7a77e', '#e7cba5', '#788575'] },
];

// Original code-built assets. Static geometry is combined by material: detail does
// not cost one draw call per brick, window, corrugation, or handrail.
const V = THREE.Vector3;
const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const p3 = new V();
const one = new V(1, 1, 1);
const TAU = Math.PI * 2;

function texture(kind, color, seed = 11) {
  const N = 128, data = new Uint8Array(N * N * 4), c = new THREE.Color(color);
  // Convert linear working color back to an sRGB encoded source texture.
  c.convertLinearToSRGB();
  let r = seed;
  const random = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let n = (random() - .5) * .1 + Math.sin(x * .069 + y * .041) * .013;
    if (kind === 'plaster') n += random() < .045 ? -.075 : 0;
    if (kind === 'metal') n += (x % 16 < 2 ? -.105 : x % 16 < 4 ? .04 : 0) + Math.sin(y * .49) * .008;
    if (kind === 'brick') { const seam = y % 24 < 2 || (x + (Math.floor(y / 24) % 2) * 24) % 48 < 2; n += seam ? -.22 : .015; }
    if (kind === 'asphalt') n += random() < .08 ? .14 : -.04;
    if (kind === 'sand') n += Math.sin(x * .15 + Math.sin(y * .031) * 4) * .035;
    if (kind === 'wood') n += Math.sin(y * .48 + Math.sin(x * .03)) * .045 + (y % 32 < 2 ? -.17 : 0);
    const i = (y * N + x) * 4;
    data[i] = THREE.MathUtils.clamp((c.r + n) * 255, 0, 255);
    data[i + 1] = THREE.MathUtils.clamp((c.g + n) * 255, 0, 255);
    data[i + 2] = THREE.MathUtils.clamp((c.b + n) * 255, 0, 255);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

function merged(geometries) {
  let verts = 0, inds = 0;
  for (const g of geometries) { verts += g.attributes.position.count; inds += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(verts * 3), norm = new Float32Array(verts * 3), uv = new Float32Array(verts * 2), index = new Uint32Array(inds);
  let v = 0, k = 0;
  for (const g of geometries) {
    pos.set(g.attributes.position.array, v * 3); norm.set(g.attributes.normal.array, v * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
    const ix = g.index;
    for (let j = 0, l = ix ? ix.count : g.attributes.position.count; j < l; j++) index[k++] = v + (ix ? ix.array[j] : j);
    v += g.attributes.position.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(index, 1)); out.computeBoundingSphere();
  return out;
}

export function createWorld(scene, mapId = 'urban', quality = 'high') {
  const id = MAPS.some(m => m.id === mapId) ? mapId : 'urban';
  const group = new THREE.Group(); group.name = `world-${id}`; scene.add(group);
  const colliders = [], explosives = [], batches = new Map(), mats = {}, resources = [], moving = [];
  const bounds = { minX: -32, maxX: 32, minZ: -32, maxZ: 32 };
  const tones = id === 'desert' ? { plaster: 0xc9b28d, accent: 0x7e8a77, asphalt: 0xb69b75, sky: 0xcbd6d4 } : id === 'industrial' ? { plaster: 0xb7bbac, accent: 0x506d72, asphalt: 0x787a70, sky: 0xa9bec7 } : { plaster: 0xd3c9ad, accent: 0x577f82, asphalt: 0x797c72, sky: 0xb6cbd0 };
  function material(name, color, kind = 'plaster', roughness = .85, metalness = 0) {
    const map = texture(kind, color); resources.push(map);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map, bumpMap: map, bumpScale: kind === 'metal' ? .025 : .018, roughness, metalness });
    mats[name] = mat; return mat;
  }
  material('plaster', tones.plaster); material('light', 0xe2dac6); material('concrete', 0xa1a293);
  material('darkConcrete', 0x777b70); material('asphalt', tones.asphalt, id === 'desert' ? 'sand' : 'asphalt');
  material('accent', tones.accent, 'metal', .75, .18); material('steel', 0x4e5858, 'metal', .6, .45);
  material('dark', 0x303c3d, 'metal', .68, .3); material('yellow', 0xc2a448, 'metal', .74, .1);
  material('rust', 0x9c6050, 'metal', .85, .15); material('wood', 0x9b805d, 'wood');
  material('brick', 0x9c8d76, 'brick'); material('rubber', 0x282f2e, 'asphalt', .95);
  material('sand', 0xd0ba91, 'sand'); material('canvas', 0x737b61, 'plaster');
  mats.white = new THREE.MeshStandardMaterial({ color: 0xe0ddc7, roughness: .93 });
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x344d52, roughness: .27, metalness: .4 });
  mats.lightStrip = new THREE.MeshStandardMaterial({ color: 0xf2e9c8, emissive: 0xffdc9a, emissiveIntensity: 1.8, roughness: .5 });
  mats.redLight = new THREE.MeshBasicMaterial({ color: 0xff734d });

  function addGeometry(geom, matName, x, y, z, rotY = 0, rotX = 0, rotZ = 0, tile = true) {
    q4.setFromEuler(new THREE.Euler(rotX, rotY, rotZ)); p3.set(x, y, z); m4.compose(p3, q4, one); geom.applyMatrix4(m4);
    if (tile && geom.attributes.uv) {
      const a = geom.attributes.position, n = geom.attributes.normal, u = geom.attributes.uv;
      for (let i = 0; i < a.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        if (ny > nx && ny > nz) u.setXY(i, a.getX(i) / 3, a.getZ(i) / 3);
        else if (nx > nz) u.setXY(i, a.getZ(i) / 3, a.getY(i) / 3);
        else u.setXY(i, a.getX(i) / 3, a.getY(i) / 3);
      }
    }
    if (!batches.has(matName)) batches.set(matName, []); batches.get(matName).push(geom);
  }
  function collider(x, y, z, w, h, d, surface = 'concrete', penetrable = false, walkable = true) {
    const c = { min: new V(x - w / 2, y - h / 2, z - d / 2), max: new V(x + w / 2, y + h / 2, z + d / 2), surface, penetrable, walkable };
    colliders.push(c); return c;
  }
  function box(x, y, z, w, h, d, mat = 'concrete', solid = true, surface = 'concrete', penetrable = false, ry = 0, walkable = true) {
    if (w <= .001 || h <= .001 || d <= .001) return;
    addGeometry(new THREE.BoxGeometry(w, h, d), mat, x, y, z, ry);
    if (solid) {
      const cw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d;
      const cd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d;
      collider(x, y, z, cw, h, cd, surface, penetrable, walkable);
    }
  }
  function cylinder(x, y, z, r, h, mat = 'steel', solid = false, sides = 12, rx = 0, rz = 0) {
    addGeometry(new THREE.CylinderGeometry(r, r, h, sides), mat, x, y, z, 0, rx, rz);
    if (solid) collider(x, y, z, r * 2, h, r * 2, 'metal', false, true);
  }
  function sphere(x, y, z, r, sx, sy, sz, mat) {
    const g = new THREE.SphereGeometry(r, 10, 7); g.scale(sx, sy, sz); addGeometry(g, mat, x, y, z, 0, 0, 0, false);
  }
  function beam(a, b, radius, mat = 'steel') {
    const av = new V(...a), bv = new V(...b), diff = bv.clone().sub(av), geom = new THREE.CylinderGeometry(radius, radius, diff.length(), 6);
    geom.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), diff.normalize()));
    const mid = av.add(bv).multiplyScalar(.5); addGeometry(geom, mat, mid.x, mid.y, mid.z);
  }
  function sign(text, sub, x, y, z, w, h, ry = 0, bg = '#253b3b', fg = '#e2e1cf') {
    if (typeof document === 'undefined') return;
    const cvs = document.createElement('canvas'); cvs.width = 768; cvs.height = Math.max(128, Math.round(768 * h / w));
    const ctx = cvs.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cvs.width, cvs.height); ctx.fillStyle = fg;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(cvs.height * (sub ? .37 : .58))}px Arial`;
    ctx.fillText(text, 384, cvs.height * (sub ? .4 : .53), 700);
    if (sub) { ctx.globalAlpha = .72; ctx.font = `500 ${Math.round(cvs.height * .13)}px Arial`; ctx.fillText(sub, 384, cvs.height * .79, 690); }
    const t = new THREE.CanvasTexture(cvs); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resources.push(t);
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: .8, metalness: .1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; group.add(m);
  }
  function railing(x1, z1, x2, z2, y, mat = 'steel') {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(len / 2.0);
    beam([x1, y + 1, z1], [x2, y + 1, z2], .045, mat);
    beam([x1, y + .5, z1], [x2, y + .5, z2], .027, mat);
    for (let i = 0; i <= n; i++) { const t = i / n; cylinder(x1 + (x2 - x1) * t, y + .5, z1 + (z2 - z1) * t, .04, 1.05, mat); }
    collider((x1 + x2) / 2, y + .5, (z1 + z2) / 2, Math.abs(x2 - x1) + .08, 1.0, Math.abs(z2 - z1) + .08, 'metal', true, false);
  }
  function stairs(x, z, width, count, rise = .2, run = .55, direction = -1, materialName = 'concrete') {
    for (let i = 0; i < count; i++) { const height = (i + 1) * rise, zz = z + direction * (i + .5) * run;
      box(x, height / 2, zz, width, height, run + .015, materialName);
      box(x, height + .012, zz - direction * (run / 2 - .025), width, .025, .06, 'light', false);
    }
    for (const s of [-1, 1]) {
      const xx = x + s * (width / 2 + .05);
      beam([xx, 1.04 + rise, z], [xx, count * rise + 1, z + direction * count * run], .045, 'steel');
      for (let i = 0; i < count; i += 4) cylinder(xx, (i + 1) * rise + .5, z + direction * (i + .5) * run, .035, 1, 'steel');
    }
  }
  // Physical openings, not dark rectangles painted over solid collision walls.
  function facade(x, z, length, h, base, mat, axis = 'x', door = true, windows = true, extra = []) {
    const holes = [...extra];
    if (door) holes.push({ a: -1.6, b: 1.6, low: 0, high: 2.75 });
    if (windows) for (const s of [-1, 1]) holes.push({ a: s * length * .3 - 1.25, b: s * length * .3 + 1.25, low: 1.15, high: 2.65 });
    holes.sort((a, b) => a.a - b.a);
    const part = (a, b, low, high, material = mat, solid = true, thick = .36) => {
      if (axis === 'x') box(x + (a + b) / 2, base + (low + high) / 2, z, b - a, high - low, thick, material, solid);
      else box(x, base + (low + high) / 2, z + (a + b) / 2, thick, high - low, b - a, material, solid);
    };
    let edge = -length / 2;
    for (const hole of holes) {
      part(edge, hole.a, 0, h); part(hole.a, hole.b, 0, hole.low); part(hole.a, hole.b, hole.high, h);
      part(hole.a - .08, hole.a + .08, hole.low, hole.high, 'light', false, .43);
      part(hole.b - .08, hole.b + .08, hole.low, hole.high, 'light', false, .43);
      part(hole.a - .08, hole.b + .08, hole.high - .06, hole.high + .08, 'light', false, .43);
      if (hole.low > 0) part(hole.a - .1, hole.b + .1, hole.low - .07, hole.low + .03, 'dark', false, .52);
      edge = hole.b;
    }
    part(edge, length / 2, 0, h);
    part(-length / 2, length / 2, h - .18, h, 'light', false, .5);
  }
  function building(x, z, w, d, h, { mat = 'plaster', roof = true, windows = true, doors = true, parapet = false, skylight = false, parapetOpen = 'east', elevatedEast = null } = {}) {
    box(x, .055, z, w, .11, d, 'light');
    facade(x, z + d / 2, w, h, 0, mat, 'x', doors, windows); facade(x, z - d / 2, w, h, 0, mat, 'x', doors, windows);
    facade(x + w / 2, z, d, h, 0, mat, 'z', doors, windows, elevatedEast ? [elevatedEast] : []); facade(x - w / 2, z, d, h, 0, mat, 'z', doors, windows);
    if (roof) {
      if (skylight) {
        box(x - w * .32, h + .09, z, w * .36 + .3, .18, d + .35, 'steel');
        box(x + w * .32, h + .09, z, w * .36 + .3, .18, d + .35, 'steel');
        for (let zz = z - d / 2; zz <= z + d / 2; zz += 5) box(x, h + .03, zz, w, .24, .22, 'steel', false);
      } else box(x, h + .09, z, w + .35, .18, d + .35, 'darkConcrete');
      if (parapet) {
        box(x, h + .49, z - d / 2, w, .64, .23, 'plaster'); box(x, h + .49, z + d / 2, w, .64, .23, 'plaster');
        box(x + (parapetOpen === 'west' ? 1 : -1) * w / 2, h + .49, z, .23, .64, d, 'plaster');
      }
    }
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) box(x + xx * (w / 2 - .15), h / 2, z + zz * (d / 2 - .15), .48, h + .12, .48, 'light', false);
    // Interior fixtures and a warm overhead source keep rooms readable.
    box(x, h - .18, z + 1.5, 3.5, .08, .18, 'lightStrip', false);
    if (quality !== 'low') { const light = new THREE.PointLight(0xffdfaa, 9, 15, 1.8); light.position.set(x, h - .5, z); group.add(light); }
  }
  function crate(x, z, w = 1.5, d = 1.5, h = 1.35, y = 0) {
    box(x, y + h / 2, z, w, h, d, 'wood', true, 'wood', true);
    for (const side of [-1, 1]) { box(x + side * w * .34, y + h / 2, z, .095, h + .06, d + .05, 'steel', false); box(x, y + h * .2, z + side * (d / 2 + .025), w + .05, .11, .04, 'wood', false); }
    box(x, y + .06, z, w + .06, .12, d + .06, 'dark', false);
  }
  function barrier(x, z, w = 3.2, ry = 0, striped = true) {
    box(x, .34, z, w, .68, .85, 'concrete', true, 'concrete', false, ry);
    box(x, .9, z, w - .12, .5, .5, 'light', true, 'concrete', false, ry);
    if (striped) for (let i = -w / 2 + .2; i < w / 2; i += .55) {
      const dx = Math.cos(ry) * i, dz = -Math.sin(ry) * i;
      box(x + dx, .94, z + dz, .23, .13, .52, 'yellow', false, 'metal', false, ry);
    }
  }
  function container(x, z, w = 6.2, d = 2.65, mat = 'accent', y = 0, ry = 0) {
    box(x, y + 1.3, z, w, 2.6, d, mat, true, 'metal', true, ry);
    const place = (lx, ly, lz, ww, hh, dd, m) => box(x + lx * Math.cos(ry) + lz * Math.sin(ry), y + ly, z - lx * Math.sin(ry) + lz * Math.cos(ry), ww, hh, dd, m, false, 'metal', false, ry);
    for (const s of [-1, 1]) { place(0, .12, s * d / 2, w + .05, .13, .08, 'dark'); place(0, 2.48, s * d / 2, w + .05, .13, .08, 'light'); }
    for (let i = -w / 2 + .12; i < w / 2; i += .4) for (const s of [-1, 1]) place(i, 1.3, s * (d / 2 + .018), .055, 2.35, .045, mat);
    for (const s of [-1, 1]) { place(s * (w / 2 + .02), 1.3, 0, .07, 2.5, .09, 'light'); place(s * (w / 2 + .05), 1.3, -.6, .055, 2.35, .035, 'steel'); place(s * (w / 2 + .05), 1.3, .6, .055, 2.35, .035, 'steel'); }
  }
  function drum(x, z, mat = 'rust', y = 0) {
    cylinder(x, y + .53, z, .36, 1.06, mat, true, 14);
    for (const yy of [.12, .44, .94]) cylinder(x, y + yy, z, .375, .045, 'steel');
    cylinder(x + .1, y + 1.07, z, .055, .022, 'dark');
  }
  // Destructible drums remain separate from merged architecture so the game can
  // hide the complete object atomically while retaining shared world materials.
  let fuelLabelMaterial = null;
  function fuelBarrel(x, z, y = 0) {
    const barrel = new THREE.Group(); barrel.name = `fuel-${id}-${explosives.length}`; barrel.position.set(x, y + .58, z); group.add(barrel);
    const parts = new Map();
    const part = (geom, materialName, px=0, py=0, pz=0) => {
      geom.translate(px,py,pz); if (!parts.has(materialName)) parts.set(materialName,[]); parts.get(materialName).push(geom);
    };
    part(new THREE.CylinderGeometry(.38,.38,1.10,20), 'rust');
    for(const yy of [-.54,-.34,.34,.54]) part(new THREE.CylinderGeometry(.399,.399,.042,20), 'steel',0,yy,0);
    part(new THREE.CylinderGeometry(.373,.373,.018,20), 'dark',0,.562,0);
    part(new THREE.CylinderGeometry(.065,.065,.038,10), 'steel',.14,.58,.08);
    part(new THREE.CylinderGeometry(.025,.025,.042,8), 'dark',.14,.587,.08);
    for(const yy of [-.13,.13]) part(new THREE.CylinderGeometry(.384,.384,.055,20), 'yellow',0,yy,0);
    for(const [materialName,geometries] of parts){const mesh=new THREE.Mesh(merged(geometries),mats[materialName]);mesh.castShadow=true;mesh.receiveShadow=true;barrel.add(mesh);}
    if(typeof document!=='undefined'){
      if(!fuelLabelMaterial){
        const canvas=document.createElement('canvas');canvas.width=128;canvas.height=176;const ctx=canvas.getContext('2d');
        if(ctx){
          ctx.fillStyle='#cdb259';ctx.fillRect(0,0,128,176);ctx.fillStyle='#27302b';ctx.fillRect(5,5,118,166);ctx.fillStyle='#d5bb62';
          ctx.beginPath();ctx.moveTo(64,20);ctx.lineTo(112,101);ctx.lineTo(16,101);ctx.closePath();ctx.fill();
          ctx.fillStyle='#27302b';ctx.beginPath();ctx.moveTo(63,37);ctx.bezierCurveTo(75,58,47,66,66,83);ctx.bezierCurveTo(79,76,87,60,81,57);ctx.bezierCurveTo(111,90,73,111,51,94);ctx.bezierCurveTo(35,80,52,62,63,37);ctx.fill();
          ctx.fillStyle='#dfc671';ctx.font='700 23px Arial';ctx.textAlign='center';ctx.fillText('FUEL',64,131);ctx.font='10px Arial';ctx.fillText('FLAMMABLE',64,153);
          const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;resources.push(tex);fuelLabelMaterial=new THREE.MeshStandardMaterial({map:tex,roughness:.85,side:THREE.DoubleSide});
        }
      }
      if(fuelLabelMaterial)for(const side of [-1,1]){const label=new THREE.Mesh(new THREE.PlaneGeometry(.3,.413),fuelLabelMaterial);label.position.set(0,.025,side*.384);label.rotation.y=side===1?0:Math.PI;barrel.add(label);}
    }
    const c=collider(x,y+.58,z,.81,1.16,.81,'metal',false,true);
    const explosive={id:barrel.name,pos:barrel.position.clone(),health:65,group:barrel,collider:c,exploded:false};
    c.explosive=explosive;c.disabled=false;explosives.push(explosive);
  }
  function vent(x, z, y = 0, w = 1.9) {
    box(x, y + .5, z, w, 1, 1.35, 'steel'); box(x, y + 1.04, z, w + .14, .12, 1.5, 'light', false);
    for (let i = 0; i < 7; i++) box(x, y + .19 + i * .1, z + .68, w - .2, .035, .02, 'dark', false);
    cylinder(x, y + 1.15, z, .47, .14, 'dark');
  }
  function lamp(x, z, h = 6.4, ry = 0) {
    cylinder(x, h / 2, z, .085, h, 'steel');
    beam([x, h, z], [x + Math.sin(ry) * 1.5, h, z + Math.cos(ry) * 1.5], .07, 'steel');
    box(x + Math.sin(ry) * 1.45, h - .08, z + Math.cos(ry) * 1.45, .6, .12, 1.1, 'lightStrip', false, 'metal', false, ry);
    box(x, .25, z, .35, .5, .35, 'concrete');
  }
  function palm(x, z, h = 8) {
    cylinder(x, h / 2, z, .21, h, 'wood', false, 8);
    for (let i = 0; i < 7; i++) {
      const ang = i / 7 * TAU, start = new V(x, h, z), end = new V(x + Math.sin(ang) * 3.3, h - 1.2, z + Math.cos(ang) * 3.3);
      const leaf = new THREE.BufferGeometry(), width = .66, mid = start.clone().lerp(end, .6); mid.y += .7;
      const perpendicular = new V(Math.cos(ang), 0, -Math.sin(ang)).multiplyScalar(width);
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([...start, ...mid.clone().add(perpendicular), ...end, ...start, ...end, ...mid.clone().sub(perpendicular)], 3));
      leaf.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1], 2)); leaf.computeVertexNormals();
      if (!batches.has('canvas')) batches.set('canvas', []); batches.get('canvas').push(leaf);
    }
  }
  function truck(x, z, ry = 0) {
    const place = (lx, ly, lz, w, h, d, mat, solid = true) => box(x + lx * Math.cos(ry) + lz * Math.sin(ry), ly, z - lx * Math.sin(ry) + lz * Math.cos(ry), w, h, d, mat, solid, 'metal', false, ry);
    place(0, .65, 0, 2.35, .48, 5.8, 'dark'); place(0, 1.4, -1.65, 2.18, 1.3, 2.1, 'canvas');
    place(0, 2.14, -1.45, 2.24, .16, 1.7, 'canvas'); place(0, 1.75, -2.71, 1.85, .55, .035, 'glass', false);
    place(0, 1.06, -2.75, 1.8, .31, .08, 'dark', false); place(0, .62, -2.85, 2.48, .16, .18, 'steel', false);
    place(0, 1.42, 1.05, 2.25, 1.45, 3.1, 'canvas'); place(0, 2.2, 1.05, 2.4, .18, 3.2, 'canvas');
    for (let i = -1; i <= 1; i++) place(i * .7, 1.4, 2.64, .04, 1.35, .035, 'steel', false);
    for (const side of [-1, 1]) for (const zz of [-1.9, 1.7]) {
      const wx = x + side * 1.18 * Math.cos(ry) + zz * Math.sin(ry), wz = z - side * 1.18 * Math.sin(ry) + zz * Math.cos(ry);
      const g = new THREE.CylinderGeometry(.52, .52, .32, 14); g.rotateZ(Math.PI / 2); g.rotateY(ry); addGeometry(g, 'rubber', wx, .58, wz, 0, 0, 0, false);
      const hub = new THREE.CylinderGeometry(.26, .26, .34, 10); hub.rotateZ(Math.PI / 2); hub.rotateY(ry); addGeometry(hub, 'steel', wx, .58, wz, 0, 0, 0, false);
    }
    for (const s of [-1, 1]) place(s * .8, 1.02, -2.81, .32, .21, .04, 'lightStrip', false);
  }

  // Common playable floor and intentional containing walls.
  box(0, -.35, 0, 64, .7, 64, 'asphalt');
  for (const s of [-1, 1]) {
    box(s * 32.35, 1.5, 0, .7, 3, 65.4, 'concrete'); box(0, 1.5, s * 32.35, 65.4, 3, .7, 'concrete');
    box(s * 32.35, 3.05, 0, .82, .13, 65.4, 'light', false); box(0, 3.05, s * 32.35, 65.4, .13, .82, 'light', false);
  }

  if (id === 'urban') {
    // A readable cross-road and two looping residential blocks.
    box(0, .014, 0, 11.6, .025, 63.6, 'darkConcrete', false); box(0, .018, 0, 63.6, .028, 9.4, 'darkConcrete', false);
    for (const s of [-1, 1]) {
      box(s * 6.0, .09, 0, .22, .18, 62, 'light');
      for (let zz = -28; zz <= 28; zz += 6) box(s * 4.8, .035, zz, .12, .015, 2.8, 'white', false);
    }
    for (let x = -4.5; x <= 4.5; x += 1.1) { box(x, .046, 7.6, .55, .018, 2.1, 'white', false); box(x, .046, -7.6, .55, .018, 2.1, 'white', false); }
    building(-19, -14, 17, 17, 5.4, { parapet: true });
    building(19, 14, 17, 17, 5.4, { parapet: true, mat: 'brick', parapetOpen: 'west' });
    building(21, -15, 13, 15, 4.0, { mat: 'brick' });
    building(-21, 15, 13, 15, 4.0, { mat: 'plaster' });
    stairs(-8.8, 3.1, 2.6, 27, .2, .55, -1);
    box(-10.1, 5.49, -12.2, 2.8, .18, 2.8, 'darkConcrete');
    stairs(8.8, -3.1, 2.6, 27, .2, .55, 1);
    box(10.1, 5.49, 12.2, 2.8, .18, 2.8, 'darkConcrete');
    // Rooftop service details and multiple pieces of playable interior cover.
    vent(-21, -17, 5.58, 2.6); vent(-15, -11, 5.58, 1.9); vent(22, 16, 5.58, 2.6); vent(15, 11, 5.58);
    for (const [x, z] of [[-23,-18],[-15,-11],[16,12],[23,18],[22,-18],[-22,17]]) { crate(x, z, 2.1, 1.2, 1.15, .11); }
    // Central plaza planter: low walls, benches, a sculptural tree, and crossing paths.
    for (const [x, z] of [[-3.3,-2.5],[3.3,2.5]]) {
      box(x, .48, z, 2.4, .96, 2.4, 'light'); box(x, .99, z, 2.15, .07, 2.15, 'dark', false);
      cylinder(x, 2.55, z, .16, 3.2, 'wood');
      for (let j = 0; j < 4; j++) sphere(x + Math.sin(j * 2.1) * .7, 4.0 + (j % 2) * .5, z + Math.cos(j * 2.1) * .7, 1, 1.2, .85, 1.2, 'canvas');
    }
    for (const [x,z] of [[-3.9,11],[3.9,-11]]) {
      box(x, .55, z, 1, 1.1, 3.8, 'accent', true, 'metal', true); box(x, 1.13, z, 1.08, .1, 3.9, 'light', false);
      sign('HALCYON', 'TRANSIT AUTHORITY', x + (x > 0 ? -.51 : .51), .75, z, 2.7, .6, x > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    for (const [x, z] of [[-29,5],[29,-5],[-12,28],[12,-28]]) { drum(x, z, 'accent'); drum(x + .8, z + .1); }
    barrier(-2, 21, 4.2); barrier(2, -21, 4.2); barrier(15, 2, 3.4, Math.PI/2); barrier(-15, -2, 3.4, Math.PI/2);
    truck(25, 1.4, Math.PI / 2); truck(-25, -1.4, -Math.PI/2);
    for (const [x, z, ry] of [[-6.5,23,Math.PI/2],[6.5,-23,-Math.PI/2],[-29,-8,0],[29,8,Math.PI]]) lamp(x,z,6.3,ry);
    sign('MERCER', 'SUPPLY & REPAIR', -19, 3.65, -5.28, 7.3, 1.0);
    sign('DISTRICT 04', 'HALCYON MUNICIPAL', 19, 3.65, 22.72, 7.8, 1.05);
    sign('CAFÉ 06', 'ESPRESSO · EVERY DAY', -21, 3.1, 22.72, 5.0, .8);
    sign('STATION', 'PLATFORM TWO', 21, 3.1, -7.28, 6, .85);
    // Canvas awnings, signs, service conduits and separate architectural silhouette.
    for (const [x, z, w] of [[-19,-5.1,7],[19,22.9,7],[-21,23,6],[21,-7.0,6]]) {
      box(x, 2.88, z + .7, w, .12, 1.65, 'accent', false); for (const s of [-1,1]) beam([x+s*w*.46,2.9,z],[x+s*w*.46,2.9,z+1.6],.03,'dark');
    }
    for (const [x,z] of [[-28,-14],[28,14]]) {
      cylinder(x,3,z,.12,6,'steel'); cylinder(x,4.2,z+1.2,.09,2.4,'steel',false,8,Math.PI/2);
    }
    // Non-playable skyline supplies context without blocking playable paths.
    for (let i=0;i<14;i++) {
      const x = -53 + i * 8.2, h = 9 + (i * 7 % 11), z = -45 - (i%3)*4;
      box(x,h/2,z,6.9,h,9,i%3===0?'accent':'plaster',false);
      for (let yy=3;yy<h-1;yy+=3) for (const dx of [-2,0,2]) box(x+dx,yy,z+4.52,1.1,1.5,.04,'glass',false);
      box(x,h+.22,z,7.3,.44,9.3,'light',false);
    }
    for (const s of [-1,1]) for(let i=0;i<4;i++) { const h=10+i*2; box(s*43,h/2,-26+i*17,14,h,13,i%2?'brick':'light',false); }
  } else if (id === 'industrial') {
    // West warehouse, east container lanes, central overhead gantry.
    building(-20, 0, 17, 39, 7.2, { mat: 'accent', windows: true, skylight: true, elevatedEast: {a:-16.7,b:-13.5,low:3.55,high:6.35} });
    sign('MERIDIAN', 'FREIGHT TERMINAL / BUILDING 02', -20, 4.9, 19.72, 10.4, 1.65);
    sign('02', 'LOADING BAY', -11.28, 4.1, 0, 2.7, 2.2, Math.PI/2, '#c3a643','#273838');
    for(const z of [-13,0,13]) { box(-20,7,z,16.4,.28,.25,'yellow',false); for(const x of [-26.5,-13.5]) box(x,3.6,z,.22,7.2,.25,'steel'); }
    // Actual mezzanine and crossing catwalk, with two separated routes up.
    box(-20, 3.4, -13.7, 16.2, .3, 5, 'steel');
    railing(-27.8,-11.2,-14.7,-11.2,3.55,'yellow');
    stairs(-13.4, 0, 2.35, 17, .2, .66, -1, 'steel');
    box(-6.5, 3.4, -15.1, 11.5, .3, 2.8, 'steel');
    railing(-11.8,-16.5,-1,-16.5,3.55,'yellow'); railing(-10.8,-13.7,-1,-13.7,3.55,'yellow');
    box(.7,3.4,-15.1,3,.3,3.2,'steel'); stairs(.7,-3.8,2.8,17,.2,.66,-1,'steel');
    for(const x of [-8,-1]) { box(x,1.7,-15.1,.32,3.4,.32,'steel'); box(x,3.02,-15.1,.6,.6,2.8,'steel',false); }
    for(const [x,z,w,d,h] of [[-24,-5,3.8,3,2],[-17,6,3.4,2.1,1.4],[-23,13,4,3,1.7],[-23,-14,3,2,1.4]]) {
      box(x,h/2,z,w,h,d,'darkConcrete'); box(x,h+.14,z,w+.16,.28,d+.16,'steel',false); for(let i=0;i<4;i++) cylinder(x-w*.33+i*w*.22,h+.38,z,.16,.48,'steel');
    }
    for(const [x,z] of [[9,-21],[22,-12],[9,1],[22,11],[9,23]]) container(x,z,8.3,3.15,(z<0?'rust':'accent'));
    container(23,-12,7.8,3.05,'accent',2.6); container(9,23,7.9,3.05,'rust',2.6);
    // Container-end pallet stacks and cover support alternating engagements.
    for(const [x,z] of [[4,-9],[16,2],[26,22],[-4,18],[-4,0]]) { crate(x,z,2.1,1.6,1.4); crate(x+.65,z+.1,1.0,1.3,.8,1.4); }
    for(const [x,z] of [[28,-24],[27,1],[-29,23],[-8,25]]) { drum(x,z); drum(x+.85,z+.25,'yellow'); }
    for(const x of [18,24]) {
      cylinder(x,3.6,-25,2.1,7.2,'light',true,20); sphere(x,7.2,-25,2.1,1,.36,1,'light');
      for(const yy of [1.3,5.6]) cylinder(x,yy,-25,2.15,.14,'steel');
      cylinder(x,8,-25,.15,1.3,'steel');
      sign('N₂', 'PRESSURIZED', x,3.4,-22.88,1.2,1.4);
    }
    // Utilities and elevated pipework, high enough for tactical sprint routes.
    for(const z of [-5,-4.5]) {
      beam([-30,6,z],[30,6,z],.15,'steel');
      for(const x of [-9,14,30]) { box(x,3,z,.18,6,.18,'yellow'); box(x,6,z,.6,.3,1.4,'steel',false); }
    }
    for(const z of [-26,26]) { box(0,.028,z,59,.015,.15,'yellow',false); for(let x=-28;x<28;x+=3) box(x,.03,z-1,.7,.015,1.5,'yellow',false); }
    for(const z of [-19,-10,0,10,19]) box(29,.031,z,3.1,.02,.14,'white',false);
    truck(1.0,12.7,Math.PI/2);
    barrier(2,-25,3.4); barrier(2,25,3.4); barrier(29,16,3.4,Math.PI/2);
    for(const [x,z] of [[-6,28],[29,-8],[18,29],[-29,-26]]) lamp(x,z,8);
    // Rail crane behind the perimeter frames the entire yard.
    for(const x of [-22,22]) { box(x,10,-40,1.2,20,1.5,'yellow',false); beam([x-3,0,-40],[x,15,-40],.26,'steel'); }
    box(0,19.4,-40,50,1.0,1.4,'yellow',false); box(0,17.9,-40,50,.24,1.4,'steel',false);
    for(let x=-23;x<23;x+=4) beam([x,18,-40],[x+4,19.4,-40],.11,'steel');
    beam([8,19,-40],[8,8,-40],.04,'dark'); box(8,7.5,-40,1,.7,.8,'dark',false);
    for(const s of [-1,1]) { box(s*46,8,-5,17,16,60,'accent',false); for(let z=-30;z<24;z+=5) box(s*37.4,12,z,.04,2,3,'glass',false); }
  } else {
    // Worn roads join fortified barracks, service hangar and a southern motor pool.
    box(0,.015,0,9,.02,63,'sand',false); box(0,.019,0,63,.025,8,'sand',false);
    building(-20,-15,16,16,4.2,{mat:'plaster',parapet:true}); building(20,15,16,16,4.2,{mat:'plaster',parapet:true,parapetOpen:'west'});
    building(21,-15,14,14,4.5,{mat:'canvas'}); building(-21,15,14,14,4.5,{mat:'canvas'});
    stairs(-10.5,-.4,2.5,21,.2,.62,-1); box(-11.6,4.29,-13,2.9,.18,2.7,'darkConcrete');
    stairs(10.5,.4,2.5,21,.2,.62,1); box(11.6,4.29,13,2.9,.18,2.7,'darkConcrete');
    // Open center depot provides cross-lane cover while keeping the center contestable.
    for(const x of [-5.5,5.5]) for(const z of [-5.0,5.0]) box(x,2.5,z,.3,5,.3,'steel');
    box(0,5.1,0,12.4,.22,11.4,'canvas');
    for(const x of [-5.7,5.7]) { box(x,1.0,0,.34,2.0,4.5,'concrete'); box(x,2.1,0,.5,.18,4.7,'light',false); }
    for(const z of [-5.5,5.5]) box(0,4.75,z,12,.5,.2,'canvas',false);
    box(0,4.9,0,3.2,.07,.16,'lightStrip',false);
    crate(-2.4,-2.0,2.4,1.8,1.25); crate(2.5,2.0,2.1,1.8,1.1);
    sign('FORWARD OPERATIONS', 'DUSTLINE / SECTOR 07',0,4.12,5.62,9.5,.72,0,'#737b62','#e8ddc7');
    // Distinct corner watchtowers with climbable stairs, not teleport platforms.
    function tower(x,z,dir) {
      for(const xx of [-1.5,1.5]) for(const zz of [-1.5,1.5]) box(x+xx,2.1,z+zz,.21,4.2,.21,'steel');
      box(x,4.22,z,3.6,.24,3.6,'steel');
      for(const side of [-1,1]) { box(x+side*1.75,4.78,z,.14,.9,3.5,'canvas'); box(x,4.78,z+side*1.75,3.5,.9,.14,'canvas'); }
      for(const xx of [-1.6,1.6]) for(const zz of [-1.6,1.6]) box(x+xx,5.4,z+zz,.08,2.2,.08,'steel',false);
      box(x,6.55,z,4.05,.15,4.05,'canvas');
      // Opening into the tower platform at its stair approach.
      stairs(x,z+dir*14.4,2.4,21,.2,.6,-dir,'steel');
      box(x,4.22,z+dir*2.0,2.5,.24,1.0,'steel');
    }
    // These platforms face outwards and provide watch-post sightlines.
    // Perimeter towers are deliberately decorative; roofs provide the playable high routes.
    for(const [x,z] of [[-35,30],[35,-30]]) {
      for(const xx of [-1.5,1.5])for(const zz of [-1.5,1.5])box(x+xx,3,z+zz,.22,6,.22,'steel',false);
      box(x,6,z,4,.3,4,'canvas',false);for(const s of [-1,1]){box(x+s*1.9,6.6,z,.15,1,4,'canvas',false);box(x,6.6,z+s*1.9,4,1,.15,'canvas',false);}box(x,8.2,z,4.6,.2,4.6,'canvas',false);
    }
    function sandbags(x,z,ry=0) {
      const sx=Math.cos(ry),sz=-Math.sin(ry);
      for(let row=0;row<3;row++) for(let i=0;i<4;i++) {
        const off=(i-1.5)*.73+(row%2)*.15;
        const g=new THREE.SphereGeometry(.5,8,5);g.scale(.8,.29,.54);g.rotateY(ry);addGeometry(g,'sand',x+off*sx,.16+row*.27,z+off*sz,0,0,0,false);
      }
      collider(x,.43,z,Math.abs(sx)*3.1+Math.abs(sz)*.6,.86,Math.abs(sz)*3.1+Math.abs(sx)*.6,'sand',true,true);
    }
    for(const [x,z,ry]of [[0,18,0],[0,-18,0],[-20,2,Math.PI/2],[20,-2,Math.PI/2],[-4,28,0],[4,-28,0]]) sandbags(x,z,ry);
    truck(-25,1.1,Math.PI/2); truck(25,-1.1,-Math.PI/2); truck(15,-27,Math.PI/2);
    for(const [x,z]of [[-26,-18],[-15,-12],[17,16],[24,11],[23,-17],[-23,17]])crate(x,z,2.1,1.7,1.35,.11);
    for(const [x,z]of [[-28,25],[28,-25],[-6,12],[6,-12]]) { drum(x,z,'canvas'); drum(x+.8,z+.1); }
    barrier(-5,-22,3.4);barrier(5,22,3.4);
    vent(-24,-16,4.38,2.2);vent(24,16,4.38,2.2);
    // Communications equipment on northwestern command roof.
    cylinder(-16,5.3,-18,.12,1.8,'steel');
    const dish=new THREE.SphereGeometry(1.3,16,9,0,TAU,0,Math.PI*.43);dish.rotateX(Math.PI*.68);addGeometry(dish,'light',-16,6.3,-18,0,0,0,false);
    beam([-16,6,-18],[-16,7.1,-17.2],.045,'steel');
    sign('COMMAND', '07 / OPERATIONS',-20,3.3,-6.78,7,.8);sign('BARRACKS', 'AUTHORIZED PERSONNEL',20,3.3,23.22,7,.8);
    sign('MOTOR POOL', 'SERVICE & MAINTENANCE',-21,3.3,22.22,8,.9);sign('ARMORY', 'RESTRICTED ACCESS',21,3.3,-7.78,7,.9);
    for(const [x,z]of [[-30,-5],[30,6],[-7,-28],[7,28]])lamp(x,z,6.2);
    for(const [x,z,h]of [[-38,-20,10],[-37,11,11],[38,20,10],[39,-15,12],[-15,-39,11],[14,39,10]])palm(x,z,h);
    // Layered low dunes and eroded rock provide a horizon without extra textures.
    for(let i=0;i<13;i++) {
      const angle=i/13*TAU, r=65+(i%3)*6;
      sphere(Math.cos(angle)*r,0,Math.sin(angle)*r,1,14+i%4,6+i%5,12+i%3,'sand');
    }
    for(const s of [-1,1]) for(let i=0;i<8;i++) { const z=-28+i*8; cylinder(s*32.4,3.65,z,.035,1.3,'steel'); }
  }

  // Visible at encounter cover positions, outside doors and respawn pockets.
  const fuelPositions=id==='urban'?[[ -4,16,0 ],[ 13,-1,0 ],[ -24,6,0 ]]:id==='industrial'?[[ 4,7,0 ],[ 16,-8,0 ],[ -16,12,.11 ]]:[[ 3.8,10.4,0 ],[ -13,-2,0 ],[ 24,-5,0 ]];
  for(const [x,z,y] of fuelPositions)fuelBarrel(x,z,y);

  // Environmental backdrop and lighting: restrained haze, readable shadows.
  const hemi = new THREE.HemisphereLight(0xd4e2e4, id === 'desert' ? 0x947349 : 0x727b65, 2.35); group.add(hemi);
  const sun = new THREE.DirectionalLight(id === 'industrial' ? 0xffdeb0 : 0xffecd0, id === 'desert' ? 3.15 : 2.9);
  sun.position.set(-28, id === 'industrial' ? 28 : 42, 23); sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024); sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 130; sun.shadow.normalBias = .025; sun.shadow.bias = -.00012; sun.shadow.radius = 2; group.add(sun); group.add(sun.target);
  scene.background = new THREE.Color(tones.sky); scene.fog = new THREE.FogExp2(tones.sky, id === 'desert' ? .007 : .005);
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(id === 'desert' ? 0x7ea9b6 : 0x779eb5) }, bottom: { value: new THREE.Color(id === 'desert' ? 0xe8d8b9 : 0xd9dacc) } }, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 vDirection; uniform vec3 top;uniform vec3 bottom; void main(){float h=normalize(vDirection).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.02,.8,h)),1.0);}' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 20, 12), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; group.add(sky);
  for (const [name, geoms] of batches) {
    if (!geoms.length) continue;
    const mesh = new THREE.Mesh(merged(geoms), mats[name]); mesh.castShadow = !['lightStrip','redLight'].includes(name); mesh.receiveShadow = true; mesh.name = `static-${name}`; group.add(mesh);
  }
  batches.clear();

  // A small stable uniform grid makes character queries independent of total detail.
  const cellSize = 4, spatial = new Map();
  const key = (x, z) => `${x},${z}`;
  for (const c of colliders) for (let ix = Math.floor(c.min.x / cellSize); ix <= Math.floor(c.max.x / cellSize); ix++) for (let iz = Math.floor(c.min.z / cellSize); iz <= Math.floor(c.max.z / cellSize); iz++) {
    const k = key(ix,iz); if (!spatial.has(k)) spatial.set(k, []); spatial.get(k).push(c);
  }
  function isFree(x, y, z, radius = .34, height = 1.78) {
    if (x-radius < bounds.minX || x+radius > bounds.maxX || z-radius < bounds.minZ || z+radius > bounds.maxZ) return false;
    for(let ix=Math.floor((x-radius)/cellSize);ix<=Math.floor((x+radius)/cellSize);ix++) for(let iz=Math.floor((z-radius)/cellSize);iz<=Math.floor((z+radius)/cellSize);iz++) {
      const list=spatial.get(key(ix,iz)); if(!list)continue;
      for(const c of list) {
        if(c.disabled)continue;
        if(y >= c.max.y-.012 || y+height <= c.min.y+.012)continue;
        const nx=THREE.MathUtils.clamp(x,c.min.x,c.max.x),nz=THREE.MathUtils.clamp(z,c.min.z,c.max.z),dx=x-nx,dz=z-nz;
        if(dx*dx+dz*dz < radius*radius-.000001)return false;
      }
    }
    return true;
  }
  function groundHeight(x, z, feetY = Infinity, step = .38) {
    let result = 0; const limit = feetY + step;
    const list = spatial.get(key(Math.floor(x / cellSize), Math.floor(z / cellSize))); if (!list) return result;
    for (const c of list) if(!c.disabled && c.walkable && x >= c.min.x-.003 && x <= c.max.x+.003 && z >= c.min.z-.003 && z <= c.max.z+.003 && c.max.y <= limit + .008 && c.max.y >= result) result = c.max.y;
    return result;
  }
  function raycast(origin, direction, maxDistance = 200) {
    let closest = maxDistance, winner = null, axis = 0, signNormal = 0;
    // Slab intersections are allocation-free until the final, closest hit.
    for (const c of colliders) {
      if(c.disabled)continue;
      let near = -Infinity, far = Infinity, hitAxis = 0, hitSign = 0, valid = true;
      for (let a=0;a<3;a++) {
        const prop=a===0?'x':a===1?'y':'z', o=origin[prop], d=direction[prop];
        if(Math.abs(d)<1e-9){if(o<c.min[prop]||o>c.max[prop]){valid=false;break;}continue;}
        let t1=(c.min[prop]-o)/d,t2=(c.max[prop]-o)/d,sg=-1;
        if(t1>t2){const tmp=t1;t1=t2;t2=tmp;sg=1;}
        if(t1>near){near=t1;hitAxis=a;hitSign=sg;} far=Math.min(far,t2);
        if(near>far){valid=false;break;}
      }
      if(!valid||far<.0001)continue;
      const distance=near>=.0001?near:far;
      if(distance < closest){closest=distance;winner=c;axis=hitAxis;signNormal=near>=.0001?hitSign:-hitSign;}
    }
    if(!winner)return null;
    const normal=new V();normal.setComponent(axis,signNormal);
    return { distance:closest,point:origin.clone().addScaledVector(direction,closest),normal,surface:winner.surface,penetrable:winner.penetrable,collider:winner };
  }

  // Multi-level sparse navigation lattice. Floors, roofs and staircase treads are
  // linked only when an actual cylinder can traverse the connection.
  const navClear=(x,y,z)=>isFree(x,y+.025,z,.37,1.78)||isFree(x,y+.39,z,.37,1.78);
  const spacing=1.2, n=Math.floor(62/spacing), nodes=[], columns=new Map(), min=-31;
  for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++) {
    const x=min+ix*spacing,z=min+iz*spacing,heights=[0], list=spatial.get(key(Math.floor(x/cellSize),Math.floor(z/cellSize)))||[];
    for(const c of list)if(!c.disabled&&c.walkable&&c.max.y>.04&&c.max.y<8&&x>=c.min.x-.003&&x<=c.max.x+.003&&z>=c.min.z-.003&&z<=c.max.z+.003&&!heights.some(y=>Math.abs(y-c.max.y)<.04))heights.push(c.max.y);
    const col=[];
    for(const rawY of heights){const y=groundHeight(x,z,rawY,.38);if(!col.some(node=>Math.abs(node.y-y)<.03)&&navClear(x,y,z)){const node={x,y,z,ix,iz,id:nodes.length,edges:[]};nodes.push(node);col.push(node);}}
    if(col.length)columns.set(ix+iz*n,col);
  }
  for(const node of nodes)for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
    const ix=node.ix+dx,iz=node.iz+dz;if(ix<0||iz<0||ix>=n||iz>=n)continue;
    const col=columns.get(ix+iz*n);if(!col)continue;
    for(const other of col){
      const dy=other.y-node.y;if(dy>.77||dy<-.95)continue;
      let clear=true;
      for(const t of [.33,.66]){const x=node.x+(other.x-node.x)*t,z=node.z+(other.z-node.z)*t,approx=node.y+dy*t;const y=groundHeight(x,z,approx,.5);if(Math.abs(y-approx)>.65||!navClear(x,y,z)){clear=false;break;}}
      if(clear)node.edges.push({node:other,cost:Math.hypot(dx,dz)*spacing+Math.abs(dy)*.8});
    }
  }
  function nearest(p) {
    let best=null,score=Infinity;
    const ix=Math.round((p.x-min)/spacing),iz=Math.round((p.z-min)/spacing);
    for(let radius=0;radius<=5;radius++){
      for(let xx=ix-radius;xx<=ix+radius;xx++)for(let zz=iz-radius;zz<=iz+radius;zz++){
        if(xx<0||zz<0||xx>=n||zz>=n)continue;const col=columns.get(xx+zz*n);if(!col)continue;
        for(const node of col){const s=(node.x-p.x)**2+(node.z-p.z)**2+Math.abs(node.y-p.y)*8;if(s<score){score=s;best=node;}}
      }
      if(best&&score<spacing*spacing*(radius+1)*(radius+1))break;
    }
    return best;
  }
  const visit=new Uint32Array(nodes.length),closed=new Uint32Array(nodes.length),costs=new Float64Array(nodes.length),parents=new Int32Array(nodes.length);let searchStamp=0;
  function findPath(from,to){
    const start=nearest(from),end=nearest(to);if(!start||!end)return[];
    if(start===end)return[new V(end.x,end.y,end.z)];
    const stamp=++searchStamp,heap=[],rank=[];
    const push=(node,value)=>{let i=heap.length;heap.push(node);rank.push(value);while(i>0){const p=(i-1)>>1;if(rank[p]<=value)break;heap[i]=heap[p];rank[i]=rank[p];i=p;}heap[i]=node;rank[i]=value;};
    const pop=()=>{const result=heap[0],last=heap.pop(),value=rank.pop();if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&rank[c+1]<rank[c])c++;if(rank[c]>=value)break;heap[i]=heap[c];rank[i]=rank[c];i=c;}heap[i]=last;rank[i]=value;}return result;};
    const heuristic=node=>Math.hypot(node.x-end.x,node.z-end.z)+Math.abs(node.y-end.y);
    visit[start.id]=stamp;costs[start.id]=0;parents[start.id]=-1;push(start,heuristic(start));let found=null,limit=0,best=start,bestH=heuristic(start);
    while(heap.length&&limit++<4800){const node=pop();if(closed[node.id]===stamp)continue;closed[node.id]=stamp;const h=heuristic(node);if(h<bestH){bestH=h;best=node;}if(node===end){found=node;break;}
      for(const edge of node.edges){const next=edge.node;if(closed[next.id]===stamp)continue;const cost=costs[node.id]+edge.cost;if(visit[next.id]!==stamp||cost<costs[next.id]){visit[next.id]=stamp;costs[next.id]=cost;parents[next.id]=node.id;push(next,cost+heuristic(next));}}
    }
    let current=found||best;const path=[];while(current&&current!==start){path.push(new V(current.x,current.y,current.z));const parent=parents[current.id];current=parent<0?null:nodes[parent];}path.reverse();return path;
  }

  const spawns = [
    {x:-5,y:0,z:27.5,team:0,yaw:0},{x:5,y:0,z:29,team:0,yaw:0},{x:-28,y:0,z:27,team:0,yaw:0},{x:27,y:0,z:27,team:0,yaw:0},
    {x:5,y:0,z:-27.5,team:1,yaw:Math.PI},{x:-5,y:0,z:-29,team:1,yaw:Math.PI},{x:28,y:0,z:-27,team:1,yaw:Math.PI},{x:-27,y:0,z:-27,team:1,yaw:Math.PI},
    {x:-28,y:0,z:4,team:0,yaw:-Math.PI/2},{x:28,y:0,z:-4,team:1,yaw:Math.PI/2},
  ];
  for(const spawn of spawns){
    spawn.y=groundHeight(spawn.x,spawn.z,0,.4);
    if(!isFree(spawn.x,spawn.y+.02,spawn.z,.4,1.8)){
      const free=nearest(new V(spawn.x,spawn.y,spawn.z));if(free){spawn.x=free.x;spawn.y=free.y;spawn.z=free.z;}
    }
  }
  const objectives=[{id:'A',name:id==='industrial'?'LOADING':'SOUTH',pos:new V(0,0,24)},{id:'B',name:id==='industrial'?'TRANSFER':'COURTYARD',pos:new V(0,0,0)},{id:'C',name:id==='industrial'?'SILOS':'NORTH',pos:new V(0,0,-24)}];
  for(const objective of objectives)objective.pos.y=groundHeight(objective.pos.x,objective.pos.z,0,.38)+.02;
  // Tiny visual objective plates remain legible without adding artificial obstacles.
  for(const objective of objectives){
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.9,2.04,48),new THREE.MeshBasicMaterial({color:0xc6c4a8,transparent:true,opacity:.44,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.copy(objective.pos);ring.position.y+=.015;group.add(ring);
  }
  const world = {
    id, group, colliders, explosives, bounds, spawns, objectives, sun, isFree, groundHeight, raycast, findPath,
    navigation: {nodes:nodes.length, edges:nodes.reduce((sum,node)=>sum+node.edges.length,0)},
    update(dt,time){for(const m of moving)m.update(dt,time);},
    dispose(){
      const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>materials.add(m));else materials.add(o.material);}if(o.isLight&&o.shadow?.map)o.shadow.map.dispose();});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());resources.forEach(t=>t.dispose());Object.values(mats).forEach(m=>{if(!materials.has(m))m.dispose();});group.removeFromParent();spatial.clear();
    },
  };
  return world;
}
