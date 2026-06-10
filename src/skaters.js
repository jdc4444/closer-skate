// skaters.js — articulated skater rigs: two-segment limbs with knees and
// elbows, a real skating stance, jackets with neon piping, helmets with
// glowing visors. Plus ribbon light-trails for the troupe.
import * as THREE from 'three';

const SKIN_TONES = [0xf2c9a4, 0xc98e62, 0x8a5a3b, 0x6b4226, 0xe8b48e, 0xa06a48];

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05, ...opts });
}

export function makeSkater({
  outfit = 0xffd166, accent = null, hair = 0x241a18, skin = null,
  jeans = false, dress = false, helmet = null,
} = {}) {
  accent = accent ?? outfit;
  helmet = helmet ?? Math.random() < 0.65;
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const mSkin = std(skin ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]);
  const mOut = std(outfit, { roughness: 0.6 });
  const mPants = std(jeans ? 0x2e4a7d : 0x1c1c26, { roughness: 0.8 });
  const mHair = std(hair, { roughness: 0.9 });
  const mBoot = std(0xf2ece2, { roughness: 0.5 });
  const mDark = std(0x14141c, { roughness: 0.4, metalness: 0.3 });
  const mGlow = new THREE.MeshStandardMaterial({
    color: 0x101016, emissive: accent, emissiveIntensity: 1.6, roughness: 0.4,
  });

  // ---- legs: hip -> thigh -> (knee) shin -> skate
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.10, 0.94, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.30, 4, 8), mPants);
    thigh.position.y = -0.21;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), mPants);
    shin.position.y = -0.19;
    knee.add(shin);
    const skate = new THREE.Group();
    skate.position.y = -0.40;
    knee.add(skate);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.15, 0.30), mBoot);
    boot.position.set(0, 0.02, 0.045);
    skate.add(boot);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.26), mDark);
    chassis.position.set(0, -0.07, 0.04);
    skate.add(chassis);
    for (const wz of [-0.06, 0.14]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 12), mGlow);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, -0.115, wz);
      skate.add(wheel);
    }
    rig.add(hip);
    legs.push({ hip, knee, skate });
  }

  // ---- pelvis + chest + jacket
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.06, 4, 10), mPants);
  pelvis.position.y = 1.0;
  rig.add(pelvis);
  const chest = new THREE.Group();
  chest.position.y = 1.12;
  rig.add(chest);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.24, 4, 12), mOut);
  torso.position.y = 0.16;
  chest.add(torso);
  // jacket shell + neon piping down the spine
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.165, 0.22, 4, 12), mOut);
  jacket.position.y = 0.17;
  jacket.scale.z = 1.08;
  chest.add(jacket);
  const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.012), mGlow);
  pipe.position.set(0, 0.16, -0.185);
  chest.add(pipe);
  if (dress) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.42, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: outfit, roughness: 0.7, side: THREE.DoubleSide }));
    skirt.position.y = -0.08;
    chest.add(skirt);
  }

  // ---- arms: shoulder -> upper -> (elbow) forearm
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.215, 0.30, 0);
    chest.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.20, 4, 8), mOut);
    upper.position.y = -0.14;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.28;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.18, 4, 8), mSkin);
    fore.position.y = -0.12;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), mSkin);
    hand.position.y = -0.25;
    elbow.add(hand);
    shoulder.rotation.z = side * 0.22;
    elbow.rotation.x = -0.55;
    arms.push({ shoulder, elbow, side });
  }

  // ---- head: neck, face, helmet + visor (or hair)
  const headG = new THREE.Group();
  headG.position.y = 0.46;
  chest.add(headG);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), mSkin);
  neck.position.y = 0.0;
  headG.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 14), mSkin);
  head.position.y = 0.15;
  head.scale.set(0.92, 1.05, 0.98);
  headG.add(head);
  if (helmet) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.142, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mDark);
    shell.position.y = 0.17;
    headG.add(shell);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.06), mGlow);
    visor.position.set(0, 0.16, 0.10);
    headG.add(visor);
  } else {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), mHair);
    cap.position.y = 0.17;
    headG.add(cap);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mHair);
    bun.position.set(0, 0.27, -0.05);
    headG.add(bun);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 8), mHair);
    tail.position.set(0, 0.15, -0.15);
    tail.rotation.x = Math.PI * 0.82;
    headG.add(tail);
  }

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- animation: real skate strides, knees that bend, idle weight shifts
  function animate(t, speed, lean, crouch = 0) {
    const sp01 = THREE.MathUtils.clamp(speed / 26, 0, 1);
    const cadence = 1.4 + speed * 0.14;
    const ph = t * cadence;
    const stride = Math.min(0.55, 0.04 + speed * 0.022);
    const stance = 0.34 + crouch * 0.55;          // bent-knee skate stance
    const kneeBase = -(0.55 + crouch * 0.85);

    for (let i = 0; i < 2; i++) {
      const L = legs[i];
      const s = Math.sin(ph + i * Math.PI);
      const push = Math.max(0, -s);
      L.hip.rotation.x = -stance + s * stride;
      L.hip.rotation.z = (i ? -1 : 1) * (0.05 + push * (0.10 + sp01 * 0.18));
      L.knee.rotation.x = kneeBase + Math.max(0, s) * stride * 0.9 + push * stride * 0.4;
      // keep the skate parallel to the ground
      L.skate.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x);
      L.skate.rotation.z = -L.hip.rotation.z * 0.7;
    }
    for (const A of arms) {
      const s = Math.sin(ph + (A.side > 0 ? 0 : Math.PI));
      A.shoulder.rotation.x = s * stride * 0.6 - crouch * 0.3;
      A.shoulder.rotation.z = A.side * (0.22 + sp01 * 0.1);
      A.elbow.rotation.x = -0.55 - Math.max(0, s) * 0.25;
    }
    // body: bob with stride, breathe at rest, lean into turns and the tuck
    const breathe = Math.sin(t * 1.7) * 0.012;
    rig.position.y = Math.abs(Math.sin(ph)) * 0.05 * sp01 + breathe - crouch * 0.30
      - stance * 0.12;
    chest.rotation.x = 0.10 + sp01 * 0.16 + crouch * 0.45;
    chest.rotation.z = Math.sin(ph) * 0.05 * sp01;
    headG.rotation.x = -(chest.rotation.x) * 0.75;   // eyes up, looking ahead
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, -lean * 0.40, 0.15);
    rig.rotation.x = 0.02 + sp01 * 0.05;
  }

  return { root, rig, animate };
}

// ---------------------------------------------------------------- trails
export class Trail {
  constructor(scene, color = 0xffffff, length = 46, width = 0.24) {
    this.len = length;
    this.width = width;
    this.samples = [];
    this.positions = new Float32Array(length * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const colors = new Float32Array(length * 2 * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < length; i++) {
      const f = Math.pow(1 - i / (length - 1), 1.6);
      for (let k = 0; k < 2; k++) {
        colors[(i * 2 + k) * 3] = c.r * f;
        colors[(i * 2 + k) * 3 + 1] = c.g * f;
        colors[(i * 2 + k) * 3 + 2] = c.b * f;
      }
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const index = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, d = i * 2 + 2, e = i * 2 + 3;
      index.push(a, b, d, b, e, d);
    }
    this.geo.setIndex(index);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.line = this.mesh;
    this.primed = false;
    this.acc = 0;
    this._side = new THREE.Vector3();
  }

  update(dt, pos, up, dir) {
    this._side.crossVectors(up, dir);
    if (this._side.lengthSq() < 1e-6) this._side.set(1, 0, 0);
    this._side.normalize();
    if (!this.primed) {
      this.samples.length = 0;
      for (let i = 0; i < this.len; i++) this.samples.push({ p: pos.clone(), side: this._side.clone() });
      this.primed = true;
    }
    this.acc += dt;
    if (this.acc >= 0.024) {
      this.acc = 0;
      const tail = this.samples.pop();
      tail.p.copy(pos);
      tail.side.copy(this._side);
      this.samples.unshift(tail);
    } else {
      this.samples[0].p.copy(pos);
      this.samples[0].side.copy(this._side);
    }
    for (let i = 0; i < this.len; i++) {
      const sm = this.samples[i];
      const w = this.width * (1 - i / (this.len - 1) * 0.85);
      const o = i * 6;
      this.positions[o] = sm.p.x + sm.side.x * w;
      this.positions[o + 1] = sm.p.y + sm.side.y * w;
      this.positions[o + 2] = sm.p.z + sm.side.z * w;
      this.positions[o + 3] = sm.p.x - sm.side.x * w;
      this.positions[o + 4] = sm.p.y - sm.side.y * w;
      this.positions[o + 5] = sm.p.z - sm.side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
