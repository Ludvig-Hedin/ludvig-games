/**
 * STRANDAD — sculpted, texture-free Arctic terrain.
 * Width/depth are full world-space dimensions; mountain roots sit at y = 0.
 * No scene, renderer, browser globals or asset downloads are required.
 */
export function createTerrainAssets(THREE, options = {}) {
  let seed = options.seed ?? 41749;
  const random = () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const geometries = new Set(), materials = new Set();
  const ownGeometry = g => { geometries.add(g); return g; };
  const ownMaterial = m => { materials.add(m); return m; };
  const mountainMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .94, metalness: 0, flatShading: true
  }));
  const driftMaterial = ownMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .96, metalness: 0, flatShading: true
  }));
  const snow = new THREE.Color(0xf0f9fb);
  const rock = new THREE.Color(0x537e99);
  const ice = new THREE.Color(0x97d2e5);
  const deepIce = new THREE.Color(0x568eab);
  const scratchColor = new THREE.Color();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const edgeA = new THREE.Vector3(), edgeB = new THREE.Vector3(), normal = new THREE.Vector3();

  // Convert each surface triangle independently: consistent, broad facets catch
  // the sun while continuous height/slope masks put snow in natural pockets.
  function facetedGeometry(vertices, indices, height, phase, snowOnly = false) {
    const positions = new Float32Array(indices.length * 3);
    const colors = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i += 3) {
      va.fromArray(vertices, indices[i] * 3);
      vb.fromArray(vertices, indices[i + 1] * 3);
      vc.fromArray(vertices, indices[i + 2] * 3);
      edgeA.subVectors(vb, va); edgeB.subVectors(vc, va);
      normal.crossVectors(edgeA, edgeB).normalize();
      const centerX = (va.x + vb.x + vc.x) / 3;
      const centerZ = (va.z + vb.z + vc.z) / 3;
      const altitude = (va.y + vb.y + vc.y) / (3 * Math.max(.01, height));
      const pocket = Math.sin(centerX * .57 + phase) * .07
        + Math.sin(centerZ * .49 - centerX * .19 + phase * .4) * .055;
      const aspect = normal.z * .065 + normal.x * .035;
      const coverage = snowOnly ? 1 : smooth(.12, .48, altitude + pocket + aspect)
        * smooth(.04, .57, normal.y + altitude * .14);
      const iceAmount = smooth(.03, .45, altitude + pocket) * .58;
      scratchColor.copy(rock).lerp(ice, iceAmount).lerp(snow, coverage);
      // Broad variation, never random salt-and-pepper facets.
      const value = .973 + .027 * Math.sin(centerX * .31 + centerZ * .27 + phase);
      scratchColor.multiplyScalar(value);
      for (let j = 0; j < 3; j++) {
        const input = indices[i + j] * 3, out = (i + j) * 3;
        positions[out] = vertices[input];
        positions[out + 1] = vertices[input + 1];
        positions[out + 2] = vertices[input + 2];
        colors[out] = scratchColor.r; colors[out + 1] = scratchColor.g; colors[out + 2] = scratchColor.b;
      }
    }
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }

  function connectRings(indices, segments, rings) {
    for (let i = 0; i < segments; i++) indices.push(0, 1 + (i + 1) % segments, 1 + i);
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * segments, outer = 1 + ring * segments;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices.push(inner + i, outer + next, outer + i, inner + i, inner + next, outer + next);
      }
    }
  }

  function makeSnowDrift({x = 0, z = 0, width = 5, depth = 2.6, height = .55, rotation = 0} = {}) {
    const phase = random() * TAU, segments = 22, rings = [.18, .38, .62, .83, 1];
    const vertices = [width * .06, height, 0], indices = [];
    for (let ring = 0; ring < rings.length; ring++) {
      const r = rings[ring];
      for (let i = 0; i < segments; i++) {
        const a = i / segments * TAU;
        const boundary = 1 + .09 * Math.sin(3 * a + phase) + .045 * Math.cos(5 * a - phase);
        const nx = Math.cos(a) * r * boundary;
        const nz = Math.sin(a) * r * boundary;
        const h = Math.pow(Math.max(0, 1 - r * r), 1.4) * (1 + nx * .2);
        vertices.push(nx * width / 2 + (1 - r) * width * .06, h * height, nz * depth / 2);
      }
    }
    connectRings(indices, segments, rings.length);
    const mesh = new THREE.Mesh(facetedGeometry(vertices, indices, height, phase, true), driftMaterial);
    mesh.position.set(x, .008, z); mesh.rotation.y = rotation;
    mesh.receiveShadow = true; mesh.castShadow = height > .7;
    return mesh;
  }

  function makeMountain({x = 0, z = 0, width = 22, height = 17, depth = 16, rotation = 0} = {}) {
    width = Math.max(1, width); height = Math.max(.5, height); depth = Math.max(1, depth);
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation;
    const phase = random() * TAU, skew = (random() - .5) * .18;
    const peaks = [
      {x: -.49 + random() * .07, z: -.16 + random() * .12, h: .80 + random() * .13, spread: .74},
      {x: -.05 + random() * .14, z: -.03 + random() * .15, h: 1, spread: .81},
      {x: .39 + random() * .10, z: -.12 + random() * .21, h: .75 + random() * .15, spread: .72}
    ];
    const field = (nx, nz, r) => {
      let elevation = 0;
      for (const peak of peaks) {
        const dx = nx - peak.x, dz = (nz - peak.z) * 1.12;
        const distance = Math.sqrt(dx * dx + dz * dz);
        elevation = Math.max(elevation, peak.h * Math.pow(Math.max(0, 1 - distance / peak.spread), 1.05));
      }
      const edge = Math.max(0, 1 - r * r);
      // Connected shoulders make a mountain range, with a chipped lee face and
      // wind-cut ridges across the otherwise broad, quiet snow surfaces.
      elevation = Math.max(elevation, edge * .135);
      elevation += edge * (.033 * Math.sin(nx * 15 + nz * 5 + phase)
        + .023 * Math.sin(nz * 16 - nx * 3 + phase * .7));
      elevation *= smooth(1.04, .80, r);
      return Math.max(0, elevation);
    };
    const segments = 42, rings = [.075, .15, .245, .35, .465, .59, .725, .855, 1];
    const vertices = [skew * width * .15, field(skew * .3, 0, 0), 0], indices = [];
    let maxHeight = vertices[1];
    for (let ring = 0; ring < rings.length; ring++) {
      const r = rings[ring];
      for (let i = 0; i < segments; i++) {
        const a = i / segments * TAU + Math.sin(ring * 1.7 + phase) * .015;
        const boundary = 1 + .09 * Math.sin(a * 3 + phase) + .045 * Math.cos(a * 5 - phase * .6);
        const nx = Math.cos(a) * r * boundary + (1 - r) * skew * .3;
        const nz = Math.sin(a) * r * boundary + (1 - r) * skew * .14;
        const h = ring === rings.length - 1 ? 0 : field(nx, nz, r);
        maxHeight = Math.max(maxHeight, h);
        vertices.push(nx * width / 2, h, nz * depth / 2);
      }
    }
    for (let i = 1; i < vertices.length; i += 3) vertices[i] *= height / maxHeight;
    connectRings(indices, segments, rings.length);
    const ridge = new THREE.Mesh(facetedGeometry(vertices, indices, height, phase), mountainMaterial);
    ridge.castShadow = true; ridge.receiveShadow = true; group.add(ridge);

    // Flat-topped ice shoulders lie against the foot of the ridge, not on top
    // of it; their snowy upper faces visibly soften the rock/snow transition.
    const count = 3 + Math.floor(random() * 3);
    for (let n = 0; n < count; n++) {
      const angle = phase + n / count * TAU + (random() - .5) * .24;
      const sx = width * (.09 + random() * .055), sz = depth * (.10 + random() * .07);
      const sy = height * (.065 + random() * .045);
      const px = Math.cos(angle) * width * (.35 + random() * .045);
      const pz = Math.sin(angle) * depth * (.35 + random() * .045);
      const rockVertices = [], rockIndices = [], sides = 7;
      for (let ring = 0; ring < 3; ring++) {
        const r = [1, .92, .6][ring], y = [0, sy * .57, sy][ring];
        for (let i = 0; i < sides; i++) {
          const a = i / sides * TAU + n * .63;
          const irregular = 1 + Math.sin(a * 3 + phase) * .11;
          rockVertices.push(px + Math.cos(a) * sx * r * irregular + ring * sx * .055,
            y + (ring === 0 ? 0 : Math.sin(a * 2 + phase) * sy * .06),
            pz + Math.sin(a) * sz * r * irregular);
        }
      }
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < sides; i++) {
          const next = (i + 1) % sides, a = ring * sides, b = (ring + 1) * sides;
          rockIndices.push(a + i, b + i, b + next, a + i, b + next, a + next);
        }
      }
      rockVertices.push(px + sx * .1, sy * 1.065, pz);
      for (let i = 0; i < sides; i++) rockIndices.push(sides * 3, sides * 2 + (i + 1) % sides, sides * 2 + i);
      const shoulder = new THREE.Mesh(facetedGeometry(rockVertices, rockIndices, sy, phase + n), mountainMaterial);
      shoulder.castShadow = true; shoulder.receiveShadow = true; group.add(shoulder);
      // Windward snow banks are lower than a player's boot: readable geometry,
      // without turning the edge of every mountain into an obstacle course.
      if (n % 2 === 0) group.add(makeSnowDrift({
        x: px * 1.22, z: pz * 1.22, width: sx * 2.8, depth: sz * 1.75,
        height: sy * .25, rotation: -angle + .4
      }));
    }
    group.userData.kind = 'snow-ridge';
    group.userData.height = height;
    const radius = Math.max(width, depth) * .49;
    group.userData.colliderRadius = radius;
    return {group, radius};
  }

  function makeIceArch({width = 12, height = 9, depth = 5} = {}) {
    const group = new THREE.Group(), vertices = [], indices = [];
    const sides = 16, opening = width * .315, spring = height * .25;
    const outerHeight = height - spring, innerHeight = height * .53;
    // A continuous irregular vault with a real hole. Four rings describe the
    // front/back faces and each edge; no cube balanced on a pair of cones.
    for (let face = 0; face < 2; face++) {
      for (let edge = 0; edge < 2; edge++) {
        for (let i = 0; i <= sides; i++) {
          const a = i / sides * Math.PI, ripple = 1 + Math.sin(i * 1.3 + .7) * .034;
          const rx = edge ? opening : width * .5 * ripple;
          const ry = edge ? innerHeight : outerHeight * ripple;
          vertices.push(Math.cos(a) * rx, spring + Math.sin(a) * ry,
            (face ? -1 : 1) * depth * .5 + Math.sin(i * 1.67) * depth * .045);
        }
      }
    }
    const ring = sides + 1;
    for (let i = 0; i < sides; i++) {
      // Front annulus, back annulus, outer shell, inner wall.
      indices.push(i, i + 1, ring + i, i + 1, ring + i + 1, ring + i);
      indices.push(ring * 2 + i, ring * 3 + i, ring * 2 + i + 1,
        ring * 2 + i + 1, ring * 3 + i, ring * 3 + i + 1);
      indices.push(i, ring * 2 + i, i + 1, i + 1, ring * 2 + i, ring * 2 + i + 1);
      indices.push(ring + i, ring + i + 1, ring * 3 + i,
        ring + i + 1, ring * 3 + i + 1, ring * 3 + i);
    }
    // Continue the vault into solid feet. Their slightly splayed profile reads
    // as eroded ice while keeping every bit of the opening visibly passable.
    for (const side of [-1, 1]) {
      const start = vertices.length / 3;
      const outer = side * width * .5, inner = side * opening;
      for (const z of [depth * .5, -depth * .5]) {
        vertices.push(outer * 1.075, 0, z, inner * .99, 0, z,
          outer, spring, z, inner, spring, z);
      }
      const postIndices = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6,
        0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5, 2, 6, 3, 3, 6, 7];
      for (let i = 0; i < postIndices.length; i += 3) {
        if (side > 0) indices.push(start + postIndices[i], start + postIndices[i + 1], start + postIndices[i + 2]);
        else indices.push(start + postIndices[i], start + postIndices[i + 2], start + postIndices[i + 1]);
      }
    }
    const flat = new Float32Array(indices.length * 3), vertexColors = new Float32Array(indices.length * 3);
    for (let i = 0; i < indices.length; i++) {
      const source = indices[i] * 3, y = vertices[source + 1];
      flat.set(vertices.slice(source, source + 3), i * 3);
      const edgeColor = scratchColor.copy(deepIce).lerp(ice, smooth(0, height * .7, y))
        .lerp(snow, smooth(height * .60, height * .90, y));
      vertexColors.set([edgeColor.r, edgeColor.g, edgeColor.b], i * 3);
    }
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(flat, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const archMaterial = ownMaterial(new THREE.MeshStandardMaterial({vertexColors: true, roughness: .72, side: THREE.DoubleSide, flatShading: true}));
    const vault = new THREE.Mesh(geometry, archMaterial); vault.castShadow = true; vault.receiveShadow = true; group.add(vault);
    for (const side of [-1, 1]) {
      group.add(makeSnowDrift({x: side * width * .44, z: depth * .3,
        width: width * .37, depth: depth * .62, height: .46, rotation: side * .3}));
    }
    group.userData.openingWidth = opening * 2;
    group.userData.openingHeight = spring + innerHeight;
    // Put collisions only at these posts; preserve the open passage.
    group.userData.colliders = [-1, 1].map(side => ({x: side * width * .415, z: 0, r: width * .14}));
    return group;
  }

  function createOcean({radius = 105, segments = 160, extent = Math.max(760, radius * 7.4)} = {}) {
    const shoreline = options.shoreRadius || (a => radius + 7 * Math.sin(3 * a + .5)
      + 5 * Math.cos(5 * a - .3) + 3 * Math.sin(9 * a));
    const cosTerms = new Float32Array(10), sinTerms = new Float32Array(10), samples = 128;
    let averageRadius = 0;
    for (let i = 0; i < samples; i++) {
      const a = i / samples * TAU, r = shoreline(a);
      averageRadius += r / samples;
      for (let k = 1; k <= 10; k++) {
        cosTerms[k - 1] += 2 * r * Math.cos(k * a) / samples;
        sinTerms[k - 1] += 2 * r * Math.sin(k * a) / samples;
      }
    }
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: {value: 0}, sun: {value: 1}, shoreBase: {value: averageRadius},
      shoreCos: {value: cosTerms}, shoreSin: {value: sinTerms},
      deepColor: {value: new THREE.Color(0x217d9b)},
      shelfColor: {value: new THREE.Color(0x68c5d5)},
      foamColor: {value: new THREE.Color(0xe5f9fc)},
      skyColor: {value: new THREE.Color(0xc0eaf0)},
      floeCount: {value: 0}, floes: {value: Array.from({length: 16}, () => new THREE.Vector3(0, 0, 0))}
    }]);
    const material = ownMaterial(new THREE.ShaderMaterial({
      uniforms, fog: true,
      vertexShader: `
        #include <fog_pars_vertex>
        uniform float time;
        varying vec3 vWorld;
        varying vec3 vWaveNormal;
        void main() {
          vec3 p = position;
          float w1 = dot(p.xz, vec2(.073, .041)) + time * .55;
          float w2 = dot(p.xz, vec2(-.052, .118)) - time * .43;
          float w3 = dot(p.xz, vec2(.17, .14)) + time * .8;
          p.y += sin(w1) * .14 + sin(w2) * .095 + sin(w3) * .028;
          vec2 slope = cos(w1) * .14 * vec2(.073, .041)
            + cos(w2) * .095 * vec2(-.052, .118)
            + cos(w3) * .028 * vec2(.17, .14);
          vWaveNormal = normalize(vec3(-slope.x, 1., -slope.y));
          vWorld = (modelMatrix * vec4(p, 1.)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform float time;
        uniform float sun;
        uniform float shoreBase;
        uniform float shoreCos[10];
        uniform float shoreSin[10];
        uniform vec3 deepColor;
        uniform vec3 shelfColor;
        uniform vec3 foamColor;
        uniform vec3 skyColor;
        uniform int floeCount;
        uniform vec3 floes[16];
        varying vec3 vWorld;
        varying vec3 vWaveNormal;
        float shoreline(float angle) {
          float r = shoreBase;
          for (int k = 0; k < 10; k++) {
            float n = float(k + 1);
            r += shoreCos[k] * cos(n * angle) + shoreSin[k] * sin(n * angle);
          }
          return r * 1.024;
        }
        void main() {
          vec2 p = vWorld.xz;
          float angle = atan(p.y, p.x);
          float coastDistance = length(p) - shoreline(angle);
          float distanceOut = max(0., coastDistance);
          float shelf = exp(-distanceOut * .038);
          float w1 = sin(dot(p, vec2(.43, .18)) + sin(p.y * .065) * 1.6 - time * .58);
          float w2 = cos(dot(p, vec2(-.21, .49)) + sin(p.x * .074) * 1.1 + time * .43);
          vec3 N = normalize(vWaveNormal + vec3(w1 * .025, 0., w2 * .025));
          vec3 V = isOrthographic ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - vWorld);
          vec3 L = normalize(vec3(-.40, .81, .43));
          float fresnel = pow(1. - max(dot(N, V), 0.), 4.);
          vec3 color = mix(deepColor, shelfColor, shelf * .86);
          color *= .96 + .04 * dot(N, L);
          color = mix(color, skyColor, .035 + fresnel * .48);

          // Soft underwater light, limited to the shallow turquoise shelf.
          float causticA = sin(dot(p, vec2(.24, .105)) + sin(p.y * .16 + time * .24) * .9 - time * .31);
          float causticB = sin(dot(p, vec2(-.11, .27)) + sin(p.x * .13 - time * .19) * .8 + time * .27);
          float caustic = 1. - smoothstep(.015, .075, abs(causticA + causticB * .61));
          color += vec3(.055, .105, .12) * caustic * shelf * .14;

          // Broad, moving coastline bands give the shelf depth. The irregular
          // gaps prevent a perfectly outlined island or a repeated stripe grid.
          float broken = .62 + .38 * sin(p.x * .57 + time * .21) * cos(p.y * .41 - time * .17);
          float lip = exp(-abs(coastDistance - .35) * 2.5) * .50;
          float wash = pow(.5 + .5 * sin(coastDistance * 2.25 - time * .86
            + sin(angle * 13.) * .50), 5.) * exp(-distanceOut * .44) * .37;
          float foam = (lip + wash) * broken * smoothstep(-1., .1, coastDistance);
          for (int i = 0; i < 16; i++) {
            if (i >= floeCount) break;
            float fd = length(p - floes[i].xy) - floes[i].z;
            float rim = exp(-abs(fd - .13) * 3.6) * .35;
            float ripple = pow(.5 + .5 * sin(fd * 3.8 - time * 1.2), 5.)
              * exp(-abs(fd) * 1.5) * .10;
            foam = max(foam, (rim + ripple) * broken);
          }
          color = mix(color, foamColor, min(.72, foam));

          // Restrained little glints stretch across traveling wave crests.
          float glintA = sin(dot(p, vec2(.83, .44)) + sin(p.y * .091) * 2. + time * .75);
          float glintB = cos(dot(p, vec2(-.22, 1.11)) + sin(p.x * .13) - time * .39);
          float sparkles = pow(max(0., glintA * glintB), 36.);
          sparkles *= smoothstep(.12, .85, sin(dot(p, vec2(.041, -.062)) + time * .14));
          float sunlight = pow(max(dot(reflect(-L, N), V), 0.), 70.);
          color += vec3(1., .96, .80) * (sparkles * .19 + sunlight * .45) * clamp(sun, .2, 1.);
          color *= mix(.78, 1., clamp(sun, 0., 1.));
          gl_FragColor = vec4(color, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `
    }));
    const geometry = ownGeometry(new THREE.PlaneGeometry(extent, extent, segments, segments));
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Southern Ocean'; mesh.position.y = -4.5;
    mesh.receiveShadow = false; mesh.castShadow = false;
    function setFoamFloes(items) {
      uniforms.floeCount.value = Math.min(16, items.length);
      for (let i = 0; i < uniforms.floeCount.value; i++) {
        const item = items[i];
        uniforms.floes.value[i].set(item.x, item.z, Math.max(.1, item.r ?? 2));
      }
    }
    return {mesh, uniforms, setFoamFloes};
  }

  return {
    makeMountain, makeSnowDrift, makeIceArch, createOcean,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear(); materials.clear();
    }
  };
}
