import * as THREE from './vendor/three.module.min.js';

/* A small articulated equine rig. Every visible leg belongs to its own shoulder/hip. */
export function makeHorse({ color = '#d19460', mane = '#f7dfb3', accent = '#64bdb2', scale = 1, blanket = false } = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(scale);
  const coat = new THREE.MeshStandardMaterial({ color, roughness: .76 });
  const darker = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.77), roughness: .85 });
  const maneMat = new THREE.MeshStandardMaterial({ color: mane, roughness: .9 });
  const muzzleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#332b30'), .34), roughness: .92 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: '#413b37', roughness: .8 });
  const creamMat = new THREE.MeshStandardMaterial({ color: '#fff1d6', roughness: .9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#17262b', roughness: .24 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: .68 });
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  function ellipsoid(parent, material, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(sphere, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function bone(parent, material, start, end, r1, r2 = r1) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), d = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, d.length(), 12), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  ellipsoid(body, coat, 0, 1.48, .06, .46, .55, .92);
  ellipsoid(body, coat, 0, 1.48, -.58, .42, .58, .49);
  ellipsoid(body, coat, 0, 1.48, .67, .49, .53, .48);
  if (blanket) {
    const blanketMat = new THREE.MeshStandardMaterial({ color: '#d96563', roughness: .95 });
    ellipsoid(body, creamMat, 0, 1.96, .07, .475, .15, .61);
    ellipsoid(body, blanketMat, 0, 1.985, .07, .46, .14, .57);
    for (const side of [-1, 1]) { ellipsoid(body, creamMat, side * .425, 1.77, .07, .057, .25, .59); ellipsoid(body, blanketMat, side * .438, 1.79, .07, .05, .23, .55); }
  }
  ellipsoid(body, darker, 0, 1.29, -.59, .35, .4, .4);
  // A tapering, raised neck and a long muzzle retain the horse silhouette from a chase camera.
  bone(body, coat, [0, 1.46, -.58], [0, 2.29, -1.07], .37, .235);
  ellipsoid(body, coat, 0, 2.24, -1.06, .245, .36, .3);
  const head = new THREE.Group(); head.position.set(0, 2.4, -1.22); head.rotation.x = -.15; body.add(head);
  ellipsoid(head, coat, 0, 0, -.08, .245, .285, .39);
  ellipsoid(head, coat, 0, -.12, -.39, .205, .21, .32);
  ellipsoid(head, muzzleMat, 0, -.19, -.58, .205, .165, .175);
  ellipsoid(head, creamMat, 0, .09, -.326, .065, .15, .027);
  ellipsoid(head, creamMat, 0, -.045, -.499, .051, .17, .025);
  for (const side of [-1, 1]) {
    const ear = ellipsoid(head, coat, side * .14, .36, .015, .085, .245, .075); ear.rotation.z = side * -.18; ear.rotation.x = -.1;
    const earInside = ellipsoid(head, muzzleMat, side * .14, .375, -.036, .042, .16, .022); earInside.rotation.z = side * -.18;
    ellipsoid(head, darkMat, side * .228, .075, -.16, .026, .043, .048);
    ellipsoid(head, creamMat, side * .248, .092, -.174, .008, .012, .012);
    ellipsoid(head, darkMat, side * .15, -.19, -.694, .037, .024, .012);
  }
  // A small woven neck ribbon identifies each horse without a saddle obscuring the silhouette.
  const band = new THREE.Mesh(new THREE.TorusGeometry(.302, .043, 8, 32), accentMat);
  band.position.set(0, 1.97, -.91); band.rotation.x = Math.PI / 2 - .5; band.scale.y = .9; band.castShadow = true; body.add(band);
  const tag = new THREE.Mesh(new THREE.SphereGeometry(.085, 12, 8), accentMat); tag.scale.y = 1.3; tag.position.set(.31, 1.87, -.9); body.add(tag);
  const manePieces = [];
  for (let i = 0; i < 9; i++) {
    const p = i / 8, tuft = ellipsoid(body, maneMat, .022, 1.73 + p * .78, -.55 - p * .46, .12, .2, .105);
    tuft.rotation.x = -.5; tuft.rotation.z = -.12; manePieces.push(tuft);
  }
  ellipsoid(head, maneMat, .035, .24, -.1, .14, .09, .21);
  const tail = new THREE.Group(); tail.position.set(0, 1.68, 1); tail.rotation.x = -.3; body.add(tail);
  const tailPieces = [];
  for (let i = 0; i < 5; i++) {
    const p = i / 4, tuft = ellipsoid(tail, maneMat, 0, -.08 - p * .64, .1 + p * .37, .13 + p * .03, .25, .13);
    tuft.rotation.x = -.45; tailPieces.push(tuft);
  }
  const legs = [];
  for (const front of [false, true]) for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * .3, 1.29, front ? -.66 : .65); body.add(hip);
    if (!front) ellipsoid(body, coat, side * .29, 1.28, .68, .23, .36, .25);
    const upperLength = front ? .57 : .55, lowerLength = front ? .58 : .6;
    bone(hip, coat, [0, 0, 0], [0, -upperLength, 0], front ? .1 : .13, .075);
    ellipsoid(hip, coat, 0, -.12, 0, front ? .13 : .17, .24, .14);
    const knee = new THREE.Group(); knee.position.y = -upperLength; hip.add(knee);
    ellipsoid(knee, darker, 0, 0, 0, .086, .1, .09);
    bone(knee, coat, [0, 0, 0], [0, -lowerLength, 0], .063, .047);
    const sock = bone(knee, creamMat, [0, -lowerLength + .22, 0], [0, -lowerLength + .035, 0], .061, .055);
    const hoof = ellipsoid(knee, hoofMat, 0, -lowerLength + .025, -.025, .092, .09, .13);
    legs.push({ hip, knee, hoof, front, side, sock });
  }
  function animate({ time = 0, speed = 12, jump = 0, airborne = false, turn = 0, idle = false, hit = 0 } = {}) {
    const t = time * (idle ? 1.1 : 8.6 + speed * .12), stride = idle ? .025 : 1;
    body.position.y = idle ? .014 * Math.sin(t * 2) : .045 * Math.sin(t * 2);
    body.rotation.x = idle ? 0 : .018 * Math.sin(t * 2); body.rotation.z = -turn * .055;
    head.rotation.x = -.15 + .025 * Math.sin(t + .3);
    for (const leg of legs) {
      const phase = t + (leg.front ? 0 : 2.35) + (leg.side > 0 ? .58 : 0);
      const swing = Math.sin(phase), bend = Math.max(0, Math.cos(phase));
      leg.hip.rotation.x = airborne ? (leg.front ? -.64 : .57) : swing * (leg.front ? .6 : .65) * stride;
      leg.knee.rotation.x = airborne ? (leg.front ? 1.15 : -.85) : (leg.front ? .8 * bend : -.75 * Math.max(0, -Math.cos(phase))) * stride;
      leg.hoof.rotation.x = -leg.knee.rotation.x * .22;
    }
    tail.rotation.z = .11 * Math.sin(t * .7); tail.rotation.x = -.38 + .07 * Math.sin(t);
    for (let i = 0; i < manePieces.length; i++) manePieces[i].rotation.z = -.12 + .05 * Math.sin(t * 1.2 - i * .6);
    root.rotation.y = turn * -.1; root.rotation.z = hit > 0 ? Math.sin(time * 45) * .04 * hit : 0;
  }
  return { root, animate };
}
