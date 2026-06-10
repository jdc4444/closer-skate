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

  function animate(t, speed, lean) {
    const cadence = 2.2 + speed * 0.16;
    const ph = t * cadence;
    const amp = Math.min(0.62, 0.18 + speed * 0.02);
    legs[0].rotation.x = Math.sin(ph) * amp;
    legs[1].rotation.x = Math.sin(ph + Math.PI) * amp;
    legs[0].rotation.z = 0.06 + Math.max(0, Math.sin(ph)) * 0.16;
    legs[1].rotation.z = -0.06 - Math.max(0, Math.sin(ph + Math.PI)) * 0.16;
    arms[0].rotation.x = Math.sin(ph + Math.PI) * amp * 0.5;
    arms[1].rotation.x = Math.sin(ph) * amp * 0.5;
    rig.position.y = Math.abs(Math.sin(ph)) * 0.045;
    rig.rotation.x = 0.06 + speed * 0.004;       // forward lean with speed
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, -lean * 0.42, 0.15);
  }

  return { root, rig, animate };
}

// ---------------------------------------------------------------- trails
export class Trail {
  constructor(scene, color = 0xffffff, length = 56) {
    this.len = length;
    this.positions = new Float32Array(length * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const colors = new Float32Array(length * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < length; i++) {
      const f = 1 - i / (length - 1);          // head bright -> tail dark
      colors[i * 3] = c.r * f * f;
      colors[i * 3 + 1] = c.g * f * f;
      colors[i * 3 + 2] = c.b * f * f;
    }
    this.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.line.frustumCulled = false;
    scene.add(this.line);
    this.primed = false;
    this.acc = 0;
  }

  update(dt, pos) {
    if (!this.primed) {
      for (let i = 0; i < this.len; i++) pos.toArray(this.positions, i * 3);
      this.primed = true;
    }
    this.acc += dt;
    if (this.acc < 0.022) {
      pos.toArray(this.positions, 0); // keep head glued to the skate
      this.geo.attributes.position.needsUpdate = true;
      return;
    }
    this.acc = 0;
    this.positions.copyWithin(3, 0, (this.len - 1) * 3);
    pos.toArray(this.positions, 0);
    this.geo.attributes.position.needsUpdate = true;
  }

  setColor(hex) {
    const c = new THREE.Color(hex);
    const col = this.geo.attributes.color;
    for (let i = 0; i < this.len; i++) {
      const f = 1 - i / (this.len - 1);
      col.setXYZ(i, c.r * f * f, c.g * f * f, c.b * f * f);
    }
    col.needsUpdate = true;
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
