// CLOSER — an infinite disco, on rollerskates.
// v3: open city. Skate freely — push, glide, brake, pivot, tuck low.
// Gravity is whatever surface you're on: ride facades, rooftops, the
// undersides of slabs, and the spinning platforms between towers.
// Lone skaters join as you pass; the troupe is yours. Each night has a
// destination — follow the light, the decades turn when you arrive.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { nightLabel, venueName, blendedAtmosphere, eraPalette } from './palettes.js';
import { City, CHUNK } from './city.js';
import { Sky } from './sky.js';
import * as SURF from './surface.js';
import { Trail } from './skaters.js';
import { initAvatars, makeCharacter, lib as avatarLib } from './avatars.js';
import { DiscoAudio } from './audio.js';

// real rigged characters; falls back to procedural rigs if missing
window.__avatarInfo = await initAvatars();

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x551b38, 26, 310);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const ambient = new THREE.AmbientLight(0x6a5070, 0.72);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0x9a86c8, 0.9);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -90;
dirLight.shadow.camera.right = 90;
dirLight.shadow.camera.top = 90;
dirLight.shadow.camera.bottom = -90;
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 320;
dirLight.shadow.bias = -0.0004;
scene.add(dirLight);
scene.add(dirLight.target);
const LIGHT_OFF = new THREE.Vector3(34, 80, -28);
// soft opposing fill so facades never go flat when the key light grazes them
const fillLight = new THREE.DirectionalLight(0xffb8d8, 0.4);
scene.add(fillLight);
scene.add(fillLight.target);
const FILL_OFF = new THREE.Vector3(-46, 18, 52);

// environment reflections for the glass city, one per night mood
const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = new Map();
function envFor(night) {
  const key = ((night % 5) + 5) % 5;
  if (envCache.has(key)) return envCache.get(key);
  const p = eraPalette(key);
  const s = new THREE.Scene();
  s.background = new THREE.Color(p.skyBelow);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 12),
    new THREE.MeshBasicMaterial({ color: p.horizon, side: THREE.BackSide }));
  s.add(dome);
  const cols = [p.trim, p.neon2, p.sign, 0xfff2e0];
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 16),
      new THREE.MeshBasicMaterial({ color: cols[i % 4] }));
    const a = (i / 10) * Math.PI * 2;
    m.position.set(Math.cos(a) * 24, (i % 3) * 9 - 6, Math.sin(a) * 24);
    m.lookAt(0, 0, 0);
    s.add(m);
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(45, 16),
    new THREE.MeshBasicMaterial({ color: p.street }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -10;
  s.add(floor);
  const tex = pmrem.fromScene(s, 0.04).texture;
  envCache.set(key, tex);
  return tex;
}
scene.environment = envFor(0);

// the wet street: a true mirror plane gliding under the city
const mirror = new Reflector(new THREE.PlaneGeometry(320, 320), {
  clipBias: 0.003,
  textureWidth: 512,
  textureHeight: 512,
  color: 0x3a4150,
});
mirror.rotation.x = -Math.PI / 2;
mirror.position.y = 0.02;
scene.add(mirror);

const city = new City(scene);
const sky = new Sky(scene);
const audio = new DiscoAudio();

// film grain tile
(() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();

const el = {
  title: document.getElementById('title'),
  hud: document.getElementById('hud'),
  era: document.getElementById('era'),
  flow: document.getElementById('flow'),
  pack: document.getElementById('pack'),
  speed: document.getElementById('speed'),
  help: document.getElementById('help'),
  meterLabel: document.getElementById('meterLabel'),
  meterFill: document.getElementById('meterFill'),
  toast: document.getElementById('toast'),
};

// ---------------------------------------------------------------- state
const player = {
  p: new THREE.Vector3(CHUNK / 2, 0, CHUNK / 2),
  n: new THREE.Vector3(0, 1, 0),
  f: new THREE.Vector3(0, 0, 1),
  box: null,
  prevP: new THREE.Vector3(),
  v: 0,
  vel: new THREE.Vector3(),
  gravN: new THREE.Vector3(0, 1, 0),
  grounded: true,
  airT: 0,
  tuck: 0,
  stumbleT: 0, invulnT: 0, boostPulse: 0,
  rig: makeCharacter({ kind: 'michelle', outfit: 0xffc23d, accent: 0xff8a3d, marker: false,
    hair: 0xff4660, skin: 0xeab38a, jeans: true }),
};
scene.add(player.rig.root);

let members = [];        // your roller troupe
let flow = 0;
let night = 0;
let nightF = 0;          // smoothed night for the sky crossfade
let playing = false;
let muted = false;
let shake = 0;
let elapsed = 0;
let dest = null;         // {pos, d0}
let destCooldown = 0;

city.ensure(player.p);
// nudge spawn out of any tower footprint
{
  const boxes = city.activeBoxes(player.p);
  const probe = player.p.clone();
  probe.y = 1.2;
  let guard = 0;
  while (guard++ < 30 && boxes.some(b => SURF.insideBox(probe, b))) {
    player.p.x += 6;
    probe.x += 6;
  }
}
player.prevP.copy(player.p);

function newDestination() {
  const ang = (Math.random() - 0.5) * 1.9;
  const base = Math.atan2(player.f.x, player.f.z);
  const a = base + ang;
  const dist = Math.min(1200, 600 + night * 70);
  const pos = new THREE.Vector3(
    player.p.x + Math.sin(a) * dist, 0, player.p.z + Math.cos(a) * dist);
  city.setDestination(pos, night);
  dest = { pos, d0: dist };
}
newDestination();

function destDist() {
  if (!dest) return 0;
  return Math.hypot(dest.pos.x - player.p.x, dest.pos.z - player.p.z);
}

function addMember(rec) {
  const rig = makeCharacter({ outfit: rec.color, accent: rec.color, dress: Math.random() < 0.7 });
  scene.add(rig.root);
  members.push({
    name: rec.name, color: rec.color, rig,
    trail: new Trail(scene, rec.color, 36, 0.16),
    p: rec.p.clone(), prevP: rec.p.clone(),
    n: new THREE.Vector3(0, 1, 0), f: player.f.clone(),
    speed: 8, phase: Math.random() * Math.PI * 2,
  });
}

// ---------------------------------------------------------------- toasts
const toastQueue = [];
let toastBusy = 0;
function toast(text, dur = 2.2) { toastQueue.push({ text, dur }); }
function updateToasts(dt) {
  toastBusy -= dt;
  if (toastBusy <= 0) {
    if (el.toast.classList.contains('show')) {
      el.toast.classList.remove('show');
      toastBusy = 0.4;
      return;
    }
    if (toastQueue.length) {
      const t = toastQueue.shift();
      el.toast.textContent = t.text;
      el.toast.classList.add('show');
      toastBusy = t.dur;
    }
  }
}

// ---------------------------------------------------------------- input
const keys = new Set();
let spaceDown = false;
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (!playing && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
  keys.add(e.key.toLowerCase());
  if (e.key === ' ') {
    if (!e.repeat) jumpQueued = true;
    spaceDown = true;
  }
  if (e.key.toLowerCase() === 'm') {
    muted = !muted;
    audio.setMuted(muted);
    toast(muted ? 'SOUND OFF' : 'SOUND ON', 1.1);
  }
  if (e.key.toLowerCase() === 'r' && playing) {
    flow = 0;
    toast('FLOW RESET', 1.2);
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') spaceDown = false;
});
const touches = new Map();
window.addEventListener('pointerdown', (e) => {
  if (!playing) { startGame(); return; }
  const fx = e.clientX / window.innerWidth;
  const fy = e.clientY / window.innerHeight;
  const zone = fy > 0.72 ? 'push' : fx < 0.35 ? 'left' : fx > 0.65 ? 'right' : 'mid';
  touches.set(e.pointerId, zone);
  if (zone === 'mid') { jumpQueued = true; spaceDown = true; }
});
window.addEventListener('pointerup', (e) => {
  const zone = touches.get(e.pointerId);
  touches.delete(e.pointerId);
  if (zone === 'mid' && ![...touches.values()].includes('mid')) spaceDown = false;
});

function steerInput() {
  let s = 0;
  if (keys.has('arrowleft') || keys.has('a')) s -= 1;
  if (keys.has('arrowright') || keys.has('d')) s += 1;
  for (const z of touches.values()) {
    if (z === 'left') s -= 1;
    if (z === 'right') s += 1;
  }
  return THREE.MathUtils.clamp(s, -1, 1);
}
const pushInput = () => keys.has('arrowup') || keys.has('w') || [...touches.values()].includes('push');
const brakeInput = () => keys.has('arrowdown') || keys.has('s');
const tuckInput = () => keys.has('shift');

function startGame() {
  if (playing) return;
  playing = true;
  el.title.classList.add('gone');
  el.hud.classList.add('on');
  audio.start();
  audio.setMuted(muted);
  setTimeout(() => { el.help.style.opacity = 0; }, 12000);
  toast(nightLabel(0), 2.4);
  toast(`FOLLOW THE LIGHT — TO ${venueName(night + 1)}`, 2.6);
}

document.addEventListener('visibilitychange', () => {
  if (!audio.started) return;
  if (document.hidden) audio.ctx.suspend();
  else audio.ctx.resume();
});

// ---------------------------------------------------------------- helpers
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _mtx = new THREE.Matrix4();

function signedAngle(a, b, up) {
  _t3.crossVectors(a, b);
  return Math.atan2(_t3.dot(up), a.dot(b));
}

function poseRig(rig, p, n, f) {
  rig.root.position.copy(p);
  _right.crossVectors(n, f).normalize();
  _mtx.makeBasis(_right, n, f);
  rig.root.quaternion.setFromRotationMatrix(_mtx);
}

function respawn() {
  player.p.x += (dest ? Math.sign(dest.pos.x - player.p.x) : 1) * 2;
  player.p.y = 0.05;
  player.n.set(0, 1, 0);
  player.f.y = 0;
  if (player.f.lengthSq() < 0.1) player.f.set(0, 0, 1);
  player.f.normalize();
  player.v = Math.min(player.v, 12);
  player.vel.set(0, 0, 0);
  player.grounded = true;
  player.box = null;
  shake = 0;
  toast('BACK ON YOUR FEET', 1.3);
}

// ---------------------------------------------------------------- player
function updatePlayer(dt) {
  const steer = playing ? steerInput() : 0;
  const wobble = player.stumbleT > 0 ? Math.sin(elapsed * 24) * 0.6 : 0;
  player.prevP.copy(player.p);

  const boxes = city.activeBoxes(player.p);

  // tuck
  const wantTuck = playing && tuckInput();
  player.tuck += ((wantTuck ? 1 : 0) - player.tuck) * Math.min(1, dt * 7);

  let appliedSteer = steer;
  if (!playing || window.__auto) {
    // attract/test pilot: chase the beacon, jump roof edges
    if (dest) {
      _t1.set(dest.pos.x - player.p.x, 0, dest.pos.z - player.p.z);
      _t1.addScaledVector(player.n, -_t1.dot(player.n));
      if (_t1.lengthSq() > 1) {
        const ang = signedAngle(player.f, _t1.normalize(), player.n);
        appliedSteer = THREE.MathUtils.clamp(ang * 1.8, -1, 1);
      }
    }
    player.v += ((playing ? 30 : 13) - player.v) * Math.min(1, dt * 0.8);
    if (playing && player.grounded && player.n.y > 0.9 && player.p.y > 3.5 && player.v > 16) {
      _t2.copy(player.p).addScaledVector(player.f, 9).addScaledVector(player.n, 0.3);
      if (!SURF.support(boxes, _t2, player.n, 2.5, 0.1)) doJump();
    }
  } else {
    // free skating: push, glide, brake
    const vmax = player.tuck > 0.5 ? 36 : 30;
    if (pushInput() && player.grounded) {
      const accel = player.v < 12 ? 15 : 9;
      player.v = Math.min(Math.max(player.v, 0) + accel * dt, Math.max(vmax, player.v));
    }
    if (brakeInput() && player.grounded) player.v = Math.max(0, player.v - 36 * dt);
    const drag = player.tuck > 0.5 ? 0.04 : 0.15;
    player.v -= player.v * drag * dt;
    if (player.v < 0.4 && !pushInput()) player.v = 0;
    if (player.stumbleT > 0) player.v = Math.min(player.v, 9);

    if (jumpQueued && player.grounded) doJump();
  }
  jumpQueued = false;

  if (player.grounded) {
    // rotating platforms carry and turn you
    if (player.box && player.box.rot) {
      const r = player.box.rot;
      const dth = r.w * dt;
      const cs = Math.cos(dth), sn = Math.sin(dth);
      const dx = player.p.x - r.cx, dz = player.p.z - r.cz;
      player.p.x = r.cx + dx * cs - dz * sn;
      player.p.z = r.cz + dx * sn + dz * cs;
      player.f.applyAxisAngle(player.n, dth);
    }

    const rate = (player.v < 4 ? 3.0 : 1.7 + player.v * 0.01) *
      (player.tuck > 0.5 ? 0.75 : 1) * (player.stumbleT > 0 ? 0.4 : 1);
    player.f.applyAxisAngle(player.n, appliedSteer * rate * dt);
    player.f.addScaledVector(player.n, -player.f.dot(player.n)).normalize();

    if (player.v * dt > 1e-5) {
      const ev = {};
      SURF.stepGrounded(boxes, player, player.v * dt, ev);
      if (ev.stumbled) stumble();
      if (ev.climbed && playing) flow += 25;
      if (ev.fell) {
        player.grounded = false;
        player.gravN.copy(player.n);
        player.vel.copy(player.f).multiplyScalar(player.v);
        player.airT = 0;
      }
      if (ev.lost) respawn();
    }
  } else {
    player.airT += dt;
    // hold space to glide — wings out, the city beneath you; shift to dive
    const gliding = playing && spaceDown;
    const diving = playing && tuckInput();
    const g = gliding ? 8.5 : diving ? 42 : 26;
    player.vel.addScaledVector(player.gravN, -g * dt);
    const vn = player.vel.dot(player.gravN);
    if (gliding && vn < -7) {
      player.vel.addScaledVector(player.gravN, (-7 - vn) * Math.min(1, dt * 3));
    }
    if (vn < -46) player.vel.addScaledVector(player.gravN, -46 - vn);
    if (steer !== 0) player.vel.applyAxisAngle(player.gravN, steer * (gliding ? 1.7 : 1.0) * dt);
    const sup = SURF.support(boxes, player.prevP, player.gravN, 80, 0.1);
    player.p.addScaledVector(player.vel, dt);
    if (sup) {
      const a = SURF.axisOf(player.gravN);
      const sgn = SURF.comp(player.gravN, a) >= 0 ? 1 : -1;
      const h = (SURF.comp(player.p, a) - sup.q) * sgn;
      const fallSpeed = -player.vel.dot(player.gravN);
      if (h <= 0.04 && player.vel.dot(player.gravN) <= 0) {
        player.p.setComponent(a, sup.q);
        player.n.copy(player.gravN);
        _t1.copy(player.vel).addScaledVector(player.gravN, -player.vel.dot(player.gravN));
        if (_t1.lengthSq() > 1) player.f.copy(_t1).normalize();
        const landV = THREE.MathUtils.clamp(_t1.length(), 0, 48);
        player.grounded = true;
        player.box = sup.box;
        player.vel.set(0, 0, 0);
        // building-to-building air rewarded
        if (playing && player.airT > 0.55 && sup.q > 3.5) {
          flow += Math.round(120 + player.airT * 160);
          player.v = Math.min(landV + 5, 46);
          player.boostPulse = 0.8;
          audio.boost();
          if (player.airT > 0.85) toast(`+AIR ${Math.round(player.airT * 10) / 10}S`, 0.9);
        } else {
          player.v = landV;
        }
        // slamming in from terminal velocity hurts — glide to land soft
        if (playing && fallSpeed > 30) {
          player.invulnT = 0;
          stumble();
        }
        player.airT = 0;
      }
    }
    // leap at a facade and ride it
    if (!player.grounded) {
      _t1.copy(player.vel).addScaledVector(player.gravN, -player.vel.dot(player.gravN));
      if (_t1.lengthSq() > 16) {
        const k = SURF.axisOf(_t1);
        const sk = SURF.comp(_t1, k) >= 0 ? 1 : -1;
        const w = SURF.wallAhead(boxes, player.p, player.gravN, k, sk, Math.abs(SURF.comp(_t1, k)) * dt + 0.7);
        if (w && w.extent >= 2.2) {
          const st = { p: player.p, n: player.n.copy(player.gravN), f: player.f.copy(_t1).normalize(), box: player.box };
          SURF.climb(st, k, sk, w.q, w.box);
          player.box = st.box;
          player.v = THREE.MathUtils.clamp(_t1.length() * 0.8, 8, 40);
          player.grounded = true;
          player.vel.set(0, 0, 0);
          player.airT = 0;
          if (playing) flow += 50;
          audio.blip([523, 659, 784], 'sine', 0.06, 0.12, 0.35);
        }
      }
    }
    if (player.p.y < -50 || player.p.y > 240 || !isFinite(player.p.y)) respawn();
  }

  // traffic is real: clip a car and you eat asphalt
  if (playing && player.grounded && player.invulnT <= 0 && city.carHit(player.p)) {
    stumble();
    toast('CLIPPED BY TRAFFIC', 1.2);
  }
  if (playing && members.length < 28) {
    const rec = city.tryRecruit(player.p, 7.5);
    if (rec) {
      addMember(rec);
      audio.join();
      toast(`${rec.name} JOINED · ${members.length + 1} STRONG`, 1.5);
    }
  }

  // destination: the night ends in the penthouse, up top
  if (playing && dest) {
    const d = destDist();
    const roofY = city.beacon ? city.beacon.topY : 0;
    if (d < 14 && player.p.y > roofY - 5) {
      flow += 1500 + members.length * 100;
      audio.blip([523, 659, 784, 1046, 1318], 'triangle', 0.09, 0.16, 0.7);
      toast(`${venueName(night + 1)} — NIGHT ${night + 1} COMPLETE`, 3.0);
      night++;
      city.night = night;
      scene.environment = envFor(night);
      city.clearBeacon();
      dest = null;
      destCooldown = 1.6;
    }
  }
  if (!dest && playing) {
    destCooldown -= dt;
    if (destCooldown <= 0) {
      newDestination();
      toast(`TONIGHT: ${venueName(night + 1)}`, 2.2);
    }
  }

  player.stumbleT = Math.max(0, player.stumbleT - dt);
  player.invulnT = Math.max(0, player.invulnT - dt);
  player.boostPulse = Math.max(0, player.boostPulse - dt * 1.4);

  poseRig(player.rig, player.p, player.n, player.f);
  player.rig.animate(elapsed, player.grounded ? player.v : 4, steer + wobble, player.tuck);

  if (playing && player.v > 3) {
    flow += dt * player.v * 0.55 * (1 + members.length * 0.12);
  }
}

function doJump() {
  const jv = (8.6 + player.v * 0.135) * (1 + player.tuck * 0.22);
  player.vel.copy(player.f).multiplyScalar(player.v).addScaledVector(player.n, jv);
  player.gravN.copy(player.n);
  player.grounded = false;
  player.airT = 0;
}

function stumble() {
  if (player.invulnT > 0) return;
  player.v = Math.max(6, player.v * 0.45);
  player.stumbleT = 0.9;
  player.invulnT = 1.5;
  shake = 0.5;
  audio.stumble();
}

// ---------------------------------------------------------------- troupe
function updateTroupe(dt) {
  if (!members.length) return;
  const boxes = city.activeBoxes(player.p);
  _right.crossVectors(player.n, player.f).normalize();

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    m.prevP.copy(m.p);

    const row = Math.floor(i / 3) + 1;
    const lane = (i % 3) - 1;
    const brick = row % 2 ? 0.45 : -0.45;
    let back = 3.4 + row * 3.0;
    let side = (lane + brick) * 3.4 + Math.sin(elapsed * 0.9 + m.phase) * 0.9;

    // project the slot onto skateable ground near the player's surface
    let slot = _t1;
    for (let iter = 0; iter < 3; iter++) {
      slot.copy(player.p).addScaledVector(player.f, -back).addScaledVector(_right, side);
      _t2.copy(slot).addScaledVector(player.n, 1.2);
      let blocked = false;
      for (const b of boxes) {
        if (SURF.insideBox(_t2, b)) { blocked = true; break; }
      }
      if (!blocked) {
        _t2.copy(slot).addScaledVector(player.n, 0.5);
        const sup = SURF.support(boxes, _t2, player.n, 9, 0.3);
        if (sup) {
          const a = SURF.axisOf(player.n);
          slot.setComponent(a, sup.q);
          break;
        }
      }
      back *= 0.6;
      side *= 0.5;
    }

    m.p.lerp(slot, Math.min(1, dt * 5));
    m.n.lerp(player.n, Math.min(1, dt * 5)).normalize();
    _t2.copy(m.p).sub(m.prevP);
    const sp = _t2.length() / Math.max(dt, 1e-4);
    if (sp > 1.5) {
      _t2.normalize();
      m.f.lerp(_t2, Math.min(1, dt * 6));
    } else {
      m.f.lerp(player.f, Math.min(1, dt * 2));
    }
    m.f.addScaledVector(m.n, -m.f.dot(m.n));
    if (m.f.lengthSq() < 1e-4) m.f.copy(player.f);
    m.f.normalize();
    m.speed = THREE.MathUtils.lerp(m.speed, sp, 0.2);

    poseRig(m.rig, m.p, m.n, m.f);
    m.rig.animate(elapsed + m.phase, m.speed, 0, player.tuck * 0.8);
    _t2.copy(m.p).addScaledVector(m.n, 0.22);
    m.trail.update(dt, _t2, m.n, m.f);
  }
}

// ---------------------------------------------------------------- camera
const smoothUp = new THREE.Vector3(0, 1, 0);
const smoothF = new THREE.Vector3(0, 0, 1);
const camPos = new THREE.Vector3(0, 5, -10);
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  smoothUp.lerp(player.n, 1 - Math.exp(-7 * dt)).normalize();
  smoothF.lerp(player.f, 1 - Math.exp(-9.5 * dt));
  smoothF.addScaledVector(smoothUp, -smoothF.dot(smoothUp));
  if (smoothF.lengthSq() < 1e-4) smoothF.copy(player.f);
  smoothF.normalize();

  const packPull = Math.min(7, members.length * 0.55);
  const h = 4.1 - player.tuck * 1.2 + packPull * 0.22;
  _t1.copy(player.p).addScaledVector(smoothUp, h).addScaledVector(smoothF, -(8.8 + packPull));
  _t2.copy(player.p).addScaledVector(smoothUp, 1.9).addScaledVector(smoothF, 10.5);
  camPos.lerp(_t1, 1 - Math.exp(-12 * dt));
  camLook.lerp(_t2, 1 - Math.exp(-15 * dt));

  shake = Math.max(0, shake - dt * 1.4);
  _right.crossVectors(smoothUp, smoothF);
  camera.position.copy(camPos)
    .addScaledVector(_right, (Math.random() - 0.5) * shake)
    .addScaledVector(smoothUp, (Math.random() - 0.5) * shake);
  camera.up.copy(smoothUp);
  camera.lookAt(camLook);

  const fov = 60 + THREE.MathUtils.clamp(player.v - 14, 0, 32) * 0.45 + player.boostPulse * 8;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- HUD
function updateHud() {
  el.era.textContent = nightLabel(night);
  el.flow.firstChild.textContent = `FLOW ${String(Math.floor(flow)).padStart(6, '0')}`;
  el.pack.textContent = members.length ? `${members.length + 1} IN THE TROUPE` : 'SKATING SOLO';
  el.speed.textContent = `${Math.round(player.v * 3.6)} KM/H`;
  if (dest) {
    const d = destDist();
    const low = city.beacon && player.p.y < city.beacon.topY - 5;
    el.meterLabel.textContent = d < 30 && low
      ? 'CLIMB TO THE PENTHOUSE'
      : `TO ${venueName(night + 1)} · ${Math.max(0, Math.round(d))}M`;
    el.meterFill.style.width = `${THREE.MathUtils.clamp(1 - d / dest.d0, 0, 1) * 100}%`;
    el.meterFill.style.background = '#ffd166';
  } else {
    el.meterLabel.textContent = 'THE NIGHT GOES ON';
    el.meterFill.style.width = '100%';
  }
}

// ---------------------------------------------------------------- loop
window.__stepOnce = () => step(0.016);
window.__test = {
  push: (dv = 25) => { player.v = Math.min(46, player.v + dv); },
  jump: () => { if (player.grounded) doJump(); },
  trip: () => { player.invulnT = 0; stumble(); },
  tp: (x, y, z) => {
    player.p.set(x, y, z);
    player.prevP.copy(player.p);
    player.vel.set(0, 0, 0);
    player.gravN.set(0, 1, 0);
    player.n.set(0, 1, 0);
    player.grounded = false;
    player.box = null;
  },
  rotor: () => {
    let best = null, bd = Infinity;
    for (const r of city.rotors) {
      const d = (r.box.rot.cx - player.p.x) ** 2 + (r.box.rot.cz - player.p.z) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best ? { cx: best.box.rot.cx, cz: best.box.rot.cz, topY: best.box.max.y, w: best.box.rot.w } : null;
  },
  dest: () => dest ? { x: dest.pos.x, z: dest.pos.z, d: destDist() } : null,
  recruit: () => {
    let best = null, bd = Infinity;
    for (const r of city.recruits) {
      const d = r.p.distanceToSquared(player.p);
      if (d < bd) { bd = d; best = r; }
    }
    return best ? { x: best.p.x, y: best.p.y, z: best.p.z, name: best.name } : null;
  },
  f: () => ({ x: +player.f.x.toFixed(2), z: +player.f.z.toFixed(2) }),
  members: () => members.slice(0, 4).map(m => ({
    x: +m.p.x.toFixed(1), y: +m.p.y.toFixed(1), z: +m.p.z.toFixed(1),
    dp: +m.p.distanceTo(player.p).toFixed(1),
  })),
};

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  step();
}
let lastTick = performance.now();
setInterval(() => {
  if (!document.hidden) { lastTick = performance.now(); return; }
  const now = performance.now();
  let budget = Math.min(1.5, (now - lastTick) / 1000);
  lastTick = now;
  if (!window.__auto) { step(); return; }
  while (budget > 0.001) { step(0.034); budget -= 0.034; }
}, 50);

function step(dtOverride) {
  const dt = dtOverride ?? Math.min(0.034, clock.getDelta());
  if (window.__freeze) { composer.render(); return; }
  elapsed += dt;

  city.ensure(player.p);
  city.update(dt, elapsed, player.p);
  updatePlayer(dt);
  updateTroupe(dt);
  updateCamera(dt);
  updateToasts(dt);
  if (playing) updateHud();

  nightF += (night - nightF) * Math.min(1, dt * 0.35);
  const atm = blendedAtmosphere(nightF);
  scene.fog.color.copy(atm.horizon);
  ambient.color.copy(atm.ambient);
  dirLight.color.copy(atm.key);
  dirLight.position.copy(player.p).add(LIGHT_OFF);
  dirLight.target.position.copy(player.p);
  fillLight.position.copy(player.p).add(FILL_OFF);
  fillLight.target.position.copy(player.p);
  fillLight.color.copy(atm.lamp);
  sky.update(dt, camera.position, player.p, atm);
  mirror.position.x = player.p.x;
  mirror.position.z = player.p.z;

  audio.setSpeed(player.v, !player.grounded);

  window.__game = {
    playing,
    p: { x: +player.p.x.toFixed(1), y: +player.p.y.toFixed(1), z: +player.p.z.toFixed(1) },
    n: `${player.n.x.toFixed(0)},${player.n.y.toFixed(0)},${player.n.z.toFixed(0)}`,
    v: +player.v.toFixed(1),
    grounded: player.grounded,
    airT: +player.airT.toFixed(2),
    tuck: +player.tuck.toFixed(2),
    flow: Math.floor(flow),
    night, pack: members.length,
    destDist: +destDist().toFixed(0),
    onRotor: !!(player.box && player.box.rot),
  };

  composer.render();
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
