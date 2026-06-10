// city.js — endless chain of architectural set-pieces, Humanity-style:
// porcelain monoliths on a floating boulevard. Each module contributes
// collision boxes, decoration, and the pack's route across its surfaces
// (streets, facades, rooftops, undersides, through windows).
import * as THREE from 'three';
import { ERAS, eraIndex, eraPalette } from './palettes.js';

export const SW = 13;          // street half-width
const STREET_TH = 6;           // street slab thickness

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 8; j++) {
      if (Math.random() < 0.38) {
        g.fillStyle = Math.random() < 0.78 ? '#ffd9a0' : '#bfe2ff';
        g.globalAlpha = 0.5 + Math.random() * 0.5;
        g.fillRect(10 + i * 19, 7 + j * 15, 8, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.windowTex = makeWindowTexture();
    this.matCache = new Map();
    this.modules = [];
    this.route = [];            // {p, n, s, jump}
    this.rings = [];
    this.windows = [];
    this.animated = [];
    this.cursorZ = -40;
    this.cursorX = 0;
    this.count = 0;
    this.totalS = 0;
    this.prevEra = 0;
    this._boxCache = { key: '', boxes: [] };
  }

  mats(eraI) {
    const key = ((eraI % ERAS.length) + ERAS.length) % ERAS.length;
    if (!this.matCache.has(key)) {
      const p = eraPalette(key);
      this.matCache.set(key, {
        palette: p,
        building: new THREE.MeshStandardMaterial({ color: p.building, roughness: 0.93, metalness: 0 }),
        buildingWin: new THREE.MeshStandardMaterial({
          color: p.building, roughness: 0.93, metalness: 0,
          emissive: 0xffffff, emissiveMap: this.windowTex, emissiveIntensity: 0.5,
        }),
        street: new THREE.MeshStandardMaterial({ color: p.street, roughness: 0.96, metalness: 0 }),
        edge: new THREE.LineBasicMaterial({ color: p.trim, transparent: true, opacity: 0.5 }),
        edgeSoft: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }),
        ring: new THREE.MeshBasicMaterial({ color: p.neon2, transparent: true, opacity: 0.95, fog: true }),
        gate: new THREE.MeshBasicMaterial({ color: p.trim, transparent: true, opacity: 0.8, fog: true }),
        cone: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.07,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
        pool: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.10,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
        lampHead: new THREE.MeshBasicMaterial({ color: p.lamp }),
        pole: new THREE.MeshStandardMaterial({ color: 0x2a2a38, roughness: 0.8 }),
        crumb: new THREE.MeshBasicMaterial({
          color: p.trim, transparent: true, opacity: 0.32,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      });
    }
    return this.matCache.get(key);
  }

  // ---------------------------------------------------------- builders
  box(mod, M, min, max, { windows = false, edges = true, trim = false } = {}) {
    const size = new THREE.Vector3().subVectors(max, min);
    const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    let mat = windows ? M.buildingWin.clone() : (windows === false && size.y < 2.5 && size.x < 4 ? M.building : M.building);
    if (windows) {
      mat.emissiveMap = this.windowTex.clone();
      mat.emissiveMap.repeat.set(Math.max(1, Math.round(size.x / 7)), Math.max(1, Math.round(size.y / 7)));
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mod.group.add(mesh);
    if (edges) {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), trim ? M.edge : M.edgeSoft);
      line.position.copy(mid);
      mod.group.add(line);
    }
    const rec = { min: min.clone(), max: max.clone() };
    mod.boxes.push(rec);
    return rec;
  }

  street(mod, M, z0, len) {
    const min = new THREE.Vector3(-SW, -STREET_TH, z0 - 0.4);
    const max = new THREE.Vector3(SW, 0, z0 + len + 0.4);
    const size = max.clone().sub(min);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const mesh = new THREE.Mesh(geo, M.street);
    mesh.position.copy(min.clone().add(max).multiplyScalar(0.5));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mod.group.add(mesh);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edgeSoft);
    line.position.copy(mesh.position);
    mod.group.add(line);
    mod.boxes.push({ min, max });
  }

  lamp(mod, M, x, z) {
    const g = mod.group;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.6, 0.22), M.pole);
    pole.position.set(x, 4.3, z);
    pole.castShadow = true;
    g.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M.lampHead);
    head.position.set(x, 8.7, z);
    g.add(head);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 8.8, 18, 1, true), M.cone);
    cone.position.set(x, 4.3, z);
    g.add(cone);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.1, 20), M.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.06, z);
    g.add(pool);
  }

  ring(mod, M, p, axis, r = 3) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.13, 10, 36), M.ring.clone());
    mesh.position.copy(p);
    if (axis === 0) mesh.rotation.y = Math.PI / 2;
    if (axis === 1) mesh.rotation.x = Math.PI / 2;
    mod.group.add(mesh);
    const rec = { p: p.clone(), axis, r, taken: false, mesh };
    this.rings.push(rec);
    mod.rings.push(rec);
  }

  windowRect(mod, zMin, zMax, xMin, xMax, yMin, yMax) {
    const rec = { zMin, zMax, xMin, xMax, yMin, yMax, taken: false };
    this.windows.push(rec);
    mod.windows.push(rec);
  }

  crumbs(mod, M, pts) {
    for (let i = 2; i < pts.length - 1; i += 3) {
      const a = pts[i];
      const dir = pts[i + 1].p.clone().sub(pts[i - 1].p).normalize();
      const geo = new THREE.PlaneGeometry(3.4, 0.42);
      const m = new THREE.Mesh(geo, M.crumb);
      const up = a.n;
      const right = new THREE.Vector3().crossVectors(up, dir).normalize();
      const mtx = new THREE.Matrix4().makeBasis(dir, right, up);
      m.quaternion.setFromRotationMatrix(mtx);
      m.position.copy(a.p).addScaledVector(up, 0.07);
      mod.group.add(m);
    }
  }

  // route helper: straight line of waypoints
  line(pts, from, to, n, { jump = false, step = 2.4 } = {}) {
    const d = to.clone().sub(from);
    const len = d.length();
    const count = Math.max(1, Math.round(len / step));
    for (let i = 1; i <= count; i++) {
      const p = from.clone().addScaledVector(d, i / count);
      pts.push({ p, n: n.clone(), jump: jump && i === count });
    }
  }

  // ---------------------------------------------------------- modules
  buildModule(kind, z0, entryX, eraI) {
    const M = this.mats(eraI);
    const mod = { group: new THREE.Group(), boxes: [], rings: [], windows: [], z0, kind };
    const pts = [];
    const Y = new THREE.Vector3(0, 1, 0);
    const NZ = new THREE.Vector3(0, 0, -1);
    const PZ = new THREE.Vector3(0, 0, 1);
    const NY = new THREE.Vector3(0, -1, 0);
    let len = 100, exitX = 0;
    const start = new THREE.Vector3(entryX, 0, z0);

    if (kind === 'boulevard') {
      len = 100;
      this.street(mod, M, z0, len);
      // weaving line
      let prev = start.clone();
      for (let z = z0 + 6; z <= z0 + len; z += 6) {
        const t = (z - z0) / len;
        const x = THREE.MathUtils.lerp(entryX, 0, Math.min(1, t * 2.5)) +
                  Math.sin(z * 0.09) * 4.6 * Math.min(1, t * 3);
        const next = new THREE.Vector3(x, 0, z);
        this.line(pts, prev, next, Y);
        prev = next;
      }
      exitX = prev.x;
      for (let z = z0 + 14; z < z0 + len; z += 26) {
        this.lamp(mod, M, ((z / 26 | 0) % 2 ? -9.5 : 9.5), z);
      }
      // planters off the line
      const rng = mulberry32(z0 * 7919 ^ 0x9e3779b9);
      for (let i = 0; i < 7; i++) {
        const z = z0 + 12 + rng() * (len - 24);
        const lineX = Math.sin(z * 0.09) * 4.6;
        let x = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 8);
        if (Math.abs(x - lineX) < 3.2) x += x > lineX ? 3 : -3;
        if (Math.abs(x) > SW - 1.5) continue;
        const s = 0.9 + rng() * 0.9;
        this.box(mod, M,
          new THREE.Vector3(x - s, 0, z - s), new THREE.Vector3(x + s, 1.0 + rng() * 0.7, z + s));
      }
      const ringZ = z0 + 52;
      this.ring(mod, M, new THREE.Vector3(Math.sin(ringZ * 0.09) * 4.6, 3.1, ringZ), 2);
    }

    if (kind === 'tower') {
      len = 120;
      const H = 24 + (eraI % 3) * 4;
      this.street(mod, M, z0, len);
      const f0 = z0 + 46, f1 = z0 + 62;
      this.box(mod, M, new THREE.Vector3(-SW, 0, f0), new THREE.Vector3(SW, H, f1), { windows: true, trim: true });
      this.line(pts, start, new THREE.Vector3(0, 0, f0), Y);
      this.line(pts, new THREE.Vector3(0, 0, f0), new THREE.Vector3(0, H, f0), NZ);
      this.line(pts, new THREE.Vector3(0, H, f0), new THREE.Vector3(0, H, f1), Y);
      this.line(pts, new THREE.Vector3(0, H, f1), new THREE.Vector3(0, 0, f1), PZ);
      this.line(pts, new THREE.Vector3(0, 0, f1), new THREE.Vector3(0, 0, z0 + len), Y);
      this.ring(mod, M, new THREE.Vector3(0, H * 0.55, f0), 2);
      this.lamp(mod, M, -9.5, z0 + 20);
      this.lamp(mod, M, 9.5, z0 + 34);
      this.lamp(mod, M, -9.5, z0 + 78);
      this.lamp(mod, M, 9.5, z0 + 100);
    }

    if (kind === 'windowWall') {
      len = 90;
      this.street(mod, M, z0, len);
      const w0 = z0 + 46, w1 = z0 + 49.5;
      // columns + lintel leave two street-level openings
      this.box(mod, M, new THREE.Vector3(-SW, 0, w0), new THREE.Vector3(-9, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(-3, 0, w0), new THREE.Vector3(3, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(9, 0, w0), new THREE.Vector3(SW, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(-SW, 7, w0), new THREE.Vector3(SW, 15, w1), { windows: true, trim: true });
      this.windowRect(mod, w0 - 0.6, w1 + 0.6, -9, -3, 0, 7);
      this.windowRect(mod, w0 - 0.6, w1 + 0.6, 3, 9, 0, 7);
      this.line(pts, start, new THREE.Vector3(-6, 0, z0 + 34), Y);
      this.line(pts, new THREE.Vector3(-6, 0, z0 + 34), new THREE.Vector3(-6, 0, z0 + 58), Y);
      this.line(pts, new THREE.Vector3(-6, 0, z0 + 58), new THREE.Vector3(0, 0, z0 + len), Y);
      this.lamp(mod, M, 9.5, z0 + 24);
      this.lamp(mod, M, -9.5, z0 + 64);
      const rz = z0 + 70;
      this.ring(mod, M, new THREE.Vector3(-2, 3.1, rz), 2);
    }

    if (kind === 'rooftops') {
      len = 170;
      this.street(mod, M, z0, len);
      const towers = [
        { a: z0 + 40, b: z0 + 62, H: 18 },
        { a: z0 + 67, b: z0 + 89, H: 15 },
        { a: z0 + 94, b: z0 + 116, H: 12 },
      ];
      for (const t of towers) {
        this.box(mod, M, new THREE.Vector3(-SW, 0, t.a), new THREE.Vector3(SW, t.H, t.b), { windows: true, trim: true });
      }
      this.line(pts, start, new THREE.Vector3(0, 0, towers[0].a), Y);
      this.line(pts, new THREE.Vector3(0, 0, towers[0].a), new THREE.Vector3(0, towers[0].H, towers[0].a), NZ);
      for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        this.line(pts, new THREE.Vector3(0, t.H, t.a), new THREE.Vector3(0, t.H, t.b), Y, { jump: i < towers.length - 1 });
        if (i < towers.length - 1) {
          const nx = towers[i + 1];
          this.line(pts, new THREE.Vector3(0, t.H, t.b), new THREE.Vector3(0, nx.H, nx.a + 1.5), Y);
          this.ring(mod, M, new THREE.Vector3(0, t.H + 1.6, (t.b + nx.a) / 2), 2);
        }
      }
      const last = towers[towers.length - 1];
      this.line(pts, new THREE.Vector3(0, last.H, last.b), new THREE.Vector3(0, 0, last.b), PZ);
      this.line(pts, new THREE.Vector3(0, 0, last.b), new THREE.Vector3(0, 0, z0 + len), Y);
      // rooftop clutter off the line
      for (const t of towers) {
        this.box(mod, M, new THREE.Vector3(6, t.H, t.a + 5), new THREE.Vector3(8.4, t.H + 1.4, t.a + 7.4));
        this.box(mod, M, new THREE.Vector3(-8.4, t.H, t.b - 8), new THREE.Vector3(-6, t.H + 1.2, t.b - 5.6));
      }
      this.lamp(mod, M, -9.5, z0 + 20);
      this.lamp(mod, M, 9.5, z0 + 140);
    }

    if (kind === 'fold') {
      len = 130;
      this.street(mod, M, z0, len);
      const a = z0 + 48, b = z0 + 60;
      // arch: pillars + lintel (tops coplanar at y=26)
      this.box(mod, M, new THREE.Vector3(-17, 0, a), new THREE.Vector3(-13, 26, b), { windows: true, trim: true });
      this.box(mod, M, new THREE.Vector3(13, 0, a), new THREE.Vector3(17, 26, b), { windows: true, trim: true });
      this.box(mod, M, new THREE.Vector3(-13, 22, a), new THREE.Vector3(13, 26, b), { trim: true });
      // perforated wall right behind the arch (the way down + the way through)
      const w0 = b, w1 = b + 3;
      this.box(mod, M, new THREE.Vector3(-SW, 0, w0), new THREE.Vector3(-9, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(-3, 0, w0), new THREE.Vector3(3, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(9, 0, w0), new THREE.Vector3(SW, 7, w1), { trim: true });
      this.box(mod, M, new THREE.Vector3(-SW, 7, w0), new THREE.Vector3(SW, 26, w1), { windows: true, trim: true });
      this.windowRect(mod, w0 - 0.6, w1 + 0.6, -9, -3, 0, 7);
      this.windowRect(mod, w0 - 0.6, w1 + 0.6, 3, 9, 0, 7);
      // route: up the left pillar face, across the arch, around the lip,
      // upside-down beneath the lintel, down the wall, loop through a window
      this.line(pts, start, new THREE.Vector3(-15, 0, a), Y);
      this.line(pts, new THREE.Vector3(-15, 0, a), new THREE.Vector3(-15, 26, a), NZ);
      this.line(pts, new THREE.Vector3(-15, 26, a), new THREE.Vector3(-15, 26, a + 6), Y);
      this.line(pts, new THREE.Vector3(-15, 26, a + 6), new THREE.Vector3(0, 26, a + 6), Y);
      this.line(pts, new THREE.Vector3(0, 26, a + 6), new THREE.Vector3(0, 26, a), Y);
      this.line(pts, new THREE.Vector3(0, 26, a), new THREE.Vector3(0, 22, a), NZ, { step: 1.4 });
      this.line(pts, new THREE.Vector3(0, 22, a), new THREE.Vector3(0, 22, b), NY);        // the ceiling ride
      this.line(pts, new THREE.Vector3(0, 22, b), new THREE.Vector3(0, 0, b), NZ);
      this.line(pts, new THREE.Vector3(0, 0, b), new THREE.Vector3(-4.5, 0, b - 5), Y, { step: 1.8 });
      this.line(pts, new THREE.Vector3(-4.5, 0, b - 5), new THREE.Vector3(-6.5, 0, b - 2), Y, { step: 1.8 });
      this.line(pts, new THREE.Vector3(-6.5, 0, b - 2), new THREE.Vector3(-6.5, 0, w1 + 3), Y, { step: 1.8 });
      this.line(pts, new THREE.Vector3(-6.5, 0, w1 + 3), new THREE.Vector3(0, 0, z0 + len), Y);
      this.ring(mod, M, new THREE.Vector3(0, 20.2, (a + b) / 2), 2, 2.6);
      this.lamp(mod, M, 9.5, z0 + 24);
      this.lamp(mod, M, -9.5, z0 + 100);
    }

    if (kind === 'canyon') {
      len = 95;
      this.street(mod, M, z0, len);
      const h1 = 20 + (eraI % 2) * 6;
      this.box(mod, M, new THREE.Vector3(-26, 0, z0 + 16), new THREE.Vector3(-14, h1, z0 + 78), { windows: true, trim: true });
      this.box(mod, M, new THREE.Vector3(14, 0, z0 + 16), new THREE.Vector3(26, h1 - 4, z0 + 78), { windows: true, trim: true });
      let prev = start.clone();
      for (let z = z0 + 8; z <= z0 + len; z += 8) {
        const t = (z - z0) / len;
        const x = THREE.MathUtils.lerp(entryX, 0, Math.min(1, t * 3)) + Math.sin(z * 0.13) * 5.5 * Math.min(1, t * 3);
        const next = new THREE.Vector3(x, 0, z);
        this.line(pts, prev, next, Y);
        prev = next;
      }
      exitX = prev.x;
      const rng = mulberry32(z0 * 31337 ^ 0x51ed27);
      for (let i = 0; i < 6; i++) {
        const z = z0 + 18 + rng() * (len - 32);
        const lineX = Math.sin(z * 0.13) * 5.5;
        let x = (rng() < 0.5 ? -1 : 1) * (4 + rng() * 7);
        if (Math.abs(x - lineX) < 3.4) x += x > lineX ? 3.4 : -3.4;
        if (Math.abs(x) > SW - 1.6) continue;
        const s = 0.8 + rng() * 0.8;
        this.box(mod, M, new THREE.Vector3(x - s, 0, z - 0.9), new THREE.Vector3(x + s, 1.1, z + 0.9));
      }
      this.lamp(mod, M, -9.5, z0 + 30);
      this.lamp(mod, M, 9.5, z0 + 58);
      const rz = z0 + 40;
      this.ring(mod, M, new THREE.Vector3(Math.sin(rz * 0.13) * 5.5, 3.1, rz), 2);
    }

    // background skyline, floating beside the boulevard
    const rng = mulberry32((z0 * 2654435761) >>> 0);
    for (let i = 0; i < 4; i++) {
      const side = rng() < 0.5 ? -1 : 1;
      const x0 = side * (20 + rng() * 26);
      const w = 6 + rng() * 10, d = 8 + rng() * 14, h = 14 + rng() * 30;
      const zb = z0 + rng() * (len - d);
      const base = -22 - rng() * 10;
      this.box(mod, M,
        new THREE.Vector3(Math.min(x0, x0 + side * w), base, zb),
        new THREE.Vector3(Math.max(x0, x0 + side * w), base + h + 22, zb + d),
        { windows: rng() < 0.8, trim: rng() < 0.4 });
    }

    this.crumbs(mod, M, pts);
    mod.len = len;
    mod.exitX = exitX;
    mod.routePts = pts;
    return mod;
  }

  // ---------------------------------------------------------- chain mgmt
  static SEQ = ['boulevard', 'tower', 'boulevard', 'windowWall', 'rooftops', 'boulevard', 'fold', 'canyon'];

  ensure(playerZ) {
    while (this.cursorZ < playerZ + 430) {
      const kind = this.count === 0 ? 'boulevard' : City.SEQ[this.count % City.SEQ.length];
      const eraI = eraIndex(this.totalS);
      const mod = this.buildModule(kind, this.cursorZ, this.cursorX, eraI);

      // era gate when the era flips at this module
      if (eraI > this.prevEra) {
        this.prevEra = eraI;
        const M = this.mats(eraI);
        const gate = new THREE.Group();
        const torus = new THREE.Mesh(new THREE.TorusGeometry(19, 0.9, 12, 64), M.gate.clone());
        torus.material.opacity = 0.55;
        gate.add(torus);
        for (let f = 0; f < 4; f++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 9, 0.6), M.ring);
          const ang = f * Math.PI / 2;
          fin.position.set(Math.cos(ang) * 19, Math.sin(ang) * 19, 0);
          fin.rotation.z = ang + Math.PI / 2;
          gate.add(fin);
        }
        gate.position.set(0, 8, this.cursorZ + 4);
        mod.group.add(gate);
        this.animated.push({ mesh: gate, spin: 0.1, mod });
      }

      // accumulate route arc-length
      let s = this.totalS;
      let last = this.route.length ? this.route[this.route.length - 1].p : new THREE.Vector3(this.cursorX, 0, this.cursorZ);
      for (const pt of mod.routePts) {
        s += pt.p.distanceTo(last);
        last = pt.p;
        pt.s = s;
        this.route.push(pt);
      }
      this.totalS = s;
      mod.sEnd = s;

      this.scene.add(mod.group);
      this.modules.push(mod);
      this.cursorZ += mod.len;
      this.cursorX = mod.exitX;
      this.count++;
    }
    // dispose far behind
    while (this.modules.length && this.modules[0].z0 + this.modules[0].len < playerZ - 130) {
      const m = this.modules.shift();
      this.animated = this.animated.filter(a => a.mod !== m);
      this.rings = this.rings.filter(r => !m.rings.includes(r));
      this.windows = this.windows.filter(w => !m.windows.includes(w));
      m.group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.emissiveMap && o.material.emissiveMap !== this.windowTex) {
          o.material.emissiveMap.dispose();
          o.material.dispose();
        }
      });
      this.scene.remove(m.group);
    }
    this._boxCache.key = '';
  }

  activeBoxes(z) {
    const key = this.modules.map(m => m.z0).join(',') + '|' + Math.round(z / 20);
    if (this._boxCache.key === key) return this._boxCache.boxes;
    const out = [];
    for (const m of this.modules) {
      if (m.z0 + m.len < z - 60 || m.z0 > z + 70) continue;
      out.push(...m.boxes);
    }
    this._boxCache.key = key;
    this._boxCache.boxes = out;
    return out;
  }

  sampleRoute(s) {
    const r = this.route;
    if (!r.length) return null;
    if (s <= r[0].s) return { p: r[0].p.clone(), n: r[0].n.clone(), f: new THREE.Vector3(0, 0, 1), jump: false };
    if (s >= r[r.length - 1].s) {
      const e = r[r.length - 1];
      return { p: e.p.clone(), n: e.n.clone(), f: new THREE.Vector3(0, 0, 1), jump: false };
    }
    let lo = 0, hi = r.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (r[mid].s <= s) lo = mid; else hi = mid;
    }
    const A = r[lo], B = r[hi];
    const t = (s - A.s) / Math.max(1e-6, B.s - A.s);
    const p = A.p.clone().lerp(B.p, t);
    const f = B.p.clone().sub(A.p).normalize();
    return { p, n: A.n.clone(), f, jump: !!A.jump, idx: lo };
  }

  nearestS(p, fromIdx) {
    const r = this.route;
    if (!r.length) return { s: 0, idx: 0, dist: 0 };
    let bestI = Math.max(0, Math.min(fromIdx, r.length - 1));
    let bestD = Infinity;
    const i0 = Math.max(0, fromIdx - 8);
    const i1 = Math.min(r.length - 1, fromIdx + 45);
    for (let i = i0; i <= i1; i++) {
      const d = r[i].p.distanceToSquared(p);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return { s: r[bestI].s, idx: bestI, dist: Math.sqrt(bestD) };
  }

  tryRing(p) {
    for (const r of this.rings) {
      if (r.taken) continue;
      const ax = r.axis;
      if (Math.abs(p.getComponent(ax) - r.p.getComponent(ax)) > 1.7) continue;
      const d2 = r.p.distanceToSquared(p) - (p.getComponent(ax) - r.p.getComponent(ax)) ** 2;
      if (d2 < 2.9 * 2.9) {
        r.taken = true;
        r.mesh.material.opacity = 0.15;
        return r;
      }
    }
    return null;
  }

  tryWindow(p, prevP) {
    for (const w of this.windows) {
      if (w.taken) continue;
      const inside = p.z > w.zMin && p.z < w.zMax && p.x > w.xMin && p.x < w.xMax && p.y > w.yMin - 0.3 && p.y < w.yMax;
      const crossed = (prevP.z <= w.zMin && p.z > w.zMin) || inside;
      if (crossed && p.x > w.xMin && p.x < w.xMax && p.y < w.yMax) {
        w.taken = true;
        return w;
      }
    }
    return null;
  }

  update(dt) {
    for (const a of this.animated) a.mesh.rotation.z += a.spin * dt;
  }
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
