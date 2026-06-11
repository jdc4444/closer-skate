// avatars.js — one hero character for everyone: a Mixamo FBX (Ch29),
// cloned for the player, troupe and recruits (troupe gets color tints,
// skirts and size variation). All movement clips are AUTHORED at runtime
// against the skeleton's own rest pose — a real skate stride and a
// breathing idle — so limbs can never explode and he never T-poses.
// Falls back to procedural rigs if loading fails.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSkater } from './skaters.js';

export const lib = { ready: false, source: null, info: {} };

export async function initAvatars(onProgress) {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync(
      `${import.meta.env.BASE_URL}models/hero.glb`,
      (ev) => {
        if (onProgress && ev.total > 0) onProgress(ev.loaded / ev.total);
      });
    const group = gltf.scene;
    const box = new THREE.Box3().setFromObject(group);
    const mats = new Set();
    group.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) mats.add(`${m.type}${m.map ? '+map' : ''}`);
      }
    });
    lib.source = {
      scene: group,
      animations: gltf.animations ?? [],
      height: Math.max(0.01, box.max.y - box.min.y),
    };
    lib.info.hero = {
      height: +lib.source.height.toFixed(2),
      clips: (gltf.animations ?? []).map(a => `${a.name}:${a.duration.toFixed(1)}s`),
      materials: [...mats],
    };
    lib.ready = true;
  } catch (e) {
    lib.info.hero = { error: String(e).slice(0, 140) };
    lib.ready = false;
  }
  if (onProgress) onProgress(1);
  return lib.info;
}

// ---------------------------------------------------------------- bones
const BONE_KEYS = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftupleg', 'leftleg', 'leftfoot', 'rightupleg', 'rightleg', 'rightfoot',
  'leftarm', 'leftforearm', 'rightarm', 'rightforearm',
  'leftshoulder', 'rightshoulder',
];

function mapBones(model) {
  const bones = {};
  model.traverse(o => {
    if (!o.isBone) return;
    const n = o.name.toLowerCase().replace(/^mixamorig\d*:?/, '').replace(/[_\s]/g, '');
    if (BONE_KEYS.includes(n) && !bones[n]) bones[n] = o;
  });
  return bones;
}

// ---------------------------------------------------------------- clips
const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function quatKeys(bone, times, angles, axis = X, zAngles = null, base = null) {
  // compose each key from the bone's REST orientation — rig-safe
  const rest = (base ?? bone.quaternion).clone();
  const values = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < times.length; i++) {
    _qx.setFromAxisAngle(axis, angles[i]);
    q.copy(rest).multiply(_qx);
    if (zAngles) {
      _qz.setFromAxisAngle(Z, zAngles[i]);
      q.multiply(_qz);
    }
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values);
}

// measure where each arm actually points at rest, and compute the local
// rotation that aims it at a desired body-space direction — no guessed
// offsets, any rig. Default target hangs the arms at the sides.
function armBases(bones, model, dirFor = null) {
  model.updateMatrixWorld(true);
  const out = {};
  for (const side of ['left', 'right']) {
    const arm = bones[side + 'arm'], fore = bones[side + 'forearm'];
    if (!arm || !fore) continue;
    const aw = arm.getWorldPosition(new THREE.Vector3());
    const fw = fore.getWorldPosition(new THREE.Vector3());
    const cur = fw.sub(aw).normalize();
    const desired = (dirFor
      ? dirFor(side)
      : new THREE.Vector3(side === 'left' ? 0.24 : -0.24, -0.95, 0.10)).normalize();
    const R = new THREE.Quaternion().setFromUnitVectors(cur, desired);
    const wq = arm.getWorldQuaternion(new THREE.Quaternion());
    const localDelta = wq.clone().invert().multiply(R).multiply(wq);
    out[side] = arm.quaternion.clone().multiply(localDelta);
  }
  return out;
}

// the skate stride: low stance, legs scissoring, arms countering.
// opts shape the stride — the fast variant digs deeper and swings harder
function buildSkateClip(bones, bases = {}, opts = {}) {
  const { sw = 0.55, stance = -0.38, knee = 0.62, bob = 0.02,
    spineF = 0.22, name = 'SkateCycle' } = opts;
  const T = [0, 0.25, 0.5, 0.75, 1.0];
  const tracks = [];

  const wave = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin(2 * Math.PI * (t + phase)));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, wave(0, sw, stance), X,
      wave(0.25, 0.10, 0.06)));
    tracks.push(quatKeys(bones.rightupleg, T, wave(0.5, sw, stance), X,
      wave(0.75, 0.10, -0.06)));
  }
  if (bones.leftleg && bones.rightleg) {
    tracks.push(quatKeys(bones.leftleg, T,
      T.map(t => knee + 0.35 * Math.max(0, Math.sin(2 * Math.PI * t)))));
    tracks.push(quatKeys(bones.rightleg, T,
      T.map(t => knee + 0.35 * Math.max(0, Math.sin(2 * Math.PI * (t + 0.5))))));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, wave(0, 0.12, -0.30)));
    tracks.push(quatKeys(bones.rightfoot, T, wave(0.5, 0.12, -0.30)));
  }
  if (bones.leftarm && bones.rightarm) {
    // arms hang from their measured rest, swinging with the stride
    tracks.push(quatKeys(bones.leftarm, T, wave(0.5, sw * 0.4), X, null, bases.left));
    tracks.push(quatKeys(bones.rightarm, T, wave(0, sw * 0.4), X, null, bases.right));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.3)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.3)));
  }
  if (bones.neck) tracks.push(quatKeys(bones.neck, T, wave(0.25, 0.025), Y));
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, wave(0.25, 0.05, spineF)));
  if (bones.spine1) tracks.push(quatKeys(bones.spine1, T, T.map(() => 0.10)));
  if (bones.hips) {
    const p0 = bones.hips.position;
    const py = T.map(t => p0.y * (0.985 - bob + bob * Math.sin(4 * Math.PI * t)));
    const px = T.map(t => p0.x + p0.y * 0.02 * Math.sin(2 * Math.PI * t));
    const vals = [];
    for (let i = 0; i < T.length; i++) vals.push(px[i], py[i], p0.z);
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, T, vals));
    tracks.push(quatKeys(bones.hips, T, wave(0.25, 0.05, 0.06)));
  }
  return new THREE.AnimationClip(name, 1.0, tracks);
}

// rolling without pushing: legs settled into an easy stagger, arms loose
function buildCoastClip(bones, bases = {}) {
  const T = [0, 0.6, 1.2, 1.8, 2.4];
  const tracks = [];
  const sway = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin(2 * Math.PI * (t / 2.4) + phase));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, sway(0, 0.035, -0.32), X, sway(0, 0.02, 0.05)));
    tracks.push(quatKeys(bones.rightupleg, T, sway(Math.PI, 0.035, -0.10), X, sway(0, 0.02, -0.05)));
  }
  if (bones.leftleg && bones.rightleg) {
    tracks.push(quatKeys(bones.leftleg, T, sway(0, 0.03, 0.44)));
    tracks.push(quatKeys(bones.rightleg, T, sway(Math.PI, 0.03, 0.26)));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, sway(0, 0.02, -0.22)));
    tracks.push(quatKeys(bones.rightfoot, T, sway(Math.PI, 0.02, -0.16)));
  }
  if (bones.leftarm && bones.rightarm) {
    tracks.push(quatKeys(bones.leftarm, T, sway(0, 0.05, 0.08), X, null, bases.left));
    tracks.push(quatKeys(bones.rightarm, T, sway(Math.PI, 0.05, 0.08), X, null, bases.right));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.22)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.22)));
  }
  if (bones.neck) tracks.push(quatKeys(bones.neck, T, sway(0.3, 0.05), Y));
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, sway(0.5, 0.03, 0.16)));
  if (bones.spine1) tracks.push(quatKeys(bones.spine1, T, T.map(() => 0.06)));
  if (bones.hips) {
    const p0 = bones.hips.position;
    const vals = [];
    for (let i = 0; i < T.length; i++) {
      vals.push(p0.x + p0.y * 0.012 * Math.sin(2 * Math.PI * (T[i] / 2.4)),
        p0.y * (0.975 + 0.01 * Math.sin(2 * Math.PI * (T[i] / 1.2))), p0.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, T, vals));
    tracks.push(quatKeys(bones.hips, T, sway(0, 0.02, 0.04)));
  }
  return new THREE.AnimationClip('Coast', 2.4, tracks);
}

// airborne: knees drawn up asymmetrically, arms out like wings, toes pointed
function buildAirClip(bones, wings = {}) {
  const T = [0, 0.8, 1.6];
  const tracks = [];
  const breathe = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin(2 * Math.PI * (t / 1.6) + phase));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, breathe(0, 0.04, -0.58), X, breathe(0, 0.02, 0.07)));
    tracks.push(quatKeys(bones.rightupleg, T, breathe(Math.PI, 0.04, -0.28), X, breathe(0, 0.02, -0.07)));
  }
  if (bones.leftleg && bones.rightleg) {
    tracks.push(quatKeys(bones.leftleg, T, breathe(0, 0.03, 0.58)));
    tracks.push(quatKeys(bones.rightleg, T, breathe(Math.PI, 0.03, 0.34)));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, T.map(() => -0.52)));
    tracks.push(quatKeys(bones.rightfoot, T, T.map(() => -0.46)));
  }
  if (bones.leftarm && bones.rightarm) {
    // wings out, gently riding the air
    tracks.push(quatKeys(bones.leftarm, T, breathe(0, 0.07), X, null, wings.left));
    tracks.push(quatKeys(bones.rightarm, T, breathe(Math.PI, 0.07), X, null, wings.right));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.12)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.12)));
  }
  if (bones.neck) tracks.push(quatKeys(bones.neck, T, breathe(0.5, 0.04), Y));
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, breathe(0, 0.02, -0.05)));
  if (bones.spine1) tracks.push(quatKeys(bones.spine1, T, T.map(() => 0.03)));
  if (bones.hips) tracks.push(quatKeys(bones.hips, T, breathe(0.4, 0.02, 0.10)));
  return new THREE.AnimationClip('AirPose', 1.6, tracks);
}

// braking: a T-stop — leading leg braced, trailing foot turned out, arms low
function buildBrakeClip(bones, brace = {}) {
  const T = [0, 0.5, 1.0];
  const tracks = [];
  const tremble = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin(2 * Math.PI * t + phase));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, tremble(0, 0.015, -0.48), X, tremble(0, 0.01, 0.05)));
    tracks.push(quatKeys(bones.rightupleg, T, tremble(1, 0.015, -0.06), X, tremble(0, 0.01, -0.20)));
  }
  if (bones.leftleg && bones.rightleg) {
    tracks.push(quatKeys(bones.leftleg, T, tremble(0, 0.012, 0.52)));
    tracks.push(quatKeys(bones.rightleg, T, tremble(1, 0.012, 0.20)));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, T.map(() => -0.26)));
    tracks.push(quatKeys(bones.rightfoot, T, T.map(() => -0.06), X, T.map(() => 0.22)));
  }
  if (bones.leftarm && bones.rightarm) {
    tracks.push(quatKeys(bones.leftarm, T, tremble(0, 0.02, 0.05), X, null, brace.left));
    tracks.push(quatKeys(bones.rightarm, T, tremble(1, 0.02, 0.05), X, null, brace.right));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.30)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.30)));
  }
  if (bones.neck) tracks.push(quatKeys(bones.neck, T, T.map(() => 0), Y));
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, tremble(0, 0.015, -0.07)));
  if (bones.hips) {
    const p0 = bones.hips.position;
    const vals = [];
    for (let i = 0; i < T.length; i++) vals.push(p0.x, p0.y * 0.955, p0.z);
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, T, vals));
    tracks.push(quatKeys(bones.hips, T, tremble(0.5, 0.012, 0.08)));
  }
  return new THREE.AnimationClip('BrakePose', 1.0, tracks);
}

// at rest: easy knees, arms at the sides, breathing, a slow weight shift
function buildIdleClip(bones, bases = {}) {
  const T = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  const tracks = [];
  const sway = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin((2 * Math.PI * (t / 3) + phase)));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, sway(0, 0.02, -0.14), X, sway(0, 0.02, 0.05)));
    tracks.push(quatKeys(bones.rightupleg, T, sway(Math.PI, 0.02, -0.14), X, sway(0, 0.02, -0.05)));
  }
  if (bones.leftleg && bones.rightleg) {
    tracks.push(quatKeys(bones.leftleg, T, sway(0, 0.02, 0.26)));
    tracks.push(quatKeys(bones.rightleg, T, sway(Math.PI, 0.02, 0.26)));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, T.map(() => -0.12)));
    tracks.push(quatKeys(bones.rightfoot, T, T.map(() => -0.12)));
  }
  if (bones.leftarm && bones.rightarm) {
    tracks.push(quatKeys(bones.leftarm, T, sway(0, 0.018, 0.02), X, null, bases.left));
    tracks.push(quatKeys(bones.rightarm, T, sway(Math.PI, 0.018, 0.02), X, null, bases.right));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.18)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.18)));
  }
  if (bones.neck) tracks.push(quatKeys(bones.neck, T, sway(0.7, 0.12), Y));
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, sway(0, 0.025, 0.05)));
  if (bones.hips) {
    const p0 = bones.hips.position;
    const vals = [];
    for (let i = 0; i < T.length; i++) {
      vals.push(p0.x + p0.y * 0.008 * Math.sin(2 * Math.PI * (T[i] / 3)),
        p0.y * (0.985 + 0.008 * Math.sin(2 * Math.PI * (T[i] / 1.5))), p0.z);
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, T, vals));
  }
  return new THREE.AnimationClip('IdleSway', 3.0, tracks);
}

// ---------------------------------------------------------------- factory
// Same interface as the procedural makeSkater: { root, animate(t, speed, lean, crouch) }
export function makeCharacter(opts = {}) {
  if (!lib.ready) return makeSkater(opts);
  const src = lib.source;

  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const model = SkeletonUtils.clone(src.scene);
  const isPlayer = opts.kind === 'michelle' || opts.player === true;
  const jitter = isPlayer ? 1 : 0.95 + Math.random() * 0.08;
  const s = (1.74 / src.height) * jitter;
  model.scale.setScalar(s);
  lean.add(model);

  const accent = opts.accent ?? opts.outfit ?? 0x35e0c8;
  const tint = new THREE.Color(opts.outfit ?? 0xffffff);
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x101016, emissive: accent, emissiveIntensity: 1.8, roughness: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.4, metalness: 0.3 });

  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = ms.map(m => {
        const c = m.clone();
        // Mixamo FBX materials often ship with transparency flags on — force opaque
        c.transparent = false;
        c.opacity = 1;
        c.depthWrite = true;
        c.alphaMap = null;
        c.alphaTest = 0;
        if (!isPlayer && c.color) c.color.lerp(tint, 0.25);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    }
  });

  const bones = mapBones(model);
  const u = 1 / s;

  // glowing rollerskates on the foot bones (sized in raw bone units)
  for (const key of ['leftfoot', 'rightfoot']) {
    const foot = bones[key];
    if (!foot) continue;
    const g = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.07 * u, 0.05 * u, 0.26 * u), darkMat);
    chassis.position.set(0, -0.075 * u, 0.07 * u);
    g.add(chassis);
    for (const wz of [-0.03, 0.17]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * u, 0.05 * u, 0.085 * u, 10), glowMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, -0.12 * u, wz * u);
      g.add(wheel);
    }
    foot.add(g);
  }

  // skirts on most of the troupe, riding the hip bone
  if (!isPlayer && bones.hips && (opts.dress ?? Math.random() < 0.6)) {
    const skirt = new THREE.Mesh(
      new THREE.ConeGeometry(0.30 * u, 0.40 * u, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(new THREE.Color(0xffffff), 0.15),
        roughness: 0.7, side: THREE.DoubleSide,
      }));
    skirt.position.y = -0.12 * u;
    skirt.castShadow = true;
    bones.hips.add(skirt);
  }

  const mixer = new THREE.AnimationMixer(model);
  const bases = armBases(bones, model);
  const wings = armBases(bones, model, side =>
    new THREE.Vector3(side === 'left' ? 0.92 : -0.92, -0.18, 0.06));
  const brace = armBases(bones, model, side =>
    new THREE.Vector3(side === 'left' ? 0.46 : -0.46, -0.80, 0.34));
  // if the model shipped with a baked clip, that's the idle
  const native = (src.animations ?? []).find(c => c.duration > 0.5);
  const actions = {
    idle:  mixer.clipAction(native ?? buildIdleClip(bones, bases)),
    skate: mixer.clipAction(buildSkateClip(bones, bases)),
    fast:  mixer.clipAction(buildSkateClip(bones, bases,
      { sw: 0.9, stance: -0.54, knee: 0.8, bob: 0.04, spineF: 0.36, name: 'SkateFast' })),
    coast: mixer.clipAction(buildCoastClip(bones, bases)),
    air:   mixer.clipAction(buildAirClip(bones, wings)),
    brake: mixer.clipAction(buildBrakeClip(bones, brace)),
  };
  for (const k in actions) {
    actions[k].play();
    actions[k].setEffectiveWeight(k === 'idle' ? 1 : 0);
  }
  actions.idle.time = Math.random() * actions.idle.getClip().duration;

  // eased weights per action — raw state flips thrash at the thresholds
  const w = { idle: 1, skate: 0, fast: 0, coast: 0, air: 0, brake: 0 };
  const tgt = { idle: 0, skate: 0, fast: 0, coast: 0, air: 0, brake: 0 };
  const knee = { x: 0, v: 0 };        // landing-suspension spring
  const corner = { t: 9, asym: 0 };   // wrap/climb transition pulse
  let steerS = 0, headPitch = 0, accelS = 0, lastSpeed = 0;
  let lastT = null;

  // cosine-eased segment: value glides va -> vb as ph crosses [a, b]
  function seg(ph, a, b, va, vb) {
    if (ph <= a) return va;
    if (ph >= b) return vb;
    return va + (vb - va) * (0.5 - 0.5 * Math.cos(Math.PI * (ph - a) / (b - a)));
  }

  function animate(t, speed, leanIn = 0, crouch = 0, state = null) {
    const dt = lastT === null ? 0.016 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    const grounded = state ? state.grounded !== false : true;
    const pushing = state ? !!state.pushing : speed > 3;
    const braking = state ? !!state.braking : false;
    const move = THREE.MathUtils.clamp((speed - 2.5) / 5, 0, 1);
    const sf = THREE.MathUtils.clamp((speed - 13) / 13, 0, 1);
    tgt.idle = 0; tgt.skate = 0; tgt.fast = 0; tgt.coast = 0; tgt.air = 0; tgt.brake = 0;
    if (!grounded) tgt.air = 1;
    else if (braking && speed > 3) { tgt.brake = move; tgt.idle = 1 - move; }
    else if (pushing) { tgt.skate = move * (1 - sf); tgt.fast = move * sf; tgt.idle = 1 - move; }
    else              { tgt.coast = move; tgt.idle = 1 - move; }
    let sum = 0;
    for (const k in w) { w[k] += (tgt[k] - w[k]) * Math.min(1, dt * 6); sum += w[k]; }
    for (const k in w) actions[k].setEffectiveWeight(w[k] / sum);
    const ts = THREE.MathUtils.clamp(0.5 + speed / 15, 0.5, 1.9);
    actions.skate.timeScale = ts;
    actions.fast.timeScale = ts * 1.12;
    mixer.update(dt);

    // ---- post-mix body language. Every bone touched below is written by
    // the mixer each frame (all are clip-bound), so offsets cannot accumulate.
    // suspension: landings and corner hops compress the knees, then release
    knee.v += (-92 * knee.x - 15 * knee.v) * dt;
    knee.x = THREE.MathUtils.clamp(knee.x + knee.v * dt, -0.22, 1.15);

    // the corner pulse: crouch into it, extend through the hop, absorb out
    let kneeC = 0, hop = 0, flare = 0;
    if (corner.t < 1) {
      corner.t = Math.min(1, corner.t + dt / 0.62);
      const ph = corner.t;
      kneeC = ph < 0.18 ? seg(ph, 0, 0.18, 0, 0.52)
            : ph < 0.45 ? seg(ph, 0.18, 0.45, 0.52, -0.14)
            : ph < 0.72 ? seg(ph, 0.45, 0.72, -0.14, 0.46)
            :             seg(ph, 0.72, 1, 0.46, 0);
      hop = Math.sin(Math.PI * THREE.MathUtils.clamp((ph - 0.16) / 0.6, 0, 1)) * 0.30;
      flare = Math.sin(Math.PI * ph) * 0.5;
    }
    const kneeL = Math.max(-0.2, knee.x + kneeC * (1 - 0.35 * corner.asym));
    const kneeR = Math.max(-0.2, knee.x + kneeC * (1 + 0.35 * corner.asym));
    if (bones.leftleg) bones.leftleg.rotation.x += kneeL;
    if (bones.rightleg) bones.rightleg.rotation.x += kneeR;
    if (bones.leftupleg) bones.leftupleg.rotation.x -= kneeL * 0.45;
    if (bones.rightupleg) bones.rightupleg.rotation.x -= kneeR * 0.45;

    // smoothed carve: head and shoulders turn into the turn, arms bank
    steerS += (THREE.MathUtils.clamp(-leanIn, -1, 1) - steerS) * Math.min(1, dt * 6);
    const wantPitch = !grounded ? (crouch > 0.4 ? 0.34 : -0.16) : crouch * 0.18;
    headPitch += (wantPitch - headPitch) * Math.min(1, dt * 5);
    if (bones.neck) {
      bones.neck.rotation.y += steerS * 0.34;
      bones.neck.rotation.x += headPitch;
    }
    if (bones.spine) bones.spine.rotation.y += steerS * 0.15;
    const bank = steerS * 0.22;
    if (bones.leftarm) bones.leftarm.rotation.z += flare * 0.5 + bank;
    if (bones.rightarm) bones.rightarm.rotation.z += flare * 0.5 - bank;

    // momentum: accelerating presses forward, hard slowing sits back
    accelS += ((speed - lastSpeed) / Math.max(dt, 1e-4) - accelS) * Math.min(1, dt * 3);
    lastSpeed = speed;
    const press = THREE.MathUtils.clamp(accelS, -9, 9) * 0.014;

    if (bones.spine1) bones.spine1.rotation.x += crouch * 0.55;
    if (bones.spine) bones.spine.rotation.x += crouch * 0.25;
    lean.rotation.z = THREE.MathUtils.lerp(lean.rotation.z, -leanIn * 0.38, 0.15);
    lean.rotation.x = w.skate * 0.08 + w.fast * 0.15 + crouch * 0.16 - w.air * 0.06 + press;
    lean.position.y = -crouch * 0.26 - knee.x * 0.2 - Math.max(0, kneeC) * 0.18 + hop;
  }

  const _wa = new THREE.Vector3(), _wf = new THREE.Vector3();
  return {
    root, animate, kind: 'hero',
    // a wrap/climb just happened: pulse the transition (asym biases which knee)
    corner(asym = 0) {
      corner.t = 0;
      corner.asym = THREE.MathUtils.clamp(asym, -1, 1);
      knee.v += 3.2;
    },
    // landing impact (0..~1.3) — feeds the knee suspension
    land(amt = 0.5) { knee.v += amt * 8.5; },
    armDir: () => {
      if (!bones.leftarm || !bones.leftforearm) return null;
      bones.leftarm.getWorldPosition(_wa);
      bones.leftforearm.getWorldPosition(_wf);
      _wf.sub(_wa).normalize();
      return { x: +_wf.x.toFixed(2), y: +_wf.y.toFixed(2), z: +_wf.z.toFixed(2) };
    },
    _dbg: {
      bones: Object.keys(bones),
      idle: actions.idle.getClip().name,
      skateTracks: actions.skate.getClip().tracks.length,
      weights: () => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, +v.toFixed(2)])),
      knee: () => +knee.x.toFixed(2),
      neckY: () => bones.neck ? +bones.neck.rotation.y.toFixed(2) : null,
      cornerT: () => +corner.t.toFixed(2),
      baseL: bases.left ? bases.left.toArray().map(v => +v.toFixed(3)) : null,
    },
  };
}
