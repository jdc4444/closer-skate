// avatars.js — real rigged characters (Mixamo-rigged GLBs vendored from the
// three.js examples: Soldier, Xbot, Michelle), skinned + animated, with
// glowing skates bolted to their foot bones. Falls back to the procedural
// rigs if the models fail to load.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { makeSkater } from './skaters.js';

const FILES = {
  michelle: '/models/Michelle.glb',
  soldier: '/models/Soldier.glb',
  xbot: '/models/Xbot.glb',
};
// which way the raw model faces; corrected so +Z is forward
const FACING = { michelle: 0, soldier: Math.PI, xbot: 0 };

export const lib = { ready: false, sources: {}, info: {} };

export async function initAvatars() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(FILES).map(async ([key, url]) => {
    try {
      const gltf = await loader.loadAsync(url);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const h = Math.max(0.01, box.max.y - box.min.y);
      const clips = gltf.animations ?? [];
      lib.sources[key] = { scene: gltf.scene, clips, height: h };
      lib.info[key] = { height: +h.toFixed(2), clips: clips.map(a => a.name) };
    } catch (e) {
      lib.info[key] = { error: String(e).slice(0, 120) };
    }
  }));
  lib.kinds = Object.keys(lib.sources);
  // shared clip pool — Mixamo rigs share bone names, so clips retarget freely
  lib.allClips = lib.kinds.flatMap(k => lib.sources[k].clips);
  lib.ready = lib.kinds.some(k => lib.sources[k].clips.some(c => /run|walk/i.test(c.name)));
  return lib.info;
}

function findClip(clips, ...patterns) {
  for (const p of patterns) {
    const c = clips.find(c => p.test(c.name));
    if (c) return c;
  }
  return null;
}

let pickCounter = 0;

// Same interface as the procedural makeSkater: { root, animate(t, speed, lean, crouch) }
export function makeCharacter(opts = {}) {
  if (!lib.ready) return makeSkater(opts);
  const kind = opts.kind && lib.sources[opts.kind]
    ? opts.kind
    : lib.kinds[pickCounter++ % lib.kinds.length];
  const src = lib.sources[kind];

  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const model = SkeletonUtils.clone(src.scene);
  const s = 1.75 / src.height;
  model.scale.setScalar(s);
  model.rotation.y = FACING[kind] ?? 0;
  lean.add(model);

  const accent = opts.accent ?? opts.outfit ?? 0x35e0c8;
  const tint = new THREE.Color(opts.outfit ?? 0xffffff);
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x101016, emissive: accent, emissiveIntensity: 1.8, roughness: 0.4,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.4, metalness: 0.3 });

  let spine = null, head = null;
  const feet = [];
  model.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (o.material) {
        o.material = o.material.clone();
        if (o.material.color && opts.outfit !== undefined && kind !== 'michelle') {
          o.material.color.lerp(tint, 0.35);
        }
        if (kind === 'xbot' && o.material.color) {
          // the robot takes the troupe color on its shell
          o.material.color.lerp(tint, 0.55);
          o.material.metalness = 0.7;
          o.material.roughness = 0.35;
        }
      }
    }
    if (o.isBone) {
      const n = o.name.toLowerCase();
      if (!spine && /spine1|spine_01|spine$/.test(n)) spine = o;
      if (!head && /head$/.test(n)) head = o;
      if (/leftfoot$|left_foot|foot_l/.test(n)) feet.push(o);
      if (/rightfoot$|right_foot|foot_r/.test(n)) feet.push(o);
    }
  });

  // glowing rollerskates on the foot bones (sized in raw bone units)
  const u = 1 / s;
  for (const foot of feet) {
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
  // a small glowing marker above the head — your troupe, your colors
  if (head && opts.marker !== false) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.20 * u, 0.035 * u, 0.14 * u), glowMat);
    band.position.y = 0.14 * u;
    head.add(band);
  }

  const mixer = new THREE.AnimationMixer(model);
  // borrowed clips get trimmed to the bones this skeleton actually has
  const boneNames = new Set();
  model.traverse(o => boneNames.add(o.name));
  const fit = (clip) => {
    if (!clip) return null;
    const tracks = clip.tracks.filter(t => boneNames.has(t.name.split('.')[0]));
    return tracks.length === clip.tracks.length
      ? clip
      : new THREE.AnimationClip(clip.name, clip.duration, tracks);
  };
  const runClip = fit(findClip(src.clips, /run/i, /walk/i) ?? findClip(lib.allClips, /run/i, /walk/i));
  // Michelle's only clip is SambaDance — so she dances whenever she idles
  const idleClip = fit(findClip(src.clips, /idle/i, /dance/i, /pose/i)) ?? runClip;
  const run = mixer.clipAction(runClip);
  const idle = mixer.clipAction(idleClip);
  run.play();
  idle.play();
  run.setEffectiveWeight(0);
  idle.setEffectiveWeight(1);

  let lastT = null;
  function animate(t, speed, leanIn = 0, crouch = 0) {
    const dt = lastT === null ? 0.016 : Math.max(0, Math.min(0.1, t - lastT));
    lastT = t;
    const sp01 = THREE.MathUtils.clamp(speed / 9, 0, 1);
    run.setEffectiveWeight(sp01);
    idle.setEffectiveWeight(1 - sp01);
    run.timeScale = THREE.MathUtils.clamp(0.45 + speed / 16, 0.45, 1.7);
    mixer.update(dt);
    // post-mix body language: forward lean with speed, tuck, carve roll
    if (spine) {
      spine.rotation.x += 0.1 + sp01 * 0.22 + crouch * 0.55;
    }
    lean.rotation.z = THREE.MathUtils.lerp(lean.rotation.z, -leanIn * 0.38, 0.15);
    lean.rotation.x = sp01 * 0.10 + crouch * 0.18;
    lean.position.y = -crouch * 0.28;
  }

  return { root, animate, kind };
}
