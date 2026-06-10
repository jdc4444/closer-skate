// world.js — the endless rotating city: era palettes, cylinder shell,
// procedural segments (buildings, lamps, neon, gates), corridor + collisions.
import * as THREE from 'three';

export const R = 70;            // cylinder radius (you skate the inside)
export const SEG_LEN = 40;      // length of one generated city segment
export const ERA_LEN = 400;     // metres per era
const CORRIDOR_HALF = 0.16;     // radians kept clear around the pack's line

// ---------------------------------------------------------------- palettes
// Duochrome moods lifted from the treatment frames.
export const ERAS = [
  { name: 'THE BOARDWALK · 1972', fog: 0x47102b, ground: 0x331026, building: 0x5a1b3f,
    ambient: 0xff9a66, lamp: 0xffb14d, neon: [0xff4fa3, 0xff6a3d], sun: 0xffc890 },
  { name: 'NEON AVENUE · 1982', fog: 0x3a1456, ground: 0x2a1045, building: 0x4a1d6e,
    ambient: 0xcf8aff, lamp: 0xffd166, neon: [0xff3df0, 0xffe14d], sun: 0xff9de2 },
  { name: 'THE WHIRL · 1992', fog: 0x232a7d, ground: 0x1c2160, building: 0x333a9e,
    ambient: 0x8fb4ff, lamp: 0x9fd8ff, neon: [0xff4fd8, 0x4dd7ff], sun: 0xffb3ef },
  { name: 'MIDNIGHT CLUB · 2002', fog: 0x0e3540, ground: 0x0a2832, building: 0x14424e,
    ambient: 0x9fe8e0, lamp: 0xcfe9ff, neon: [0x35e0c8, 0xff5a76], sun: 0xbfffe9 },
  { name: 'THE BALLROOM · 2012', fog: 0x5a1430, ground: 0x420e24, building: 0x6e2240,
    ambient: 0xffb38a, lamp: 0xffd98c, neon: [0xff8fb8, 0xffd166], sun: 0xffe9b8 },
];

export function eraIndex(z) { return Math.max(0, Math.floor(z / ERA_LEN)); }

export function eraLabel(z) {
  const i = eraIndex(z);
  if (i < ERAS.length) return ERAS[i].name;
  return `THE INFINITE DISCO · ${1972 + i * 10}`;
}

function eraPalette(i) { return ERAS[((i % ERAS.length) + ERAS.length) % ERAS.length]; }

// Continuous palette blend for atmosphere (fog/bg/ambient/sun).
const _ca = new THREE.Color(), _cb = new THREE.Color();
export function blendedAtmosphere(z) {
  const i = eraIndex(z);
  const f = (z - i * ERA_LEN) / ERA_LEN;
  const a = eraPalette(i), b = eraPalette(i + 1);
  const t = f < 0.88 ? 0 : (f - 0.88) / 0.12;
  const s = t * t * (3 - 2 * t);
  const mix = (key) => _ca.setHex(a[key]).lerp(_cb.setHex(b[key]), s).clone();
  return { fog: mix('fog'), ambient: mix('ambient'), sun: mix('sun'), lamp: mix('lamp') };
}

// ---------------------------------------------------------------- geometry helpers
export function surfPoint(theta, z, h = 0, out = new THREE.Vector3()) {
  const r = R - h;
  return out.set(r * Math.cos(theta), r * Math.sin(theta), z);
}
export function upVec(theta, out = new THREE.Vector3()) {
  return out.set(-Math.cos(theta), -Math.sin(theta), 0);
}
export function tanVec(theta, out = new THREE.Vector3()) {
  return out.set(-Math.sin(theta), Math.cos(theta), 0);
}
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
export function quatFromBasis(x, y, z, out = new THREE.Quaternion()) {
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}
// Orientation for an object standing on the inner surface at theta:
// local X = circumferential tangent, local Y = up (toward axis), local Z = world Z.
export function standingQuat(theta, out = new THREE.Quaternion()) {
  return quatFromBasis(tanVec(theta), upVec(theta), Z_AXIS, out);
}
// Orientation for a decal lying flat on the surface (normal = up, local X = along axis).
export function decalQuat(theta, out = new THREE.Quaternion()) {
  return quatFromBasis(Z_AXIS, tanVec(theta), upVec(theta), out);
}
export function angWrap(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

// ---------------------------------------------------------------- corridor
// The line the pack skates: a steady spiral (the city forever rotates around
// you) plus two slow weaves. theta as a function of z.
export function corridorTheta(z) {
  return z * 0.010 + 0.45 * Math.sin(z * 0.011 + 1.7) + 0.22 * Math.sin(z * 0.023);
}

// ---------------------------------------------------------------- window texture
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  const cols = 6, rows = 8;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (Math.random() < 0.42) {
        const warm = Math.random() < 0.75;
        g.fillStyle = warm ? '#ffd9a0' : '#9fd8ff';
        g.globalAlpha = 0.55 + Math.random() * 0.45;
        g.fillRect(8 + i * 20, 6 + j * 15, 9, 7);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- world
export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = new Map();   // index -> segment record
    this.windowTex = makeWindowTexture();
    this.matCache = new Map();   // per-era shared materials
    this.animated = [];          // {mesh, spin} decorative rotators

    // The shell you skate on — one long tube that follows the player.
    this.shell = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, 1000, 72, 1, true),
      new THREE.MeshLambertMaterial({ color: ERAS[0].ground, side: THREE.BackSide })
    );
    this.shell.geometry.rotateX(Math.PI / 2); // axis -> Z
    scene.add(this.shell);

    // End-of-the-tunnel sun (treatment cover).
    const sc = document.createElement('canvas');
    sc.width = sc.height = 256;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.32, 'rgba(255,255,255,0.96)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.38)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 256, 256);
    const sunTex = new THREE.CanvasTexture(sc);
    sunTex.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, color: ERAS[0].sun, transparent: true,
      fog: false, depthWrite: false, depthTest: false,
    }));
    this.sun.scale.setScalar(150);
    this.sun.renderOrder = -10;
    scene.add(this.sun);

    // Hazy dust drifting through the volume.
    const N = 700;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * (R - 6);
      pos[i * 3] = Math.cos(th) * rr;
      pos[i * 3 + 1] = Math.sin(th) * rr;
      pos[i * 3 + 2] = Math.random() * 600 - 100;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.55, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    scene.add(this.dust);
  }

  mats(eraI) {
    const key = ((eraI % ERAS.length) + ERAS.length) % ERAS.length;
    if (!this.matCache.has(key)) {
      const p = eraPalette(key);
      this.matCache.set(key, {
        building: new THREE.MeshLambertMaterial({
          color: p.building, emissive: 0xffffff,
          emissiveMap: this.windowTex, emissiveIntensity: 0.62,
        }),
        roof: new THREE.MeshLambertMaterial({ color: p.building }),
        pole: new THREE.MeshLambertMaterial({ color: 0x10101c }),
        neonA: new THREE.MeshBasicMaterial({ color: p.neon[0] }),
        neonB: new THREE.MeshBasicMaterial({ color: p.neon[1] }),
        cone: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
        glowDisc: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        crumb: new THREE.MeshBasicMaterial({
          color: p.neon[0], transparent: true, opacity: 0.20,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        ring: new THREE.MeshBasicMaterial({
          color: p.neon[1], transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      });
    }
    return this.matCache.get(key);
  }

  // ---------------------------------------------------- segment generation
  ensure(zMin, zMax) {
    const i0 = Math.floor(zMin / SEG_LEN);
    const i1 = Math.floor(zMax / SEG_LEN);
    for (const [idx, seg] of this.segments) {
      if (idx < i0 - 1 || idx > i1 + 1) {
        this.disposeSegment(seg);
        this.segments.delete(idx);
      }
    }
    for (let i = i0; i <= i1; i++) {
      if (!this.segments.has(i)) this.segments.set(i, this.buildSegment(i));
    }
  }

  buildSegment(idx) {
    const z0 = idx * SEG_LEN;
    const eraI = eraIndex(z0 + SEG_LEN / 2);
    const M = this.mats(eraI);
    const group = new THREE.Group();
    const buildings = [];
    const rings = [];
    const rng = mulberry32(idx * 2654435761 >>> 0);

    // --- buildings (kept off the corridor)
    const count = 9 + Math.floor(rng() * 5);
    for (let b = 0; b < count; b++) {
      const zc = z0 + 4 + rng() * (SEG_LEN - 8);
      const corridor = corridorTheta(zc);
      // pick an angle clear of the corridor
      let off = (0.22 + rng() * 0.85) * (rng() < 0.5 ? -1 : 1);
      const theta = corridor + off + (rng() - 0.5) * 0.3;
      const halfW = 0.045 + rng() * 0.075;          // radians
      const halfD = 4 + rng() * 7;                  // metres along z
      const h = 7 + rng() * 21;                     // metres toward axis
      if (Math.abs(angWrap(theta - corridorTheta(zc))) < CORRIDOR_HALF + halfW) continue;

      const wArc = halfW * 2 * R;
      const geo = new THREE.BoxGeometry(wArc, h, halfD * 2);
      const winMat = M.building.clone();
      winMat.emissiveMap = this.windowTex.clone();
      winMat.emissiveMap.repeat.set(Math.max(1, Math.round(wArc / 6)), Math.max(1, Math.round(h / 7)));
      const mesh = new THREE.Mesh(geo, [winMat, winMat, M.roof, M.roof, winMat, winMat]);
      surfPoint(theta, zc, h / 2, mesh.position);
      standingQuat(theta, mesh.quaternion);
      group.add(mesh);
      buildings.push({ theta, halfW, z: zc, halfD, h });

      // neon strip on some buildings — a bright vertical or top edge
      if (rng() < 0.38) {
        const vertical = rng() < 0.5;
        const strip = new THREE.Mesh(
          vertical ? new THREE.BoxGeometry(0.3, h * 0.85, 0.3)
                   : new THREE.BoxGeometry(wArc * 0.92, 0.3, 0.3),
          rng() < 0.5 ? M.neonA : M.neonB
        );
        surfPoint(theta, zc, vertical ? h * 0.45 : h + 0.2, strip.position);
        standingQuat(theta, strip.quaternion);
        const edge = (rng() < 0.5 ? -1 : 1) * (vertical ? wArc * 0.46 : 0);
        strip.translateX(edge);
        strip.translateZ((rng() < 0.5 ? -1 : 1) * halfD * 0.96);
        group.add(strip);
      }
      // glowing disc sign
      if (rng() < 0.18) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6 + rng() * 1.6, 24),
          (rng() < 0.5 ? M.neonA : M.neonB).clone());
        disc.material.transparent = true;
        disc.material.opacity = 0.85;
        surfPoint(theta, zc - halfD - 0.4, h * (0.4 + rng() * 0.3), disc.position);
        standingQuat(theta, disc.quaternion);
        group.add(disc);
      }
    }

    // --- street lamps near the corridor: pools of hazy light
    const lamps = 2 + Math.floor(rng() * 2);
    for (let l = 0; l < lamps; l++) {
      const zc = z0 + (l + 0.5) * (SEG_LEN / lamps);
      const theta = corridorTheta(zc) + (rng() < 0.5 ? -1 : 1) * (0.10 + rng() * 0.06);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 9, 0.22), M.pole);
      surfPoint(theta, zc, 4.5, pole.position);
      standingQuat(theta, pole.quaternion);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
        new THREE.MeshBasicMaterial({ color: M.cone.color }));
      surfPoint(theta, zc, 9, head.position);
      group.add(head);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9.4, 20, 1, true), M.cone);
      surfPoint(theta, zc, 4.4, cone.position);
      standingQuat(theta, cone.quaternion);
      group.add(cone);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 22), M.glowDisc);
      surfPoint(theta, zc, 0.12, pool.position);
      decalQuat(theta, pool.quaternion);
      group.add(pool);
    }

    // --- breadcrumbs: faint strips marking the pack's line
    for (let z = z0; z < z0 + SEG_LEN; z += 8) {
      const th = corridorTheta(z);
      const crumb = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 0.5), M.crumb);
      surfPoint(th, z, 0.08, crumb.position);
      decalQuat(th, crumb.quaternion);
      group.add(crumb);
    }

    // --- boost ring on the corridor every ~2 segments
    if (idx % 2 === 0) {
      const zc = z0 + 8 + rng() * (SEG_LEN - 16);
      const th = corridorTheta(zc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.14, 10, 36), M.ring);
      surfPoint(th, zc, 3.1, ring.position);
      standingQuat(th, ring.quaternion);
      group.add(ring);
      rings.push({ theta: th, z: zc, taken: false, mesh: ring });
    }

    // --- whirl gate at era boundaries: huge slow-spinning sculpture on the axis
    if (Math.abs(z0 % ERA_LEN) < SEG_LEN * 0.5 && idx > 2) {
      const gate = new THREE.Group();
      const torus = new THREE.Mesh(new THREE.TorusGeometry(40, 1.1, 12, 64), M.ring.clone());
      torus.material.opacity = 0.55;
      gate.add(torus);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 14, 0.8), M.neonA);
        const a = f * Math.PI / 2;
        fin.position.set(Math.cos(a) * 40, Math.sin(a) * 40, 0);
        fin.rotation.z = a + Math.PI / 2;
        gate.add(fin);
      }
      gate.position.set(0, 0, z0);
      group.add(gate);
      this.animated.push({ mesh: gate, spin: 0.12, seg: idx });
    }

    this.scene.add(group);
    return { group, buildings, rings, idx };
  }

  disposeSegment(seg) {
    this.animated = this.animated.filter(a => a.seg !== seg.idx);
    seg.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.emissiveMap && m.emissiveMap !== this.windowTex) m.emissiveMap.dispose();
          if (!this.isShared(m)) m.dispose();
        }
      }
    });
    this.scene.remove(seg.group);
  }

  isShared(m) {
    for (const set of this.matCache.values()) {
      for (const k in set) if (set[k] === m) return true;
    }
    return false;
  }

  // ---------------------------------------------------- queries
  groundHeight(theta, z, margin = 0.012) {
    let g = 0;
    const i = Math.floor(z / SEG_LEN);
    for (let d = -1; d <= 1; d++) {
      const seg = this.segments.get(i + d);
      if (!seg) continue;
      for (const b of seg.buildings) {
        if (Math.abs(z - b.z) < b.halfD + 0.6 &&
            Math.abs(angWrap(theta - b.theta)) < b.halfW + margin) {
          if (b.h > g) g = b.h;
        }
      }
    }
    return g;
  }

  // returns a ring record if (theta, z, h) passes through an untaken boost ring
  tryBoost(theta, z, h) {
    const i = Math.floor(z / SEG_LEN);
    for (let d = -1; d <= 1; d++) {
      const seg = this.segments.get(i + d);
      if (!seg) continue;
      for (const r of seg.rings) {
        if (!r.taken && Math.abs(z - r.z) < 1.6 &&
            Math.abs(angWrap(theta - r.theta)) * R < 2.8 && h < 6.5) {
          r.taken = true;
          r.mesh.material = r.mesh.material.clone();
          r.mesh.material.opacity = 0.18;
          return r;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------- per-frame
  update(dt, playerZ, scene, camera, ambient, sunLight) {
    this.ensure(playerZ - 90, playerZ + 560);
    this.shell.position.z = playerZ + 300;
    this.sun.position.set(0, 0, playerZ + 620);
    this.dust.position.z = 0;
    // recycle dust behind the player
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const z = dp.getZ(i);
      if (z < playerZ - 60) dp.setZ(i, z + 660);
      else if (z > playerZ + 620) dp.setZ(i, z - 660);
    }
    dp.needsUpdate = true;

    for (const a of this.animated) a.mesh.rotation.z += a.spin * dt;

    // atmosphere crossfade
    const atm = blendedAtmosphere(playerZ + 120);
    scene.fog.color.copy(atm.fog);
    scene.background.copy(atm.fog);
    ambient.color.copy(atm.ambient);
    this.sun.material.color.copy(atm.sun);
    sunLight.color.copy(atm.sun);
  }
}

// deterministic per-segment rng
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
