// avatars.js — real skinned humans, animated safely.
// Michelle (a Mixamo-rigged dancer from the three.js examples) is every
// skater: the player plain, the troupe as tinted variants with skirts and
// size variation. Movement clips are AUTHORED at runtime against each
// skeleton's own rest pose (no cross-rig retargeting — that's what made
// limbs explode), so the skate stride is an actual skate stride: low
// stance, scissoring legs, swinging arms. Her one native clip, SambaDance,
// plays whenever she stops. Falls back to procedural rigs if loading fails.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSkater } from './skaters.js';

export const lib = { ready: false, source: null, info: {} };

export async function initAvatars() {
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('/models/Michelle.glb');
    const box = new THREE.Box3().setFromObject(gltf.scene);
    lib.source = {
      scene: gltf.scene,
      clips: gltf.animations ?? [],
      height: Math.max(0.01, box.max.y - box.min.y),
    };
    lib.info.michelle = {
      height: +lib.source.height.toFixed(2),
      clips: lib.source.clips.map(a => a.name),
    };
    lib.ready = true;
  } catch (e) {
    lib.info.michelle = { error: String(e).slice(0, 120) };
    lib.ready = false;
  }
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
    const n = o.name.toLowerCase().replace(/^mixamorig:?/, '').replace(/[_\s]/g, '');
    if (BONE_KEYS.includes(n) && !bones[n]) bones[n] = o;
  });
  return bones;
}

// ---------------------------------------------------------------- clips
const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

function quatKeys(bone, times, angles, axis = X, zAngles = null) {
  // compose each key from the bone's REST orientation — rig-safe
  const rest = bone.quaternion.clone();
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

// the skate stride: low stance, legs scissoring, arms countering
function buildSkateClip(bones) {
  const T = [0, 0.25, 0.5, 0.75, 1.0];
  const tracks = [];
  const SW = 0.55;        // stride swing
  const STANCE = -0.38;   // thighs forward = sitting into the skate
  const KNEE = 0.62;      // standing knee bend

  const wave = (phase, amp, offset = 0) =>
    T.map(t => offset + amp * Math.sin(2 * Math.PI * (t + phase)));

  if (bones.leftupleg && bones.rightupleg) {
    tracks.push(quatKeys(bones.leftupleg, T, wave(0, SW, STANCE), X,
      wave(0.25, 0.10, 0.06)));
    tracks.push(quatKeys(bones.rightupleg, T, wave(0.5, SW, STANCE), X,
      wave(0.75, 0.10, -0.06)));
  }
  if (bones.leftleg && bones.rightleg) {
    // knees: bent in stance, extending on the push
    tracks.push(quatKeys(bones.leftleg, T,
      T.map(t => KNEE + 0.35 * Math.max(0, Math.sin(2 * Math.PI * t)))));
    tracks.push(quatKeys(bones.rightleg, T,
      T.map(t => KNEE + 0.35 * Math.max(0, Math.sin(2 * Math.PI * (t + 0.5))))));
  }
  if (bones.leftfoot && bones.rightfoot) {
    tracks.push(quatKeys(bones.leftfoot, T, wave(0, 0.12, -0.30)));
    tracks.push(quatKeys(bones.rightfoot, T, wave(0.5, 0.12, -0.30)));
  }
  if (bones.leftarm && bones.rightarm) {
    // bring the arms down from the T-pose, then swing them with the stride
    tracks.push(quatKeys(bones.leftarm, T, wave(0.5, SW * 0.45), X,
      T.map(() => 1.05)));
    tracks.push(quatKeys(bones.rightarm, T, wave(0, SW * 0.45), X,
      T.map(() => -1.05)));
  }
  if (bones.leftforearm && bones.rightforearm) {
    tracks.push(quatKeys(bones.leftforearm, T, T.map(() => 0.45)));
    tracks.push(quatKeys(bones.rightforearm, T, T.map(() => 0.45)));
  }
  if (bones.spine) tracks.push(quatKeys(bones.spine, T, wave(0.25, 0.05, 0.22)));
  if (bones.spine1) tracks.push(quatKeys(bones.spine1, T, T.map(() => 0.10)));
  if (bones.hips) {
    const p0 = bones.hips.position;
    const py = T.map(t => p0.y * (0.965 + 0.02 * Math.sin(4 * Math.PI * t)));
    const px = T.map(t => p0.x + p0.y * 0.02 * Math.sin(2 * Math.PI * t));
    const vals = [];
    for (let i = 0; i < T.length; i++) vals.push(px[i], py[i], p0.z);
    tracks.push(new THREE.VectorKeyframeTrack(`${bones.hips.name}.position`, T, vals));
    tracks.push(quatKeys(bones.hips, T, wave(0.25, 0.05, 0.06)));
  }
  return new THREE.AnimationClip('SkateCycle', 1.0, tracks);
}

// ---------------------------------------------------------------- factory
const SKIRT_COLORS = null; // skirt takes the outfit tint

export function makeCharacter(opts = {}) {
  if (!lib.ready) return makeSkater(opts);
  const src = lib.source;

  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const model = SkeletonUtils.clone(src.scene);
  const jitter = opts.kind === 'michelle' ? 1 : 0.95 + Math.random() * 0.08;
  const s = (1.72 / src.height) * jitter;
  model.scale.setScalar(s);
  lean.add(model);

  const isPlayer = opts.kind === 'michelle';
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
      if (o.material) {
        o.material = o.material.clone();
        if (!isPlayer && o.material.color) o.material.color.lerp(tint, 0.30);
      }
    }
  });

  const bones = mapBones(model);
  const u = 1 / s;

  // glowing rollerskates on the foot bones
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

  // the skirts you loved — on most of the troupe, riding the hip bone
  if (!isPlayer && bones.hips && (opts.dress ?? Math.random() < 0.65)) {
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
  const skate = mixer.clipAction(buildSkateClip(bones));
  const idleClip = src.clips.find(c => /dance|idle/i.test(c.name)) ?? null;
  const idle = idleClip ? mixer.clipAction(idleClip) : null;
  skate.play();
  skate.setEffectiveWeight(0);
  if (idle) {
    idle.play();
    idle.setEffectiveWeight(1);
    idle.time = Math.random() * (idleClip.duration || 1);
  }

  let lastT = null;
  function animate(t, speed, leanIn = 0, crouch = 0) {
    const dt = lastT === null ? 0.016 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    const sp01 = THREE.MathUtils.clamp(speed / 7, 0, 1);
    skate.setEffectiveWeight(sp01);
    if (idle) idle.setEffectiveWeight(1 - sp01);
    skate.timeScale = THREE.MathUtils.clamp(0.5 + speed / 15, 0.5, 1.8);
    mixer.update(dt);
    // post-mix body language: tuck and carve
    if (bones.spine1) bones.spine1.rotation.x += crouch * 0.55;
    if (bones.spine) bones.spine.rotation.x += crouch * 0.25;
    lean.rotation.z = THREE.MathUtils.lerp(lean.rotation.z, -leanIn * 0.38, 0.15);
    lean.rotation.x = sp01 * 0.08 + crouch * 0.16;
    lean.position.y = -crouch * 0.26;
  }

  return { root, animate, kind: 'michelle' };
}
