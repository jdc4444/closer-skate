// skaters.js — procedural rollerskater rigs, ribbon trails, hand-hold links.
import * as THREE from 'three';

const SKIN_TONES = [0xf2c9a4, 0xc98e62, 0x8a5a3b, 0x6b4226, 0xe8b48e];

function lam(color) { return new THREE.MeshLambertMaterial({ color }); }

// makeSkater returns { root, rig, animate(t, speed, lean) }
// root: physics-positioned group. rig: inner group for lean/bob.
export function makeSkater({ outfit = 0xffd166, accent = 0xffffff, hair = 0x241a18,
                             skin = null, dress = true, jeans = false } = {}) {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const mSkin = lam(skin ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)]);
  const mOut = lam(outfit);
  const mHair = lam(hair);
  const mSkate = lam(0xfff6ec);
  const mWheel = lam(accent);

  // legs (origin at floor, hips at 0.95)
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.09, 0.95, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.88, 8), jeans ? lam(0x2e4a7d) : mSkin);
    thigh.position.y = -0.44;
    leg.add(thigh);
    const skate = new THREE.Group();
    skate.position.y = -0.88;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.30), mSkate);
    boot.position.set(0, 0.0, 0.04);
    skate.add(boot);
    for (const wz of [-0.07, 0.09]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), mWheel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, -0.10, wz);
      skate.add(wheel);
    }
    leg.add(skate);
    rig.add(leg);
    legs.push(leg);
  }

  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.55, 10), mOut);
  torso.position.y = 1.24;
  rig.add(torso);

  // skirt or jacket tail
  if (dress) {
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 12, 1, true),
      new THREE.MeshLambertMaterial({ color: outfit, side: THREE.DoubleSide }));
    skirt.position.y = 0.78;
    rig.add(skirt);
  }

  // arms — held in a light ballet line, swinging
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.17, 1.42, 0);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.62, 8), mSkin);
    limb.position.y = -0.31;
    arm.add(limb);
    arm.rotation.z = side * 0.5;
    rig.add(arm);
    arms.push(arm);
  }

  // head + hair
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 12), mSkin);
  head.position.y = 1.67;
  rig.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mHair);
  cap.position.y = 1.70;
  rig.add(cap);
  // little bun + ponytail
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mHair);
  bun.position.set(0, 1.82, -0.06);
  rig.add(bun);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), mHair);
  tail.position.set(0, 1.70, -0.16);
  tail.rotation.x = Math.PI * 0.82;
  rig.add(tail);

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });

  function animate(t, speed, lean, crouch = 0) {
    const cadence = 1.6 + speed * 0.16;
    const ph = t * cadence;
    const amp = Math.min(0.6, 0.03 + speed * 0.026);
    legs[0].rotation.x = Math.sin(ph) * amp;
    legs[1].rotation.x = Math.sin(ph + Math.PI) * amp;
    legs[0].rotation.z = 0.06 + Math.max(0, Math.sin(ph)) * 0.16 + crouch * 0.12;
    legs[1].rotation.z = -0.06 - Math.max(0, Math.sin(ph + Math.PI)) * 0.16 - crouch * 0.12;
    arms[0].rotation.x = Math.sin(ph + Math.PI) * amp * 0.5 + crouch * 0.5;
    arms[1].rotation.x = Math.sin(ph) * amp * 0.5 + crouch * 0.5;
    rig.position.y = Math.abs(Math.sin(ph)) * 0.045 * Math.min(1, speed / 12) - crouch * 0.36;
    rig.rotation.x = 0.05 + speed * 0.004 + crouch * 0.42;   // lean into the tuck
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, -lean * 0.42, 0.15);
  }

  return { root, rig, animate };
}

// ---------------------------------------------------------------- trails
// Ribbon of light hugging the surface behind each skater.
export class Trail {
  constructor(scene, color = 0xffffff, length = 46, width = 0.24) {
    this.len = length;
    this.width = width;
    this.samples = [];          // {p, side} newest first
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
      transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.line = this.mesh;       // kept name for disposal call-sites
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

// glowing line between two skaters — the held-hands chain
export function makeLink(scene, color = 0xfff1c9) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  line.frustumCulled = false;
  scene.add(line);
  return {
    line,
    set(a, b, opacity) {
      const p = geo.attributes.position;
      p.setXYZ(0, a.x, a.y, a.z);
      p.setXYZ(1, b.x, b.y, b.z);
      p.needsUpdate = true;
      line.material.opacity = opacity;
    },
  };
}
