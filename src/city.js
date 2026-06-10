// city.js — an open city, generated in chunks around the skater.
// Porcelain towers on wide plazas, rotating sky-platforms bridging roofs,
// arch walls with window openings, lone skaters waiting to join your troupe,
// and one glowing venue on the horizon: tonight's destination.
import * as THREE from 'three';
import { eraPalette } from './palettes.js';
import { makeSkater } from './skaters.js';

export const CHUNK = 96;

function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 8; j++) {
      if (Math.random() < 0.5) {
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

const RECRUIT_COLORS = [0x35e0c8, 0xffd166, 0xff7a5a, 0xc79bff, 0x9fffcf, 0xff4f6e, 0x8ad9ff, 0xffb6f2];
const RECRUIT_NAMES = ['TINY', 'BENNIE', 'LEVON', 'NIKITA', 'DANIEL', 'ROCKET', 'PHILLY', 'AMY',
  'JOHNNY', 'SUSIE', 'JACKIE', 'STARLIGHT', 'RAY', 'IDA', 'MONA', 'JETS'];

export class City {
  constructor(scene) {
    this.scene = scene;
    this.windowTex = makeWindowTexture();
    this.matCache = new Map();
    this.chunks = new Map();      // "cx,cz" -> chunk
    this.rotors = [];             // {box, mesh, w}
    this.recruits = [];           // {p, name, color, rig, phase, chunk}
    this.windows = [];
    this.night = 0;
    this.recruitCounter = 0;
    this.beacon = null;
    this._boxCache = { key: '', boxes: [] };
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
  }

  mats(night) {
    const key = ((night % 5) + 5) % 5;
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
        edgeSoft: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }),
        rotor: new THREE.MeshStandardMaterial({ color: p.building, roughness: 0.85, metalness: 0,
          emissive: p.trim, emissiveIntensity: 0.08 }),
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
        beam: new THREE.MeshBasicMaterial({
          color: 0xffe9b0, transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
        }),
        gold: new THREE.MeshStandardMaterial({
          color: 0xf6dfb2, roughness: 0.55, metalness: 0.15,
          emissive: 0xffc46a, emissiveIntensity: 0.55,
        }),
      });
    }
    return this.matCache.get(key);
  }

  // -------------------------------------------------------------- helpers
  box(chunk, M, min, max, { windows = false, edges = true, trim = false, mat = null } = {}) {
    const size = new THREE.Vector3().subVectors(max, min);
    const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    let useMat = mat ?? M.building;
    if (windows) {
      useMat = M.buildingWin.clone();
      useMat.emissiveMap = this.windowTex.clone();
      useMat.emissiveMap.repeat.set(Math.max(1, Math.round(size.x / 7)), Math.max(1, Math.round(size.y / 7)));
    }
    const mesh = new THREE.Mesh(geo, useMat);
    mesh.position.copy(mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    chunk.group.add(mesh);
    if (edges) {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), trim ? M.edge : M.edgeSoft);
      line.position.copy(mid);
      chunk.group.add(line);
    }
    const rec = { min: min.clone(), max: max.clone() };
    chunk.boxes.push(rec);
    return rec;
  }

  lamp(chunk, M, x, z) {
    const g = chunk.group;
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

  // -------------------------------------------------------------- chunks
  ensure(p) {
    const ccx = Math.floor(p.x / CHUNK), ccz = Math.floor(p.z / CHUNK);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const key = `${ccx + dx},${ccz + dz}`;
        if (!this.chunks.has(key)) this.chunks.set(key, this.buildChunk(ccx + dx, ccz + dz));
      }
    }
    for (const [key, ch] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > 3 || Math.abs(cz - ccz) > 3) {
        this.disposeChunk(ch);
        this.chunks.delete(key);
      }
    }
    this._boxCache.key = '';
  }

  buildChunk(cx, cz) {
    const M = this.mats(this.night);
    const chunk = { group: new THREE.Group(), boxes: [], cx, cz, rotors: [], recruits: [], windows: [] };
    const rng = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // plaza floor
    this.box(chunk, M,
      new THREE.Vector3(x0 - 0.3, -6, z0 - 0.3),
      new THREE.Vector3(x0 + CHUNK + 0.3, 0, z0 + CHUNK + 0.3),
      { edges: false, mat: M.street });

    // towers (non-overlapping footprints with street gaps)
    const towers = [];
    const tries = 7;
    for (let i = 0; i < tries && towers.length < 4; i++) {
      const w = 11 + rng() * 12, d = 11 + rng() * 12;
      const tx = x0 + 8 + rng() * (CHUNK - 16 - w);
      const tz = z0 + 8 + rng() * (CHUNK - 16 - d);
      let ok = true;
      for (const t of towers) {
        if (tx < t.x + t.w + 8 && tx + w + 8 > t.x && tz < t.z + t.d + 8 && tz + d + 8 > t.z) { ok = false; break; }
      }
      if (!ok) continue;
      const h = 8 + Math.pow(rng(), 1.6) * 32;
      towers.push({ x: tx, z: tz, w, d, h });
      this.box(chunk, M,
        new THREE.Vector3(tx, 0, tz), new THREE.Vector3(tx + w, h, tz + d),
        { windows: true, trim: rng() < 0.45 });
      // rooftop props
      if (rng() < 0.6) {
        const px = tx + 2 + rng() * (w - 5), pz = tz + 2 + rng() * (d - 5);
        this.box(chunk, M, new THREE.Vector3(px, h, pz), new THREE.Vector3(px + 2.2, h + 1.3, pz + 2.2));
      }
    }

    // rotating platform bridging two towers
    if (towers.length >= 2 && rng() < 0.5) {
      const t1 = towers[0], t2 = towers[1];
      const cxr = (t1.x + t1.w / 2 + t2.x + t2.w / 2) / 2;
      const czr = (t1.z + t1.d / 2 + t2.z + t2.d / 2) / 2;
      const topY = Math.max(7, Math.min(t1.h, t2.h) - rng() * 3);
      const hw = 8 + rng() * 5, hd = 2.4 + rng() * 1.2;
      const w = (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.18);
      const geo = new THREE.BoxGeometry(hw * 2, 1.2, hd * 2);
      const mesh = new THREE.Mesh(geo, M.rotor);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(cxr, topY - 0.6, czr);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      mesh.add(line);
      chunk.group.add(mesh);
      const boxRec = {
        min: new THREE.Vector3(-hw, topY - 1.2, -hd),
        max: new THREE.Vector3(hw, topY, hd),
        rot: { cx: cxr, cz: czr, yaw: rng() * Math.PI, w },
      };
      chunk.boxes.push(boxRec);
      const rotor = { box: boxRec, mesh };
      chunk.rotors.push(rotor);
      this.rotors.push(rotor);
    }

    // arch wall with window openings, somewhere on the plaza
    if (rng() < 0.3) {
      const wx = x0 + 14 + rng() * (CHUNK - 56);
      const wz = z0 + 12 + rng() * (CHUNK - 28);
      const W = 26;
      this.box(chunk, M, new THREE.Vector3(wx, 0, wz), new THREE.Vector3(wx + 4, 7, wz + 3.4), { trim: true });
      this.box(chunk, M, new THREE.Vector3(wx + 10, 0, wz), new THREE.Vector3(wx + 16, 7, wz + 3.4), { trim: true });
      this.box(chunk, M, new THREE.Vector3(wx + 22, 0, wz), new THREE.Vector3(wx + W, 7, wz + 3.4), { trim: true });
      this.box(chunk, M, new THREE.Vector3(wx, 7, wz), new THREE.Vector3(wx + W, 13, wz + 3.4), { windows: true, trim: true });
      const recs = [
        { zMin: wz - 0.6, zMax: wz + 4, xMin: wx + 4, xMax: wx + 10, yMin: 0, yMax: 7, taken: false },
        { zMin: wz - 0.6, zMax: wz + 4, xMin: wx + 16, xMax: wx + 22, yMin: 0, yMax: 7, taken: false },
      ];
      for (const r of recs) { this.windows.push(r); chunk.windows.push(r); }
    }

    // lamps
    const lampN = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < lampN; i++) {
      this.lamp(chunk, M, x0 + 10 + rng() * (CHUNK - 20), z0 + 10 + rng() * (CHUNK - 20));
    }

    // a lone skater waiting for a troupe
    if (rng() < 0.5) {
      const color = RECRUIT_COLORS[this.recruitCounter % RECRUIT_COLORS.length];
      const name = RECRUIT_NAMES[this.recruitCounter % RECRUIT_NAMES.length];
      this.recruitCounter++;
      let pos;
      if (towers.length && rng() < 0.3) {
        const t = towers[Math.floor(rng() * towers.length)];
        pos = new THREE.Vector3(t.x + t.w / 2, t.h, t.z + t.d / 2);
      } else {
        pos = new THREE.Vector3(x0 + 16 + rng() * (CHUNK - 32), 0, z0 + 16 + rng() * (CHUNK - 32));
      }
      const rig = makeSkater({ outfit: color, dress: rng() < 0.7 });
      this.scene.add(rig.root);
      const rec = { p: pos, name, color, rig, phase: rng() * Math.PI * 2, chunk };
      chunk.recruits.push(rec);
      this.recruits.push(rec);
    }

    this.scene.add(chunk.group);
    return chunk;
  }

  disposeChunk(ch) {
    this.rotors = this.rotors.filter(r => !ch.rotors.includes(r));
    this.windows = this.windows.filter(w => !ch.windows.includes(w));
    for (const rec of ch.recruits) {
      this.scene.remove(rec.rig.root);
      rec.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.recruits = this.recruits.filter(r => !ch.recruits.includes(r));
    ch.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.emissiveMap && o.material.emissiveMap !== this.windowTex) {
        o.material.emissiveMap.dispose();
        o.material.dispose();
      }
    });
    this.scene.remove(ch.group);
  }

  activeBoxes(p) {
    const ccx = Math.floor(p.x / CHUNK), ccz = Math.floor(p.z / CHUNK);
    const key = `${ccx},${ccz},${this.chunks.size},${this.beacon ? 1 : 0}`;
    if (this._boxCache.key === key) return this._boxCache.boxes;
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const ch = this.chunks.get(`${ccx + dx},${ccz + dz}`);
        if (ch) out.push(...ch.boxes);
      }
    }
    if (this.beacon) {
      const d2 = (p.x - this.beacon.pos.x) ** 2 + (p.z - this.beacon.pos.z) ** 2;
      if (d2 < 150 * 150) out.push(...this.beacon.boxes);
    }
    this._boxCache.key = key;
    this._boxCache.boxes = out;
    return out;
  }

  // -------------------------------------------------------------- gameplay
  tryRecruit(p, r = 8) {
    for (let i = 0; i < this.recruits.length; i++) {
      const rec = this.recruits[i];
      if (rec.p.distanceToSquared(p) < r * r) {
        this.recruits.splice(i, 1);
        rec.chunk.recruits = rec.chunk.recruits.filter(x => x !== rec);
        this.scene.remove(rec.rig.root);
        rec.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        return { name: rec.name, color: rec.color, p: rec.p.clone() };
      }
    }
    return null;
  }

  tryWindow(p, prevP) {
    for (const w of this.windows) {
      if (w.taken) continue;
      const inX = p.x > w.xMin && p.x < w.xMax;
      const crossed = (prevP.z <= w.zMin && p.z > w.zMin) || (prevP.z >= w.zMax && p.z < w.zMax);
      if (crossed && inX && p.y < w.yMax) {
        w.taken = true;
        return w;
      }
    }
    return null;
  }

  setDestination(pos, night) {
    this.clearBeacon();
    const M = this.mats(night);
    const group = new THREE.Group();
    const boxes = [];
    const T = 9;   // half-size of the venue tower
    const H = 42;
    const geo = new THREE.BoxGeometry(T * 2, H, T * 2);
    const tower = new THREE.Mesh(geo, M.gold);
    tower.position.set(pos.x, H / 2, pos.z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
    line.position.copy(tower.position);
    group.add(line);
    boxes.push({
      min: new THREE.Vector3(pos.x - T, 0, pos.z - T),
      max: new THREE.Vector3(pos.x + T, H, pos.z + T),
    });
    // marquee steps at the base
    const step = new THREE.Mesh(new THREE.BoxGeometry(T * 2 + 8, 2.2, T * 2 + 8), M.gold);
    step.position.set(pos.x, 1.1, pos.z);
    step.receiveShadow = true;
    group.add(step);
    boxes.push({
      min: new THREE.Vector3(pos.x - T - 4, 0, pos.z - T - 4),
      max: new THREE.Vector3(pos.x + T + 4, 2.2, pos.z + T + 4),
    });
    // the light you follow
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.2, 520, 16, 1, true), M.beam);
    beam.position.set(pos.x, 260, pos.z);
    group.add(beam);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(T * 1.7, 0.5, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, fog: false }));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(pos.x, H + 5, pos.z);
    group.add(halo);
    this.scene.add(group);
    this.beacon = { pos: pos.clone(), group, boxes, halo, beam };
  }

  clearBeacon() {
    if (!this.beacon) return;
    this.beacon.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.beacon.group);
    this.beacon = null;
  }

  update(dt, t) {
    for (const r of this.rotors) {
      r.box.rot.yaw += r.box.rot.w * dt;
      r.mesh.rotation.y = r.box.rot.yaw;
    }
    if (this.beacon) {
      this.beacon.halo.rotation.z += dt * 0.4;
      this.beacon.beam.material.opacity = 0.3 + Math.sin(t * 1.7) * 0.07;
    }
    // idle recruits skate lazy little circles
    for (const rec of this.recruits) {
      const a = t * 0.9 + rec.phase;
      const px = rec.p.x + Math.cos(a) * 2.4;
      const pz = rec.p.z + Math.sin(a) * 2.4;
      rec.rig.root.position.set(px, rec.p.y, pz);
      this._m.makeBasis(
        new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
      rec.rig.root.quaternion.setFromRotationMatrix(this._m);
      rec.rig.animate(t + rec.phase, 7, 0.3);
    }
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
