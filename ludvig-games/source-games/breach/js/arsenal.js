/* BREACH — original procedural weapons, operators and synthesized audio. */

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const damp = (a, b, speed, dt) => a + (b - a) * (1 - Math.exp(-speed * dt));

function palette(T) {
  const mat = (color, roughness = .65, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  return {
    steel: mat(0x303b41, .35, .85), steelLight: mat(0x657079, .34, .88),
    black: mat(0x11171a, .58, .34), polymer: mat(0x252b28, .86, .07),
    grip: mat(0x1e2423, .97, 0), sand: mat(0x6b7164, .9, 0),
    skin: mat(0x94755f, .94, 0), glove: mat(0x30382d, .95, 0),
    sleeve: mat(0x47534a, .94, 0), brass: mat(0xa8914b, .26, .9),
    red: new T.MeshStandardMaterial({ color: 0xee593d, emissive: 0xa62614, emissiveIntensity: .85, roughness: .4 }),
    lens: new T.MeshStandardMaterial({ color: 0x25556a, transparent: true, opacity: .5, roughness: .08, metalness: .4 }),
  };
}

function box(T, parent, material, size, position, rotation) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function cylinder(T, parent, material, rt, rb, length, position, axis = 'z', segments = 12) {
  const mesh = new T.Mesh(new T.CylinderGeometry(rt, rb, length, segments), material);
  mesh.position.set(...position);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function capsule(T, parent, material, radius, length, start, end) {
  const mesh = new T.Mesh(new T.CapsuleGeometry(radius, length, 4, 8), material);
  const a = new T.Vector3(...start), b = new T.Vector3(...end);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  parent.add(mesh);
  return mesh;
}

function ring(T, parent, material, radius, tube, position, axis = 'z') {
  const mesh = new T.Mesh(new T.TorusGeometry(radius, tube, 6, 18), material);
  mesh.position.set(...position);
  if (axis === 'y') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

// Bake rigid details into one geometry per material. Articulated child groups
// stay independent; dozens of small armor and rail parts do not cost a draw each.
function mergeRigidChildren(T, parent) {
  const batches = new Map(), originals = new Set();
  for (const child of [...parent.children]) {
    if (!child.isMesh || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const copy = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    copy.applyMatrix4(child.matrix);
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(copy);
    originals.add(child.geometry); parent.remove(child);
  }
  for (const [material, list] of batches) {
    const geometry = new T.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) {
      const first = list[0].getAttribute(name); if (!first) continue;
      const count = list.reduce((total, g) => total + g.getAttribute(name).array.length, 0);
      const combined = new Float32Array(count); let offset = 0;
      for (const g of list) { const array = g.getAttribute(name).array; combined.set(array, offset); offset += array.length; }
      geometry.setAttribute(name, new T.BufferAttribute(combined, first.itemSize));
    }
    geometry.computeBoundingSphere();
    parent.add(new T.Mesh(geometry, material));
    list.forEach(g => g.dispose());
  }
  originals.forEach(g => g.dispose());
}

function makeRifle(T, p, simplified = false) {
  const gun = new T.Group();
  // A compact, believable 5.56 carbine. +Z is the stock, -Z is the muzzle.
  box(T, gun, p.steel, [.068, .082, .266], [0, .016, -.115]);
  box(T, gun, p.black, [.062, .052, .185], [0, -.043, -.052]);
  box(T, gun, p.steelLight, [.006, .025, .062], [.036, .019, -.086]);
  box(T, gun, p.black, [.009, .015, .078], [.041, .025, -.084]);
  box(T, gun, p.steelLight, [.018, .012, .025], [.048, .028, -.052]);
  // Handguard and free-floating barrel.
  cylinder(T, gun, p.steel, .043, .043, .254, [0, .014, -.367], 'z', 8);
  cylinder(T, gun, p.black, .012, .012, .19, [0, .014, -.566]);
  cylinder(T, gun, p.steelLight, .020, .017, .055, [0, .014, -.653]);
  cylinder(T, gun, p.black, .0115, .0115, .003, [0, .014, -.683]);
  box(T, gun, p.black, [.037, .017, .52], [0, .061, -.255]);
  if (!simplified) {
    for (let i = 0; i < 24; i++) box(T, gun, p.steel, [.043, .008, .008], [0, .073, -.008 - i * .020]);
    for (let i = 0; i < 7; i++) {
      box(T, gun, p.black, [.003, .013, .02], [.041, .023, -.277 - i * .027]);
      box(T, gun, p.black, [.003, .013, .02], [-.041, .023, -.277 - i * .027]);
      box(T, gun, p.black, [.022, .003, .015], [0, -.028, -.29 - i * .027]);
    }
    for (let i = 0; i < 3; i++) box(T, gun, p.black, [.043, .008, .007], [0, .016, -.64 - i * .013]);
    // Trigger guard, trigger, selector, takedown pins and screws.
    box(T, gun, p.steel, [.019, .01, .065], [0, -.103, .008]);
    box(T, gun, p.steel, [.019, .045, .01], [0, -.079, -.026]);
    box(T, gun, p.steelLight, [.009, .032, .009], [0, -.074, .012], [.25, 0, 0]);
    cylinder(T, gun, p.steelLight, .006, .006, .004, [.036, -.022, .025], 'x');
    cylinder(T, gun, p.steelLight, .005, .005, .005, [.036, -.026, -.108], 'x');
    box(T, gun, p.steelLight, [.007, .009, .022], [-.037, -.028, .018], [.6, 0, 0]);
  }
  box(T, gun, p.grip, [.048, .135, .060], [0, -.122, .052], [-.29, 0, 0]);
  box(T, gun, p.polymer, [.057, .025, .064], [0, -.182, .071], [-.29, 0, 0]);
  cylinder(T, gun, p.steel, .022, .022, .141, [0, .006, .092]);
  box(T, gun, p.polymer, [.065, .085, .164], [0, -.004, .172]);
  box(T, gun, p.grip, [.073, .13, .027], [0, -.019, .254], [.06, 0, 0]);
  box(T, gun, p.polymer, [.045, .034, .104], [0, -.071, .18], [-.16, 0, 0]);
  const magazine = new T.Group();
  magazine.position.set(0, -.066, -.111);
  magazine.rotation.x = .13;
  gun.add(magazine);
  box(T, magazine, p.polymer, [.054, .15, .082], [0, -.063, -.007]);
  box(T, magazine, p.polymer, [.054, .065, .082], [0, -.157, -.016], [.16, 0, 0]);
  box(T, magazine, p.black, [.061, .013, .087], [0, -.19, -.022], [.16, 0, 0]);
  if (!simplified) for (let i = 0; i < 4; i++) box(T, magazine, p.black, [.058, .005, .081], [0, -.035 - i * .035, -.007 - i * .003]);
  // Open holographic sight. The center stays transparent while aiming.
  box(T, gun, p.black, [.057, .024, .085], [0, .091, -.075]);
  box(T, gun, p.steel, [.012, .061, .040], [-.027, .128, -.073], [0, 0, -.12]);
  box(T, gun, p.steel, [.012, .061, .040], [.027, .128, -.073], [0, 0, .12]);
  box(T, gun, p.steel, [.059, .011, .040], [0, .157, -.073]);
  if (!simplified) {
    box(T, gun, p.lens, [.040, .045, .002], [0, .127, -.078]);
    // The reticle is tiny and doesn't create a red block in the player's sightline.
    const dot = new T.Mesh(new T.SphereGeometry(.0018, 6, 5), p.red);
    dot.position.set(0, .128, -.070); gun.add(dot);
    cylinder(T, gun, p.black, .013, .013, .012, [.037, .108, -.065], 'x');
    box(T, gun, p.sand, [.022, .005, .093], [-.022, -.029, -.365], [0, 0, -.1]);
  }
  gun.userData.magazine = magazine;
  gun.userData.muzzle = [0, .014, -.69];
  mergeRigidChildren(T, magazine);
  mergeRigidChildren(T, gun);
  return gun;
}

function makePistol(T, p) {
  const gun = new T.Group();
  box(T, gun, p.steel, [.056, .052, .233], [0, .029, -.11]);
  box(T, gun, p.black, [.050, .034, .185], [0, -.010, -.082]);
  box(T, gun, p.polymer, [.049, .127, .064], [0, -.091, .013], [-.2, 0, 0]);
  box(T, gun, p.black, [.056, .014, .070], [0, -.15, .024], [-.2, 0, 0]);
  cylinder(T, gun, p.steelLight, .016, .016, .012, [0, .025, -.231]);
  cylinder(T, gun, p.black, .009, .009, .013, [0, .025, -.235]);
  box(T, gun, p.black, [.017, .008, .012], [0, .06, -.205]);
  box(T, gun, p.black, [.040, .011, .015], [0, .061, -.005]);
  box(T, gun, p.red, [.004, .003, .003], [0, .066, -.198]);
  box(T, gun, p.steelLight, [.030, .002, .045], [0, .056, -.08]);
  box(T, gun, p.black, [.019, .009, .060], [0, -.061, -.05]);
  box(T, gun, p.black, [.019, .046, .01], [0, -.039, -.081]);
  box(T, gun, p.steel, [.007, .030, .01], [0, -.037, -.046], [.2, 0, 0]);
  for (let i = 0; i < 6; i++) {
    box(T, gun, p.black, [.001, .036, .003], [.029, .029, -.01 - i * .009], [.10, 0, 0]);
    box(T, gun, p.black, [.001, .036, .003], [-.029, .029, -.01 - i * .009], [.10, 0, 0]);
  }
  gun.userData.muzzle = [0, .025, -.25];
  mergeRigidChildren(T, gun);
  return gun;
}

function addHand(T, parent, p, position, rotation = [0, 0, 0], scale = 1) {
  const hand = new T.Group(); hand.position.set(...position); hand.rotation.set(...rotation); hand.scale.setScalar(scale);
  parent.add(hand);
  const palm = new T.Mesh(new T.CapsuleGeometry(.027, .035, 4, 8), p.glove);
  palm.rotation.z = Math.PI / 2; palm.scale.set(1, 1, .75); hand.add(palm);
  box(T, hand, p.polymer, [.044, .022, .015], [0, .019, -.016]);
  for (let f = 0; f < 4; f++) {
    const finger = new T.Mesh(new T.CapsuleGeometry(.0075, .026, 3, 6), p.glove);
    finger.rotation.x = .9; finger.position.set(-.026 + f * .016, -.012, -.027); hand.add(finger);
    const knuckle = new T.Mesh(new T.SphereGeometry(.008, 5, 4), p.polymer);
    knuckle.position.set(-.026 + f * .016, .004, -.026); hand.add(knuckle);
  }
  capsule(T, hand, p.glove, .01, .026, [-.037, -.003, .009], [-.026, -.03, -.019]);
  mergeRigidChildren(T, hand);
  return hand;
}

export function createViewWeapon(T, camera) {
  const group = new T.Group(); group.name = 'first-person-weapon'; camera.add(group);
  const p = palette(T), rifle = makeRifle(T, p), pistol = makePistol(T, p);
  const weaponRoot = new T.Group(); group.add(weaponRoot); weaponRoot.add(rifle, pistol); pistol.visible = false;
  const arms = new T.Group(); group.add(arms);
  const rifleHands = new T.Group(); arms.add(rifleHands);
  capsule(T, rifleHands, p.sleeve, .053, .19, [.19, -.27, .30], [.085, -.17, .10]);
  capsule(T, rifleHands, p.glove, .038, .075, [.08, -.165, .11], [.025, -.12, .065]);
  addHand(T, rifleHands, p, [.015, -.115, .048], [.6, .15, .22], 1.04);
  capsule(T, rifleHands, p.sleeve, .051, .21, [-.23, -.29, .20], [-.14, -.15, -.16]);
  capsule(T, rifleHands, p.glove, .036, .105, [-.14, -.145, -.17], [-.055, -.068, -.32]);
  addHand(T, rifleHands, p, [-.025, -.055, -.338], [-.2, .1, 1.05], 1.06);
  box(T, rifleHands, p.black, [.064, .033, .040], [-.119, -.127, -.20], [-.2, 0, .42]);
  box(T, rifleHands, p.steelLight, [.040, .006, .027], [-.12, -.106, -.20], [-.2, 0, .42]);
  const pistolHands = new T.Group(); arms.add(pistolHands); pistolHands.visible = false;
  capsule(T, pistolHands, p.sleeve, .052, .24, [.19, -.25, .34], [.047, -.13, .08]);
  capsule(T, pistolHands, p.sleeve, .052, .24, [-.22, -.25, .32], [-.07, -.13, .07]);
  addHand(T, pistolHands, p, [.015, -.095, .015], [.45, .1, .1], 1.05);
  addHand(T, pistolHands, p, [-.025, -.09, -.013], [.6, -.25, .65], 1.04);
  mergeRigidChildren(T, rifleHands);
  mergeRigidChildren(T, pistolHands);

  const muzzle = new T.Object3D(); group.add(muzzle);
  const flash = new T.Group(); muzzle.add(flash); flash.visible = false;
  const flashMat = new T.MeshBasicMaterial({ color: 0xffdf8f, transparent: true, opacity: .92, depthWrite: false, blending: T.AdditiveBlending });
  const outerMat = new T.MeshBasicMaterial({ color: 0xff822c, transparent: true, opacity: .65, depthWrite: false, blending: T.AdditiveBlending });
  const flashCore = new T.Mesh(new T.ConeGeometry(.024, .17, 6), flashMat);
  flashCore.rotation.x = -Math.PI / 2; flashCore.position.z = -.055; flash.add(flashCore);
  for (let i = 0; i < 3; i++) {
    const petal = new T.Mesh(new T.PlaneGeometry(.12, .22), outerMat);
    petal.rotation.y = i * Math.PI / 3; petal.rotation.x = Math.PI / 2; petal.position.z = -.06; flash.add(petal);
  }
  const muzzleLight = new T.PointLight(0xffb45d, 0, 2.6, 2); muzzle.add(muzzleLight);
  let current = 0, aimValue = 0, sprintValue = 0, movement = 0, lastRecoil = 0, flashTime = 0, lastTime = 0;
  group.traverse(o => {
    if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; }
  });
  function setWeapon(index) {
    current = index === 1 ? 1 : 0;
    rifle.visible = rifleHands.visible = current === 0;
    pistol.visible = pistolHands.visible = current === 1;
    muzzle.position.set(...(current ? pistol : rifle).userData.muzzle);
    flash.visible = false; muzzleLight.intensity = 0; lastRecoil = 0;
  }
  setWeapon(0);
  return {
    group, muzzle, setWeapon,
    update({ dt = .016, time = 0, moving = 0, sprinting = false, aim = 0, recoil = 0, reloadProgress = -1, weapon = current } = {}) {
      dt = clamp(dt, 0, .1);
      if (weapon !== current) setWeapon(weapon);
      aimValue = damp(aimValue, clamp(Number(aim) || 0, 0, 1), 15, dt);
      sprintValue = damp(sprintValue, sprinting ? 1 : 0, 9, dt);
      movement = damp(movement, typeof moving === 'boolean' ? +moving : clamp(moving, 0, 1), 9, dt);
      const aiming = aimValue * (1 - sprintValue);
      const rate = sprintValue > .4 ? 13 : 9;
      const bob = Math.sin(time * rate) * movement * (1 - aiming * .85);
      const sway = Math.cos(time * rate * .5) * movement * (1 - aiming * .85);
      const idle = Math.sin(time * 1.7) * .0015;
      const activeReload = Number.isFinite(reloadProgress) && reloadProgress > 0 && reloadProgress < 1;
      const reload = activeReload ? Math.sin(Math.PI * reloadProgress) : 0;
      const r = clamp(recoil || 0, 0, 2);
      const baseX = current ? .20 : .235;
      const baseY = current ? -.20 : -.24;
      const sightY = current ? -.063 : -.128;
      group.position.set(
        baseX * (1 - aiming) + sway * .008 - reload * .055,
        baseY * (1 - aiming) + sightY * aiming + bob * .006 + idle - sprintValue * .065 - reload * .10,
        -.39 + aiming * .095 + r * .036 + Math.abs(bob) * .005 - sprintValue * .035
      );
      group.rotation.set(r * .06 - sprintValue * .23 + reload * .30, -sprintValue * .26 - reload * .16 + sway * .006, -sprintValue * .22 - reload * .40 + sway * .008);
      rifle.userData.magazine.position.y = -.066 - (activeReload ? Math.sin(Math.PI * clamp((reloadProgress - .14) / .7, 0, 1)) * .22 : 0);
      if (r > lastRecoil + .045 && time - lastTime > .035) { flashTime = .045; lastTime = time; flash.rotation.z = Math.random() * 6.28; }
      flashTime = Math.max(0, flashTime - dt);
      flash.visible = flashTime > 0;
      flash.scale.setScalar(current ? .75 : 1);
      muzzleLight.intensity = flashTime > 0 ? 2.4 : 0;
      lastRecoil = r;
    },
  };
}

export function createOperator(T, { color = 0xbc5c40 } = {}) {
  const group = new T.Group(); group.name = 'operator';
  const p = palette(T);
  const cloth = new T.MeshStandardMaterial({ color: 0x48554f, roughness: .98 });
  const armor = new T.MeshStandardMaterial({ color: 0x343c37, roughness: .88 });
  const boots = new T.MeshStandardMaterial({ color: 0x222923, roughness: .92 });
  const accent = new T.MeshStandardMaterial({ color, roughness: .69, emissive: color, emissiveIntensity: .10 });
  const mask = new T.MeshStandardMaterial({ color: 0x313b35, roughness: 1 });
  const goggles = new T.MeshStandardMaterial({ color: 0x1d2e30, roughness: .13, metalness: .68 });
  const body = new T.Group(); body.position.y = .91; group.add(body);
  // Rounded torso and restrained armor proportions.
  const torso = new T.Mesh(new T.CapsuleGeometry(.171, .255, 4, 10), cloth);
  torso.position.y = .265; torso.scale.set(1.17, 1, .74); body.add(torso);
  box(T, body, armor, [.345, .340, .105], [0, .285, -.115]);
  box(T, body, armor, [.29, .30, .10], [0, .29, .12]);
  box(T, body, p.sand, [.041, .41, .022], [-.139, .30, -.178], [0, 0, -.06]);
  box(T, body, p.sand, [.041, .41, .022], [.139, .30, -.178], [0, 0, .06]);
  for (let i = 0; i < 3; i++) {
    box(T, body, p.sand, [.072, .125, .057], [-.089 + .089 * i, .20, -.191]);
    box(T, body, armor, [.074, .025, .061], [-.089 + .089 * i, .267, -.194]);
  }
  box(T, body, accent, [.105, .025, .004], [0, .385, -.174]);
  box(T, body, armor, [.37, .075, .24], [0, -.005, .006]);
  box(T, body, p.black, [.060, .048, .014], [0, -.005, -.123]);
  box(T, body, cloth, [.23, .30, .15], [0, .25, .208]);
  box(T, body, armor, [.235, .075, .17], [0, .37, .21]);
  cylinder(T, body, cloth, .045, .045, .18, [.198, .12, .098], 'y');
  const head = new T.Group(); head.position.set(0, .70, -.006); body.add(head);
  cylinder(T, body, p.skin, .061, .065, .14, [0, .57, 0], 'y');
  const face = new T.Mesh(new T.SphereGeometry(.111, 12, 10), p.skin);
  face.scale.set(.92, 1.17, .95); head.add(face);
  const balaclava = new T.Mesh(new T.SphereGeometry(.113, 12, 8), mask);
  balaclava.scale.set(.94, .63, .96); balaclava.position.set(0, -.043, -.006); head.add(balaclava);
  const helmet = new T.Mesh(new T.SphereGeometry(.132, 12, 9, 0, Math.PI * 2, 0, Math.PI * .57), armor);
  helmet.scale.set(1, .93, 1.06); helmet.position.y = .048; head.add(helmet);
  box(T, head, armor, [.240, .037, .13], [0, .041, -.074]);
  box(T, head, goggles, [.190, .050, .035], [0, .012, -.103]);
  box(T, head, p.black, [.022, .052, .040], [0, .01, -.111]);
  cylinder(T, head, p.black, .04, .04, .021, [-.126, -.01, .008], 'x');
  cylinder(T, head, p.black, .04, .04, .021, [.126, -.01, .008], 'x');
  box(T, head, p.black, [.035, .026, .040], [0, .106, -.091]);
  box(T, head, accent, [.060, .030, .012], [0, .070, .128]);

  const legs = [];
  for (const side of [-1, 1]) {
    const thigh = new T.Group(); thigh.position.set(side * .112, .90, .015); group.add(thigh);
    const thighMesh = new T.Mesh(new T.CapsuleGeometry(.087, .23, 4, 8), cloth);
    thighMesh.position.y = -.17; thighMesh.scale.z = .86; thigh.add(thighMesh);
    box(T, thigh, cloth, [.052, .14, .12], [side * .074, -.17, .016]);
    const shin = new T.Group(); shin.position.set(0, -.36, 0); thigh.add(shin);
    const calf = new T.Mesh(new T.CapsuleGeometry(.065, .33, 4, 8), cloth);
    calf.position.y = -.20; shin.add(calf);
    const knee = new T.Mesh(new T.SphereGeometry(.075, 8, 6), armor);
    knee.scale.set(1, 1.13, .46); knee.position.set(0, .009, -.059); shin.add(knee);
    const boot = new T.Mesh(new T.CapsuleGeometry(.068, .10, 3, 8), boots);
    boot.rotation.x = Math.PI / 2; boot.scale.set(1, 1, .8); boot.position.set(0, -.46, -.038); shin.add(boot);
    box(T, shin, boots, [.129, .035, .225], [0, -.51, -.040]);
    mergeRigidChildren(T, shin);
    mergeRigidChildren(T, thigh);
    legs.push({ thigh, shin, side });
  }
  const arms = new T.Group(); body.add(arms);
  // Weapons are shouldered, with wrists meeting the handguard and pistol grip.
  capsule(T, arms, cloth, .072, .16, [.22, .42, -.015], [.255, .20, -.15]);
  capsule(T, arms, cloth, .057, .19, [.255, .20, -.15], [.11, .27, -.37]);
  capsule(T, arms, cloth, .072, .17, [-.22, .42, -.005], [-.24, .19, -.16]);
  capsule(T, arms, cloth, .057, .23, [-.24, .19, -.16], [.025, .28, -.46]);
  const shoulderL = new T.Mesh(new T.SphereGeometry(.08, 8, 6), armor);
  shoulderL.scale.y = 1.2; shoulderL.position.set(-.235, .415, 0); arms.add(shoulderL);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = .235; arms.add(shoulderR);
  box(T, arms, accent, [.014, .072, .060], [-.302, .42, -.015]);
  box(T, arms, accent, [.014, .072, .060], [.302, .42, -.015]);
  const rightHand = new T.Mesh(new T.SphereGeometry(.047, 8, 6), p.glove);
  rightHand.position.set(.105, .268, -.35); rightHand.scale.y = 1.15; arms.add(rightHand);
  const leftHand = rightHand.clone(); leftHand.position.set(.025, .28, -.48); arms.add(leftHand);
  const gun = makeRifle(T, p, true); gun.scale.setScalar(.77); gun.position.set(.105, .35, -.36); arms.add(gun);
  mergeRigidChildren(T, head);
  mergeRigidChildren(T, body);
  mergeRigidChildren(T, arms);
  const muzzle = new T.Object3D(); muzzle.position.set(0, .014, -.69); gun.add(muzzle);
  const flash = new T.Mesh(new T.ConeGeometry(.032, .18, 5), new T.MeshBasicMaterial({ color: 0xffcf69, transparent: true, opacity: .85, depthWrite: false, blending: T.AdditiveBlending }));
  flash.rotation.x = -Math.PI / 2; flash.position.z = -.045; muzzle.add(flash); flash.visible = false;
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  let death = 0, gait = Math.random() * 6.28;
  return {
    group, head, muzzle,
    update({ dt = .016, time = 0, speed = 0, dead = false, shooting = false } = {}) {
      dt = clamp(dt, 0, .1);
      death = damp(death, dead ? 1 : 0, dead ? 9 : 20, dt);
      group.scale.y = 1 - death * .68;
      body.rotation.z = death * 1.1;
      body.position.y = .91 - death * .35;
      const amount = clamp(speed / 4, 0, 1);
      gait += dt * (3 + amount * 9);
      for (const { thigh, shin, side } of legs) {
        const wave = Math.sin(gait + (side < 0 ? Math.PI : 0));
        thigh.rotation.x = wave * .57 * amount * (1 - death);
        shin.rotation.x = Math.max(0, -wave) * .62 * amount * (1 - death);
      }
      body.position.y += Math.abs(Math.sin(gait)) * .025 * amount * (1 - death);
      body.rotation.y = Math.sin(gait) * .035 * amount;
      head.rotation.y = Math.sin(time * .7) * .025;
      arms.rotation.x = shooting ? -.027 : 0;
      flash.visible = Boolean(shooting && !dead);
      flash.rotation.z = time * 91;
    },
    dispose() {
      const materials = new Set(), geometries = new Set();
      group.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      group.removeFromParent();
    },
  };
}

export class GameAudio {
  constructor() {
    this.ctx = null; this.master = null; this.volume = .55; this.noise = null;
    this.lastEnemy = -10; this.ambientSource = null; this.enabled = true;
  }
  unlock() {
    try {
      if (!this.ctx) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return Promise.resolve();
        this.ctx = new Context();
        this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -13; compressor.knee.value = 20; compressor.ratio.value = 5;
        compressor.attack.value = .003; compressor.release.value = .14;
        this.master.connect(compressor); compressor.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0); let brown = 0;
        for (let i = 0; i < d.length; i++) {
          const white = Math.random() * 2 - 1; brown = (brown + .035 * white) / 1.035;
          d[i] = white * .72 + brown * 1.8;
        }
      }
      return this.ctx.resume().catch(() => {});
    } catch { return Promise.resolve(); }
  }
  setVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, .03);
  }
  tone(freq, end, duration, gain, type = 'sine', delay = 0) {
    const c = this.ctx; if (!c || c.state !== 'running' || !this.enabled) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + .003);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  burst(duration, gain, freq = 2000, type = 'lowpass', delay = 0, rate = 1) {
    const c = this.ctx; if (!c || c.state !== 'running' || !this.enabled) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = rate; f.type = type; f.frequency.value = freq; f.Q.value = .6;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + .002);
    g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * .7, duration + .05); s.stop(t + duration + .05);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  shot(weapon = 0, enemy = false, distance = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (enemy && now - this.lastEnemy < .028) return;
    if (enemy) this.lastEnemy = now;
    const g = (enemy ? .28 / (1 + Math.max(0, distance) * .055) : .77);
    const pistol = weapon === 1;
    this.burst(pistol ? .095 : .075, g, enemy ? 2200 : 6500, 'highpass', 0, .9 + Math.random() * .2);
    this.burst(pistol ? .19 : .25, g * .6, enemy ? 1100 : 2300, 'lowpass', .012, .85);
    this.tone(pistol ? 150 : 195, 39, pistol ? .13 : .17, g * .66);
    if (!enemy) {
      this.burst(.028, .12, 4800, 'bandpass', .065, 1.4);
      this.burst(.16, g * .12, 1300, 'lowpass', .10, .78);
    }
  }
  reload() {
    this.burst(.06, .20, 2400, 'bandpass', .04);
    this.tone(220, 115, .07, .12, 'triangle', .08);
    this.burst(.08, .20, 1800, 'highpass', .48);
    this.burst(.05, .27, 3400, 'highpass', .82);
    this.tone(360, 145, .06, .12, 'triangle', .86);
  }
  hit(headshot = false) {
    this.tone(headshot ? 1380 : 960, headshot ? 2050 : 610, .065, .19, 'triangle');
    this.burst(.035, .13, 4500, 'highpass');
  }
  kill() { this.tone(690, 620, .11, .16, 'triangle'); this.tone(1040, 1140, .16, .19, 'sine', .045); }
  step() { this.burst(.095, .13, 540, 'lowpass', 0, .65 + Math.random() * .25); this.tone(83, 40, .07, .05); }
  hurt() { this.burst(.13, .33, 600, 'lowpass'); this.tone(110, 43, .20, .25); }
  ui() { this.tone(480, 730, .065, .10, 'triangle'); }
  ambient() {
    const c = this.ctx; if (!c || this.ambientSource || c.state !== 'running') return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; s.playbackRate.value = .48;
    f.type = 'lowpass'; f.frequency.value = 360; g.gain.value = .024;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); this.ambientSource = s;
  }
}
