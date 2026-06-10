// city.js — a neon-noir open city, generated in chunks around the skater.
// Road grids with lane paint and sidewalks, dark glass towers full of lit
// windows, modeled streetlights, neon signs and animated billboards, street
// furniture, ground traffic, flying traffic, spinning sky-platforms — and
// one golden venue on the horizon: tonight's destination.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { eraPalette, STUCCOS } from './palettes.js';
import { makeCharacter } from './avatars.js';

export const CHUNK = 96;
const ROAD = 11;          // road width along west/south chunk edges
const BLOCK0 = ROAD + 4;  // block (buildable) region inset

const RECRUIT_COLORS = [0x35e0c8, 0xffd166, 0xff7a5a, 0xc79bff, 0x9fffcf, 0xff4f6e, 0x8ad9ff, 0xffb6f2];
const RECRUIT_NAMES = ['TINY', 'BENNIE', 'LEVON', 'NIKITA', 'DANIEL', 'ROCKET', 'PHILLY', 'AMY',
  'JOHNNY', 'SUSIE', 'JACKIE', 'STARLIGHT', 'RAY', 'IDA', 'MONA', 'JETS'];
const SIGN_WORDS = ['FLAMINGO', 'OCEAN', 'TROPICANA', 'PARADISE', 'STARLITE', 'EL REY',
  'COCKTAILS', 'MOTEL', 'CABANA', 'DISCO', 'ROLLER', 'SUNSET', 'CLOSER'];
const CAR_COLORS = [0xf2b8c6, 0x7fd4c1, 0xf7e3b5, 0xc9b8f0, 0xff8a5c, 0xfaf2e0];

function makeWindowTexture(neonHex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#06070c';
  g.fillRect(0, 0, 256, 256);
  const cols = 12, rows = 16;
  const cw = 256 / cols, rh = 256 / rows;
  for (let j = 0; j < rows; j++) {
    const office = Math.random() < 0.14;     // a whole floor working late
    for (let i = 0; i < cols; i++) {
      const lit = office ? Math.random() < 0.85 : Math.random() < 0.30;
      if (!lit) continue;
      const r = Math.random();
      g.fillStyle = r < 0.45 ? '#ffe8c8' : r < 0.85 ? '#cfe6f8' : neonHex;
      g.globalAlpha = 0.45 + Math.random() * 0.55;
      g.fillRect(i * cw + 2.5, j * rh + 3, cw - 5, rh - 7);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(word, colorHex) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#141018';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = colorHex;
  g.shadowColor = colorHex;
  g.shadowBlur = 14;
  g.font = 'bold 34px Futura, "Avenir Next", "Century Gothic", sans-serif';
  g.textAlign = 'center';
  const chars = word.split('');
  const step = Math.min(44, 236 / chars.length);
  chars.forEach((ch, i) => g.fillText(ch, 32, 42 + i * step));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBillboardTexture(word, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = fg;
  g.shadowColor = fg;
  g.shadowBlur = 18;
  g.font = 'bold 44px Futura, "Avenir Next", "Century Gothic", sans-serif';
  g.textAlign = 'center';
  g.fillText(word, 128, 80);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene, maxAniso = 4) {
    this.scene = scene;
    this.maxAniso = maxAniso;
    this.matCache = new Map();
    this.texCache = new Map();
    this.glowTex = makeGlowSprite();
    this.chunks = new Map();
    this.rotors = [];
    this.recruits = [];
    this.windows = [];
    this.cars = [];
    this.billboards = [];
    this.blinkers = [];
    this.night = 0;
    this.recruitsEnabled = false;   // solo night for now
    this.recruitCounter = 0;
    this.beacon = null;
    this._boxCache = { key: '', boxes: [] };
    this._m = new THREE.Matrix4();

    // marquee chase-lights: a string of bulbs running from you to the party
    this.partyLights = [];
    for (let i = 0; i < 9; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffd166, transparent: true,
        opacity: 0, depthWrite: false,
      }));
      spr.scale.setScalar(2.4);
      scene.add(spr);
      this.partyLights.push(spr);
    }

    // flying traffic, ambient
    this.flyers = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 4.2),
        new THREE.MeshStandardMaterial({ color: 0x14161e, roughness: 0.3, metalness: 0.7 }));
      g.add(body);
      const lt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff4060 : 0xfff2d0 }));
      lt.position.set(0, 0, i % 2 ? 2.0 : -2.0);
      g.add(lt);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: i % 2 ? 0xff4060 : 0x9fd8ff,
        transparent: true, opacity: 0.7, depthWrite: false,
      }));
      spr.scale.setScalar(3.2);
      g.add(spr);
      scene.add(g);
      const ang = Math.random() * Math.PI * 2;
      this.flyers.push({
        group: g, y: 36 + Math.random() * 38,
        dir: new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)),
        speed: 16 + Math.random() * 16,
        p: new THREE.Vector3((Math.random() - 0.5) * 400, 0, (Math.random() - 0.5) * 400),
      });
    }
  }

  mats(night) {
    const key = ((night % 5) + 5) % 5;
    if (!this.matCache.has(key)) {
      const p = eraPalette(key);
      const trimHex = '#' + new THREE.Color(p.trim).getHexString();
      const winTex = [makeWindowTexture(trimHex), makeWindowTexture(trimHex), makeWindowTexture(trimHex)];
      this.matCache.set(key, {
        palette: p,
        winTex,
        concrete: new THREE.MeshStandardMaterial({ color: p.building, roughness: 0.85, metalness: 0.05 }),
        asphalt: new THREE.MeshStandardMaterial({
          color: p.street, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.55 }),
        sidewalk: new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.street).lerp(new THREE.Color(0xffffff), 0.13), roughness: 0.95 }),
        lanePaint: new THREE.MeshBasicMaterial({ color: 0xcfd2da, transparent: true, opacity: 0.5 }),
        laneNeon: new THREE.MeshBasicMaterial({
          color: p.trim, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false }),
        edge: new THREE.LineBasicMaterial({ color: p.trim, transparent: true, opacity: 0.35 }),
        edgeSoft: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }),
        metal: new THREE.MeshStandardMaterial({ color: 0x1c1f28, roughness: 0.35, metalness: 0.8 }),
        lampHead: new THREE.MeshBasicMaterial({ color: p.lamp }),
        pool: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.13,
          blending: THREE.AdditiveBlending, depthWrite: false }),
        cone: new THREE.MeshBasicMaterial({
          color: p.lamp, transparent: true, opacity: 0.028,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        rotor: new THREE.MeshStandardMaterial({
          color: p.building, roughness: 0.4, metalness: 0.5,
          emissive: p.trim, emissiveIntensity: 0.12 }),
        beam: new THREE.MeshBasicMaterial({
          color: 0xffe9b0, transparent: true, opacity: 0.3,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
        gold: new THREE.MeshStandardMaterial({
          color: 0xf6dfb2, roughness: 0.45, metalness: 0.3,
          emissive: 0xffc46a, emissiveIntensity: 0.6 }),
        vendFront: new THREE.MeshBasicMaterial({ color: p.neon2 }),
        hydrant: new THREE.MeshStandardMaterial({ color: 0xb03038, roughness: 0.6 }),
        stripeA: new THREE.MeshStandardMaterial({
          color: p.trim, roughness: 0.5, emissive: p.trim, emissiveIntensity: 0.45 }),
        stripeB: new THREE.MeshStandardMaterial({
          color: p.neon2, roughness: 0.5, emissive: p.neon2, emissiveIntensity: 0.45 }),
        trunk: new THREE.MeshStandardMaterial({ color: 0x7a5c40, roughness: 0.9 }),
        frond: new THREE.MeshStandardMaterial({ color: 0x2e7d52, roughness: 0.8 }),
        chrome: new THREE.MeshStandardMaterial({
          color: 0xd8dde2, roughness: 0.18, metalness: 0.9, envMapIntensity: 1.2 }),
      });
    }
    return this.matCache.get(key);
  }

  glassMat(M, variant) {
    const p = M.palette;
    const tex = M.winTex[variant % 3].clone();
    tex.anisotropy = this.maxAniso;
    return new THREE.MeshStandardMaterial({
      color: p.glass, roughness: 0.22, metalness: 0.7,
      emissive: 0xffffff, emissiveMap: tex,
      emissiveIntensity: 0.8, envMapIntensity: 1.1,
    });
  }
  // pastel deco stucco, windows glowing warm in the dusk
  stuccoMat(M, variant, stucco) {
    const tex = M.winTex[variant % 3].clone();
    tex.anisotropy = this.maxAniso;
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(stucco).lerp(new THREE.Color(M.palette.building), 0.3),
      roughness: 0.85, metalness: 0.02,
      emissive: 0xffffff, emissiveMap: tex,
      emissiveIntensity: 0.5,
    });
  }

  // -------------------------------------------------------------- builders
  collider(chunk, min, max) {
    chunk.boxes.push({ min: min.clone(), max: max.clone() });
  }

  // a tier of a tower: pastel stucco (or rare glass) with windows, neon
  // edge outline, deco racing stripes, collider
  tierBox(chunk, M, x, z, w, d, y0, h, rng, stucco) {
    const variant = Math.floor(rng() * 3);
    const isGlass = rng() < 0.22;
    const mat = isGlass ? this.glassMat(M, variant) : this.stuccoMat(M, variant, stucco);
    mat.emissiveMap.repeat.set(Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(h / 9)));
    const geo = new THREE.BoxGeometry(w, h, d);
    const roof = new THREE.MeshStandardMaterial({
      color: new THREE.Color(stucco).multiplyScalar(0.55), roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, [mat, mat, roof, roof, mat, mat]);
    mesh.position.set(x + w / 2, y0 + h / 2, z + d / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    chunk.group.add(mesh);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), rng() < 0.7 ? M.edge : M.edgeSoft);
    line.position.copy(mesh.position);
    chunk.group.add(line);
    // deco speed stripes wrapping the facade
    const stripes = h > 14 ? 1 + Math.floor(rng() * 2) : rng() < 0.5 ? 1 : 0;
    for (let s = 0; s < stripes; s++) {
      const sy = y0 + h * (0.25 + rng() * 0.6);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.12, 0.5, d + 0.12),
        rng() < 0.5 ? M.stripeA : M.stripeB);
      stripe.position.set(x + w / 2, sy, z + d / 2);
      chunk.group.add(stripe);
    }
    this.collider(chunk,
      new THREE.Vector3(x, y0, z), new THREE.Vector3(x + w, y0 + h, z + d));
  }

  // a Miami palm: leaning trunk, drooping fronds
  palm(chunk, M, x, z, rng) {
    const g = new THREE.Group();
    const h = 5.5 + rng() * 4;
    const lean = (rng() - 0.5) * 0.3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, h, 6), M.trunk);
    trunk.position.y = h / 2;
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    g.add(trunk);
    const topX = Math.sin(lean) * -h * 0.95;
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4, 1), M.frond);
      const ang = (i / 7) * Math.PI * 2 + rng();
      frond.position.set(topX, h * 0.97, 0);
      frond.rotation.order = 'YXZ';
      frond.rotation.y = ang;
      frond.rotation.x = 1.85 + rng() * 0.25;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    chunk.group.add(g);
  }

  tower(chunk, M, x, z, w, d, h, rng) {
    const stucco = STUCCOS[Math.floor(rng() * STUCCOS.length)];
    // stacked tiers with setback terraces — ledges at every altitude
    let tiers;
    if (h > 80) tiers = [0.45, 0.32, 0.23];
    else if (h > 40) tiers = [0.58, 0.42];
    else tiers = [1];
    let y0 = 0, tw = w, td = d, tx = x, tz = z;
    const terraces = [];
    for (const frac of tiers) {
      const th = h * frac;
      this.tierBox(chunk, M, tx, tz, tw, td, y0, th, rng, stucco);
      y0 += th;
      terraces.push({ x: tx, z: tz, w: tw, d: td, top: y0 });
      const shrink = 0.72 + rng() * 0.12;
      const nw = tw * shrink, nd = td * shrink;
      tx += (tw - nw) / 2;
      tz += (td - nd) / 2;
      tw = nw;
      td = nd;
    }
    chunk.terraces.push(...terraces);

    // collar terrace ringing the tower mid-height
    if (h > 50 && rng() < 0.3) {
      const hc = h * (0.35 + rng() * 0.25);
      const t = terraces[0];
      const ext = 3.6;
      const mkSlab = (sx, sz, sw, sd) => {
        const geo = new THREE.BoxGeometry(sw, 1.0, sd);
        const m = new THREE.Mesh(geo, M.concrete);
        m.position.set(sx + sw / 2, hc - 0.5, sz + sd / 2);
        m.castShadow = m.receiveShadow = true;
        chunk.group.add(m);
        const ln = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
        ln.position.copy(m.position);
        chunk.group.add(ln);
        this.collider(chunk,
          new THREE.Vector3(sx, hc - 1.0, sz), new THREE.Vector3(sx + sw, hc, sz + sd));
      };
      mkSlab(t.x - ext, t.z - ext, t.w + ext * 2, ext);
      mkSlab(t.x - ext, t.z + t.d, t.w + ext * 2, ext);
      mkSlab(t.x - ext, t.z, ext, t.d);
      mkSlab(t.x + t.w, t.z, ext, t.d);
    }

    // supertalls grow a climbable mast
    if (h > 80) {
      const tt = terraces[terraces.length - 1];
      const mx = tt.x + tt.w / 2, mz = tt.z + tt.d / 2;
      const mh = 14 + rng() * 8;
      const geo = new THREE.BoxGeometry(1.7, mh, 1.7);
      const mast = new THREE.Mesh(geo, M.metal);
      mast.position.set(mx, tt.top + mh / 2, mz);
      mast.castShadow = true;
      chunk.group.add(mast);
      this.collider(chunk,
        new THREE.Vector3(mx - 0.85, tt.top, mz - 0.85),
        new THREE.Vector3(mx + 0.85, tt.top + mh, mz + 0.85));
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3048 }));
      blink.position.set(mx, tt.top + mh + 0.5, mz);
      chunk.group.add(blink);
      this.blinkers.push({ mesh: blink, phase: rng() * 6, chunk });
    }

    // rooftop gear on the top tier: antenna, vents, dish
    const tt = terraces[terraces.length - 1];
    if (rng() < 0.85 && tt.w > 6) {
      const ax = tt.x + 2 + rng() * (tt.w - 4), az = tt.z + 2 + rng() * (tt.d - 4);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5 + rng() * 5, 6), M.metal);
      ant.position.set(ax, tt.top + ant.geometry.parameters.height / 2, az);
      chunk.group.add(ant);
      const blink = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3048 }));
      blink.position.set(ax, tt.top + ant.geometry.parameters.height + 0.2, az);
      chunk.group.add(blink);
      this.blinkers.push({ mesh: blink, phase: rng() * 6, chunk });
    }
    for (const t of terraces) {
      if (rng() < 0.4 && t.w > 7) {
        const vx = t.x + 2 + rng() * (t.w - 5), vz = t.z + 2 + rng() * (t.d - 5);
        const vent = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), M.metal);
        vent.position.set(vx, t.top + 0.6, vz);
        vent.castShadow = true;
        chunk.group.add(vent);
        this.collider(chunk,
          new THREE.Vector3(vx - 1.1, t.top, vz - 1.1), new THREE.Vector3(vx + 1.1, t.top + 1.2, vz + 1.1));
      }
    }
    if (rng() < 0.4) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.metal);
      dish.rotation.x = Math.PI * 0.65;
      dish.position.set(tt.x + tt.w - 2.5, tt.top + 0.8, tt.z + 2.5);
      chunk.group.add(dish);
    }

    // vertical neon sign near the base
    if (rng() < 0.45) {
      const word = SIGN_WORDS[Math.floor(rng() * SIGN_WORDS.length)];
      const colHex = '#' + new THREE.Color(rng() < 0.5 ? M.palette.trim : M.palette.neon2).getHexString();
      const tex = makeSignTexture(word, colHex);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 7, 0.4),
        new THREE.MeshBasicMaterial({ map: tex }));
      const side = rng() < 0.5;
      sign.position.set(
        side ? x - 0.9 : x + w / 2 + (rng() - 0.5) * w * 0.5,
        5.5,
        side ? z + d / 2 + (rng() - 0.5) * d * 0.5 : z - 0.9);
      chunk.group.add(sign);
    }
    // (no text up high — signage lives at street level only)
  }

  streetlight(chunk, M, x, z, faceX) {
    // pole + curved arm + head, light pooled on the road
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.4, 8), M.metal);
    pole.position.y = 3.7;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 12, Math.PI / 2), M.metal);
    arm.position.set(0, 7.4 - 1.5, 0);
    arm.rotation.z = 0;
    g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.34), M.metal);
    head.position.set(1.5, 7.4, 0);
    g.add(head);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.26), M.lampHead);
    panel.position.set(1.5, 7.3, 0);
    g.add(panel);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: M.palette.lamp, transparent: true, opacity: 0.55, depthWrite: false }));
    spr.scale.setScalar(2.6);
    spr.position.set(1.5, 7.25, 0);
    g.add(spr);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20), M.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(1.5, 0.07, 0);
    g.add(pool);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7.2, 16, 1, true), M.cone);
    cone.position.set(1.5, 3.6, 0);
    g.add(cone);
    g.position.set(x, 0, z);
    if (faceX !== undefined) g.rotation.y = faceX;
    chunk.group.add(g);
  }

  vending(chunk, M, x, z, rot) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), M.metal);
    body.position.set(x, 0.95, z);
    body.rotation.y = rot;
    body.castShadow = true;
    chunk.group.add(body);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), M.vendFront);
    front.position.set(x + Math.sin(rot) * 0.41, 1.0, z + Math.cos(rot) * 0.41);
    front.rotation.y = rot;
    chunk.group.add(front);
    this.collider(chunk,
      new THREE.Vector3(x - 0.6, 0, z - 0.6), new THREE.Vector3(x + 0.6, 1.9, z + 0.6));
  }

  makeCar(M, rng) {
    // a long pastel land-yacht with chrome bumpers
    const g = new THREE.Group();
    const col = CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 4.9),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.32, metalness: 0.25, envMapIntensity: 0.9 }));
    body.position.y = 0.55;
    body.castShadow = true;
    g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x18222a, roughness: 0.12, metalness: 0.85, envMapIntensity: 1.3 }));
    cab.position.set(0, 0.93, -0.3);
    g.add(cab);
    for (const bz of [2.5, -2.5]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.16, 0.22), M.chrome);
      bumper.position.set(0, 0.42, bz);
      g.add(bumper);
    }
    for (const sx of [-0.85, 0.85]) {
      for (const sz of [-1.4, 1.4]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), M.metal);
        wh.rotation.z = Math.PI / 2;
        wh.position.set(sx, 0.34, sz);
        g.add(wh);
      }
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xfff4d8 }));
    head.position.set(0, 0.6, 2.16);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff2a4a }));
    tail.position.set(0, 0.62, -2.16);
    g.add(tail);
    const hs = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xfff4d8, transparent: true, opacity: 0.6, depthWrite: false }));
    hs.scale.setScalar(2.4);
    hs.position.set(0, 0.6, 2.5);
    g.add(hs);
    if (rng() < 0.15) {
      const under = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4),
        new THREE.MeshBasicMaterial({
          color: rng() < 0.5 ? M.palette.trim : M.palette.neon2,
          transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      under.rotation.x = -Math.PI / 2;
      under.position.y = 0.12;
      g.add(under);
    }
    return g;
  }

  // -------------------------------------------------------------- chunks
  ensure(p) {
    const ccx = Math.floor(p.x / CHUNK), ccz = Math.floor(p.z / CHUNK);
    // the 3x3 around the skater must exist immediately (physics lives here)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${ccx + dx},${ccz + dz}`;
        if (!this.chunks.has(key)) this.chunks.set(key, this.buildChunk(ccx + dx, ccz + dz));
      }
    }
    // the rest streams in a couple of chunks per frame, nearest first,
    // far enough out that the fog hides the seam
    const missing = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
        const key = `${ccx + dx},${ccz + dz}`;
        if (!this.chunks.has(key)) missing.push({ key, cx: ccx + dx, cz: ccz + dz, d: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.d - b.d);
    if (missing.length) {
      this.chunks.set(missing[0].key, this.buildChunk(missing[0].cx, missing[0].cz));
    }
    for (const [key, ch] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > 4 || Math.abs(cz - ccz) > 4) {
        this.disposeChunk(ch);
        this.chunks.delete(key);
      }
    }
    this._boxCache.key = '';
  }

  buildChunk(cx, cz) {
    const M = this.mats(this.night);
    const chunk = {
      group: new THREE.Group(), boxes: [], cx, cz,
      rotors: [], recruits: [], windows: [], cars: [], billboards: [], blinkers: [],
      terraces: [], skySpots: [],
    };
    const rng = mulberry32(((cx * 73856093) ^ (cz * 19349663)) >>> 0);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    // ground: one asphalt slab (roads + block base)
    {
      const geo = new THREE.BoxGeometry(CHUNK + 0.6, 6, CHUNK + 0.6);
      const mesh = new THREE.Mesh(geo, M.asphalt);
      mesh.position.set(x0 + CHUNK / 2, -3, z0 + CHUNK / 2);
      mesh.receiveShadow = true;
      chunk.group.add(mesh);
      this.collider(chunk,
        new THREE.Vector3(x0 - 0.3, -6, z0 - 0.3),
        new THREE.Vector3(x0 + CHUNK + 0.3, 0, z0 + CHUNK + 0.3));
    }

    // sidewalk ring around the block + lane paint on the two roads (merged meshes)
    {
      const sw = [];
      const b0 = BLOCK0 - 3.6;
      const plate = (x, z, w, d) => {
        const g = new THREE.BoxGeometry(w, 0.14, d);
        g.translate(x + w / 2, 0.07, z + d / 2);
        sw.push(g);
      };
      plate(x0 + b0, z0 + b0, CHUNK - b0 - 1, 3.6);
      plate(x0 + b0, z0 + CHUNK - 1, CHUNK - b0 - 1, 1);
      plate(x0 + b0, z0 + b0 + 3.6, 3.6, CHUNK - b0 - 4.6);
      plate(x0 + CHUNK - 1, z0 + b0 + 3.6, 1, CHUNK - b0 - 4.6);
      const swMesh = new THREE.Mesh(mergeGeometries(sw), M.sidewalk);
      swMesh.receiveShadow = true;
      chunk.group.add(swMesh);
      sw.forEach(g => g.dispose());

      const dashes = [];
      for (let t = 4; t < CHUNK - 2; t += 7) {
        const g1 = new THREE.BoxGeometry(0.22, 0.02, 2.6);
        g1.translate(x0 + ROAD / 2, 0.055, z0 + t);
        dashes.push(g1);
        const g2 = new THREE.BoxGeometry(2.6, 0.02, 0.22);
        g2.translate(x0 + t, 0.055, z0 + ROAD / 2);
        dashes.push(g2);
      }
      const dashMesh = new THREE.Mesh(mergeGeometries(dashes), M.lanePaint);
      chunk.group.add(dashMesh);
      dashes.forEach(g => g.dispose());

      // neon curb strips along the block edge — guides the eye, very cyberpunk
      const neon = [];
      const n1 = new THREE.BoxGeometry(CHUNK - b0, 0.03, 0.14);
      n1.translate(x0 + b0 + (CHUNK - b0) / 2, 0.085, z0 + b0);
      neon.push(n1);
      const n2 = new THREE.BoxGeometry(0.14, 0.03, CHUNK - b0);
      n2.translate(x0 + b0, 0.085, z0 + b0 + (CHUNK - b0) / 2);
      neon.push(n2);
      const neonMesh = new THREE.Mesh(mergeGeometries(neon), M.laneNeon);
      chunk.group.add(neonMesh);
      neon.forEach(g => g.dispose());
    }

    // towers in the block — tall and dense: this city lives in the sky
    const towers = [];
    for (let i = 0; i < 16 && towers.length < 6; i++) {
      const w = 13 + rng() * 13, d = 13 + rng() * 13;
      const tx = x0 + BLOCK0 + 1 + rng() * (CHUNK - BLOCK0 - w - 4);
      const tz = z0 + BLOCK0 + 1 + rng() * (CHUNK - BLOCK0 - d - 4);
      let ok = true;
      for (const t of towers) {
        if (tx < t.x + t.w + 6 && tx + w + 6 > t.x && tz < t.z + t.d + 6 && tz + d + 6 > t.z) { ok = false; break; }
      }
      if (!ok) continue;
      const band = rng();
      const h = band < 0.28 ? 16 + rng() * 22
        : band < 0.74 ? 42 + rng() * 38
        : 82 + rng() * 68;
      towers.push({ x: tx, z: tz, w, d, h });
      this.tower(chunk, M, tx, tz, w, d, h, rng);
    }

    // floating sky slabs — stepping stones of the upper city
    const slabN = 1 + (rng() < 0.6 ? 1 : 0);
    for (let i = 0; i < slabN; i++) {
      const sw = 10 + rng() * 7, sd = 10 + rng() * 7;
      const sx = x0 + 6 + rng() * (CHUNK - sw - 12);
      const sz = z0 + 6 + rng() * (CHUNK - sd - 12);
      const alt = 48 + rng() * 62;
      const geo = new THREE.BoxGeometry(sw, 1.4, sd);
      const m = new THREE.Mesh(geo, M.concrete);
      m.position.set(sx + sw / 2, alt - 0.7, sz + sd / 2);
      m.castShadow = m.receiveShadow = true;
      chunk.group.add(m);
      const ln = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      ln.position.copy(m.position);
      chunk.group.add(ln);
      // neon underside ring so it glows from below
      const glow = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.8, 0.1, sd * 0.8), M.laneNeon);
      glow.position.set(sx + sw / 2, alt - 1.5, sz + sd / 2);
      chunk.group.add(glow);
      this.collider(chunk,
        new THREE.Vector3(sx, alt - 1.4, sz), new THREE.Vector3(sx + sw, alt, sz + sd));
      chunk.skySpots.push({ x: sx + sw / 2, y: alt, z: sz + sd / 2 });
    }

    // skybridges: decks connecting towers — at the roofline AND mid-air
    const bridgeAt = (t1, t2, alt) => {
      const c1 = { x: t1.x + t1.w / 2, z: t1.z + t1.d / 2 };
      const c2 = { x: t2.x + t2.w / 2, z: t2.z + t2.d / 2 };
      let min, max;
      if (Math.abs(c1.x - c2.x) > Math.abs(c1.z - c2.z)) {
        const zMid = (c1.z + c2.z) / 2;
        min = new THREE.Vector3(Math.min(c1.x, c2.x), alt - 1.1, zMid - 2.2);
        max = new THREE.Vector3(Math.max(c1.x, c2.x), alt, zMid + 2.2);
      } else {
        const xMid = (c1.x + c2.x) / 2;
        min = new THREE.Vector3(xMid - 2.2, alt - 1.1, Math.min(c1.z, c2.z));
        max = new THREE.Vector3(xMid + 2.2, alt, Math.max(c1.z, c2.z));
      }
      const geo = new THREE.BoxGeometry(max.x - min.x, 1.1, max.z - min.z);
      const mesh = new THREE.Mesh(geo, M.concrete);
      mesh.position.set((min.x + max.x) / 2, alt - 0.55, (min.z + max.z) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      chunk.group.add(mesh);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      line.position.copy(mesh.position);
      chunk.group.add(line);
      this.collider(chunk, min, max);
    };
    if (towers.length >= 2) {
      const t1 = towers[0], t2 = towers[1];
      const top = Math.min(t1.h, t2.h);
      if (rng() < 0.6) bridgeAt(t1, t2, top);
      if (top > 50 && rng() < 0.6) bridgeAt(t1, t2, top * (0.4 + rng() * 0.3));
      if (towers.length >= 3 && rng() < 0.5) {
        const t3 = towers[2];
        bridgeAt(t2, t3, Math.min(t2.h, t3.h) * (0.6 + rng() * 0.4));
      }
    }

    // sky highline: a walkway striding the whole block, anchored in the towers
    if (rng() < 0.45) {
      const h = 42 + rng() * 26;
      const alongX = rng() < 0.5;
      const c = BLOCK0 + 6 + rng() * (CHUNK - BLOCK0 - 14);
      let min, max;
      if (alongX) {
        min = new THREE.Vector3(x0 - 0.2, h - 1.1, z0 + c - 2.4);
        max = new THREE.Vector3(x0 + CHUNK + 0.2, h, z0 + c + 2.4);
      } else {
        min = new THREE.Vector3(x0 + c - 2.4, h - 1.1, z0 - 0.2);
        max = new THREE.Vector3(x0 + c + 2.4, h, z0 + CHUNK + 0.2);
      }
      const geo = new THREE.BoxGeometry(max.x - min.x, 1.1, max.z - min.z);
      const mesh = new THREE.Mesh(geo, M.concrete);
      mesh.position.set((min.x + max.x) / 2, h - 0.55, (min.z + max.z) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      chunk.group.add(mesh);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      line.position.copy(mesh.position);
      chunk.group.add(line);
      this.collider(chunk, min, max);
      const glowGeo = new THREE.BoxGeometry(alongX ? CHUNK : 0.3, 0.08, alongX ? 0.3 : CHUNK);
      const glow = new THREE.Mesh(glowGeo, M.laneNeon);
      glow.position.set(mesh.position.x, h - 1.25, mesh.position.z);
      chunk.group.add(glow);
      chunk.skySpots.push({ x: mesh.position.x, y: h, z: mesh.position.z });
    }

    // low highline: an elevated walkway striding across the whole block on pillars
    if (rng() < 0.42) {
      const h = 12 + rng() * 9;
      const alongX = rng() < 0.5;
      const c = BLOCK0 + 6 + rng() * (CHUNK - BLOCK0 - 14);
      let min, max;
      if (alongX) {
        min = new THREE.Vector3(x0 - 0.2, h - 1.1, z0 + c - 2.4);
        max = new THREE.Vector3(x0 + CHUNK + 0.2, h, z0 + c + 2.4);
      } else {
        min = new THREE.Vector3(x0 + c - 2.4, h - 1.1, z0 - 0.2);
        max = new THREE.Vector3(x0 + c + 2.4, h, z0 + CHUNK + 0.2);
      }
      const geo = new THREE.BoxGeometry(max.x - min.x, 1.1, max.z - min.z);
      const mesh = new THREE.Mesh(geo, M.concrete);
      mesh.position.set((min.x + max.x) / 2, h - 0.55, (min.z + max.z) / 2);
      mesh.castShadow = mesh.receiveShadow = true;
      chunk.group.add(mesh);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      line.position.copy(mesh.position);
      chunk.group.add(line);
      this.collider(chunk, min, max);
      // neon underside strip — visible from the street, very inviting
      const glowGeo = new THREE.BoxGeometry(
        alongX ? CHUNK : 0.3, 0.08, alongX ? 0.3 : CHUNK);
      const glow = new THREE.Mesh(glowGeo, M.laneNeon);
      glow.position.set(mesh.position.x, h - 1.2, mesh.position.z);
      chunk.group.add(glow);
      // climbable support pillars
      for (let tpos = 14; tpos < CHUNK - 4; tpos += 30) {
        const px = alongX ? x0 + tpos : x0 + c;
        const pz = alongX ? z0 + c : z0 + tpos;
        const pg = new THREE.BoxGeometry(1.4, h - 1.1, 1.4);
        const pm = new THREE.Mesh(pg, M.concrete);
        pm.position.set(px, (h - 1.1) / 2, pz);
        pm.castShadow = true;
        chunk.group.add(pm);
        this.collider(chunk,
          new THREE.Vector3(px - 0.7, 0, pz - 0.7), new THREE.Vector3(px + 0.7, h - 1.1, pz + 0.7));
      }
    }

    // spinning platform between two roofs
    if (towers.length >= 2 && rng() < 0.6) {
      const t1 = towers[0], t2 = towers[1];
      const cxr = (t1.x + t1.w / 2 + t2.x + t2.w / 2) / 2;
      const czr = (t1.z + t1.d / 2 + t2.z + t2.d / 2) / 2;
      const topY = Math.max(9, Math.min(t1.h, t2.h) * (0.55 + rng() * 0.45));
      const hw = 8 + rng() * 5, hd = 2.4 + rng() * 1.2;
      const w = (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.18);
      const geo = new THREE.BoxGeometry(hw * 2, 1.1, hd * 2);
      const mesh = new THREE.Mesh(geo, M.rotor);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.position.set(cxr, topY - 0.55, czr);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
      mesh.add(line);
      chunk.group.add(mesh);
      const boxRec = {
        min: new THREE.Vector3(-hw, topY - 1.1, -hd),
        max: new THREE.Vector3(hw, topY, hd),
        rot: { cx: cxr, cz: czr, yaw: rng() * Math.PI, w },
      };
      chunk.boxes.push(boxRec);
      const rotor = { box: boxRec, mesh };
      chunk.rotors.push(rotor);
      this.rotors.push(rotor);
    }

    // power cable between two towers, with lanterns
    if (towers.length >= 2 && rng() < 0.45) {
      const t1 = towers[0], t2 = towers[1];
      const a = new THREE.Vector3(t1.x + t1.w / 2, t1.h * 0.7, t1.z + t1.d / 2);
      const b = new THREE.Vector3(t2.x + t2.w / 2, t2.h * 0.7, t2.z + t2.d / 2);
      const mid = a.clone().lerp(b, 0.5);
      mid.y = Math.min(a.y, b.y) * 0.8;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.04, 5), M.metal);
      chunk.group.add(tube);
      for (const t of [0.3, 0.5, 0.7]) {
        const lp = curve.getPoint(t);
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8),
          new THREE.MeshBasicMaterial({ color: rng() < 0.5 ? M.palette.trim : M.palette.sign }));
        lan.position.copy(lp).y -= 0.25;
        chunk.group.add(lan);
      }
    }

    // street lights along both roads
    for (let t = 16; t < CHUNK; t += 26) {
      this.streetlight(chunk, M, x0 + ROAD + 1.2, z0 + t, Math.PI);       // west road, arm over road
      this.streetlight(chunk, M, x0 + t, z0 + ROAD + 1.2, Math.PI / 2);   // south road
    }

    // street furniture on the sidewalk
    const fx = x0 + BLOCK0 - 1.6, fz = z0 + BLOCK0 - 1.6;
    if (rng() < 0.6) this.vending(chunk, M, fx + 6 + rng() * 30, fz, Math.PI);
    if (rng() < 0.5) this.vending(chunk, M, fx, fz + 10 + rng() * 30, Math.PI / 2);
    if (rng() < 0.6) {
      // hydrant
      const hx = fx + 16 + rng() * 40, hz = fz + 0.2;
      const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.78, 10), M.hydrant);
      hyd.position.set(hx, 0.39, hz);
      hyd.castShadow = true;
      chunk.group.add(hyd);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), M.hydrant);
      cap.position.set(hx, 0.82, hz);
      chunk.group.add(cap);
      this.collider(chunk,
        new THREE.Vector3(hx - 0.3, 0, hz - 0.3), new THREE.Vector3(hx + 0.3, 0.9, hz + 0.3));
    }
    if (rng() < 0.5) {
      // bench
      const bx = fx + 10 + rng() * 44, bz = fz + 0.4;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), M.metal);
      seat.position.set(bx, 0.5, bz);
      seat.castShadow = true;
      chunk.group.add(seat);
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.55), M.metal);
        leg.position.set(bx + s * 1.0, 0.25, bz);
        chunk.group.add(leg);
      }
      this.collider(chunk,
        new THREE.Vector3(bx - 1.25, 0, bz - 0.35), new THREE.Vector3(bx + 1.25, 0.58, bz + 0.35));
    }
    // traffic light at the corner
    {
      const tx = x0 + ROAD + 0.8, tz = z0 + ROAD + 0.8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.4, 8), M.metal);
      pole.position.set(tx, 2.7, tz);
      chunk.group.add(pole);
      const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.3), M.metal);
      headBox.position.set(tx, 5.0, tz);
      chunk.group.add(headBox);
      const lightCol = [0xff3048, 0xffb838, 0x2ee06a][Math.floor(rng() * 3)];
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
        new THREE.MeshBasicMaterial({ color: lightCol }));
      lamp.position.set(tx, 5.0 + (lightCol === 0xff3048 ? 0.28 : lightCol === 0xffb838 ? 0 : -0.28), tz + 0.16);
      chunk.group.add(lamp);
    }

    // cars on this chunk's roads
    const carN = rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0;
    for (let i = 0; i < carN; i++) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const dir = rng() < 0.5 ? 1 : -1;
      const lane = dir * 2.4;
      const group = this.makeCar(M, rng);
      chunk.group.add(group);
      const car = {
        group, axis, dir, chunk,
        speed: 8 + rng() * 8,
        t: rng() * CHUNK,
        x0, z0, lane,
      };
      chunk.cars.push(car);
      this.cars.push(car);
    }

    // palms along the sidewalks — Miami breathes
    const palmN = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < palmN; i++) {
      if (rng() < 0.5) {
        this.palm(chunk, M, x0 + BLOCK0 + 2 + rng() * (CHUNK - BLOCK0 - 6), z0 + BLOCK0 - 1.8, rng);
      } else {
        this.palm(chunk, M, x0 + BLOCK0 - 1.8, z0 + BLOCK0 + 2 + rng() * (CHUNK - BLOCK0 - 6), rng);
      }
    }

    // a lone skater waiting for a troupe (off for now: solo night)
    if (this.recruitsEnabled && rng() < 0.5) {
      const color = RECRUIT_COLORS[this.recruitCounter % RECRUIT_COLORS.length];
      const name = RECRUIT_NAMES[this.recruitCounter % RECRUIT_NAMES.length];
      this.recruitCounter++;
      let pos;
      const spots = [
        ...chunk.terraces.map(t => ({ x: t.x + t.w / 2, y: t.top, z: t.z + t.d / 2 })),
        ...chunk.skySpots,
      ];
      if (spots.length && rng() < 0.72) {
        const s = spots[Math.floor(rng() * spots.length)];
        pos = new THREE.Vector3(s.x, s.y, s.z);
      } else {
        pos = new THREE.Vector3(x0 + BLOCK0 + 6 + rng() * 40, 0, z0 + BLOCK0 + 6 + rng() * 40);
      }
      const rig = makeCharacter({ outfit: color, accent: color, dress: rng() < 0.4 });
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
    this.cars = this.cars.filter(c => c.chunk !== ch);
    this.billboards = this.billboards.filter(b => b.chunk !== ch);
    this.blinkers = this.blinkers.filter(b => b.chunk !== ch);
    for (const rec of ch.recruits) {
      this.scene.remove(rec.rig.root);
      rec.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.recruits = this.recruits.filter(r => !ch.recruits.includes(r));
    ch.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.emissiveMap) {
          m.emissiveMap.dispose();
          m.dispose();
        }
        if (m.map && m.map !== this.glowTex) m.map.dispose();
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

  tryWindow() { return null; }   // arch bonuses retired in the open city

  carHit(p) {
    for (const c of this.cars) {
      const g = c.group.position;
      if (Math.abs(p.y - g.y) > 2.2) continue;
      const dx = p.x - g.x, dz = p.z - g.z;
      const [hw, hd] = c.axis === 'z' ? [1.3, 2.6] : [2.6, 1.3];
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) return c;
    }
    return null;
  }

  setDestination(pos, night) {
    this.clearBeacon();
    const M = this.mats(night);
    const group = new THREE.Group();
    const boxes = [];
    const T = 9, H = 84;   // the venue is a supertall — the night ends in its penthouse
    const geo = new THREE.BoxGeometry(T * 2, H, T * 2);
    const tower = new THREE.Mesh(geo, M.gold);
    tower.position.set(pos.x, H / 2, pos.z);
    tower.castShadow = tower.receiveShadow = true;
    group.add(tower);
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo), M.edge);
    line.position.copy(tower.position);
    group.add(line);
    boxes.push({
      min: new THREE.Vector3(pos.x - T, 0, pos.z - T),
      max: new THREE.Vector3(pos.x + T, H, pos.z + T),
    });
    const step = new THREE.Mesh(new THREE.BoxGeometry(T * 2 + 8, 2.2, T * 2 + 8), M.gold);
    step.position.set(pos.x, 1.1, pos.z);
    step.receiveShadow = true;
    group.add(step);
    boxes.push({
      min: new THREE.Vector3(pos.x - T - 4, 0, pos.z - T - 4),
      max: new THREE.Vector3(pos.x + T + 4, 2.2, pos.z + T + 4),
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.2, 520, 16, 1, true), M.beam);
    beam.position.set(pos.x, 260, pos.z);
    group.add(beam);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(T * 1.7, 0.5, 10, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, fog: false }));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(pos.x, H + 5, pos.z);
    group.add(halo);
    // party searchlights sweeping the sky — you can see where it is from anywhere
    const lights = new THREE.Group();
    for (const s of [-1, 1]) {
      const geo = new THREE.ConeGeometry(3.4, 110, 12, 1, true);
      geo.rotateX(Math.PI);
      geo.translate(0, 55, 0);
      const beamCone = new THREE.Mesh(geo, M.beam.clone());
      beamCone.material.opacity = 0.15;
      beamCone.rotation.z = s * 0.8;
      lights.add(beamCone);
    }
    lights.position.set(pos.x, H + 1, pos.z);
    group.add(lights);
    this.scene.add(group);
    this.beacon = { pos: pos.clone(), group, boxes, halo, beam, lights, topY: H };
  }

  clearBeacon() {
    if (!this.beacon) return;
    this.beacon.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.beacon.group);
    this.beacon = null;
  }

  update(dt, t, playerP) {
    for (const r of this.rotors) {
      r.box.rot.yaw += r.box.rot.w * dt;
      r.mesh.rotation.y = r.box.rot.yaw;
    }
    if (this.beacon) {
      this.beacon.halo.rotation.z += dt * 0.4;
      this.beacon.beam.material.opacity = 0.27 + Math.sin(t * 1.7) * 0.06;
      this.beacon.lights.rotation.y += dt * 0.7;
      this.beacon.lights.children[0].rotation.z = -0.8 + Math.sin(t * 0.5) * 0.25;
      this.beacon.lights.children[1].rotation.z = 0.8 - Math.sin(t * 0.43) * 0.25;
    }
    // chase-lights pulse toward the venue
    if (playerP && this.beacon) {
      const bx = this.beacon.pos.x - playerP.x, bz = this.beacon.pos.z - playerP.z;
      const bd = Math.hypot(bx, bz) || 1;
      const ux = bx / bd, uz = bz / bd;
      for (let i = 0; i < this.partyLights.length; i++) {
        const spr = this.partyLights[i];
        const along = 16 + i * 21;
        if (along > bd - 20) { spr.material.opacity = 0; continue; }
        spr.position.set(playerP.x + ux * along, 11 + Math.sin(i * 1.7) * 1.5, playerP.z + uz * along);
        const pulse = Math.pow(Math.max(0, Math.sin(t * 3.4 - i * 0.85)), 3);
        spr.material.opacity = 0.14 + pulse * 0.5;
        spr.scale.setScalar(1.7 + pulse * 1.6);
      }
    } else {
      for (const spr of this.partyLights) spr.material.opacity = 0;
    }
    for (const rec of this.recruits) {
      const a = t * 0.9 + rec.phase;
      rec.rig.root.position.set(rec.p.x + Math.cos(a) * 2.4, rec.p.y, rec.p.z + Math.sin(a) * 2.4);
      this._m.makeBasis(
        new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
      rec.rig.root.quaternion.setFromRotationMatrix(this._m);
      rec.rig.animate(t + rec.phase, 7, 0.3);
    }
    for (const c of this.cars) {
      c.t = (c.t + c.speed * dt * c.dir + CHUNK) % CHUNK;
      if (c.axis === 'z') {
        c.group.position.set(c.x0 + ROAD / 2 + c.lane, 0, c.z0 + c.t);
        c.group.rotation.y = c.dir > 0 ? 0 : Math.PI;
      } else {
        c.group.position.set(c.x0 + c.t, 0, c.z0 + ROAD / 2 + c.lane);
        c.group.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    for (const f of this.flyers) {
      f.p.addScaledVector(f.dir, f.speed * dt);
      if (f.p.x < playerP.x - 300) f.p.x += 600;
      if (f.p.x > playerP.x + 300) f.p.x -= 600;
      if (f.p.z < playerP.z - 300) f.p.z += 600;
      if (f.p.z > playerP.z + 300) f.p.z -= 600;
      f.group.position.set(f.p.x, f.y, f.p.z);
      f.group.rotation.y = Math.atan2(f.dir.x, f.dir.z);
    }
    for (const b of this.billboards) {
      b.tex.offset.x = (t * b.speed) % 1;
      b.mesh.visible = Math.sin(t * 7 + b.phase) > -0.97;  // rare flicker
    }
    for (const b of this.blinkers) {
      b.mesh.visible = Math.sin(t * 2.2 + b.phase) > 0;
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
