// CLOSER — an infinite disco, on rollerskates.
// v2: true surface-skating. The city is real architecture; your "down" is
// whatever face you're on. Ride facades, rooftops, undersides; pass through
// windows; follow the pack or lead it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { eraIndex, eraLabel, blendedAtmosphere } from './palettes.js';
import { City } from './city.js';
import { Sky } from './sky.js';
import * as SURF from './surface.js';
import { makeSkater, Trail, makeLink } from './skaters.js';
import { DiscoAudio } from './audio.js';

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe06a72, 42, 360);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.5, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const ambient = new THREE.AmbientLight(0xffd2b8, 1.05);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.55);
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

const city = new City(scene);
city.ensure(0);
const sky = new Sky(scene);
const audio = new DiscoAudio();

// film grain tile for the CSS overlay
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

// ---------------------------------------------------------------- DOM
const el = {
  title: document.getElementById('title'),
  hud: document.getElementById('hud'),
  era: document.getElementById('era'),
  flow: document.getElementById('flow'),
  speed: document.getElementById('speed'),
  help: document.getElementById('help'),
  meterLabel: document.getElementById('meterLabel'),
  meterFill: document.getElementById('meterFill'),
  toast: document.getElementById('toast'),
};

// ---------------------------------------------------------------- state
const ROSTER = [
  { name: 'TINY',   color: 0x35e0c8 },
  { name: 'BENNIE', color: 0xffd166 },
  { name: 'LEVON',  color: 0xff7a5a },
  { name: 'NIKITA', color: 0xc79bff },
  { name: 'DANIEL', color: 0x9fffcf },
  { name: 'ROCKET', color: 0xff4f6e },
];

const spawn = city.sampleRoute(6);
const player = {
  p: spawn.p.clone(),
  n: new THREE.Vector3(0, 1, 0),
  f: new THREE.Vector3(0, 0, 1),
  box: null,
  prevP: spawn.p.clone(),
  v: 16,
  vel: new THREE.Vector3(),
  gravN: new THREE.Vector3(0, 1, 0),
  grounded: true,
  s: 6, routeIdx: 0,
  stumbleT: 0, invulnT: 0, boostPulse: 0,
  rig: makeSkater({ outfit: 0xffc23d, hair: 0xff4660, skin: 0xeab38a, dress: false, jeans: true, accent: 0xff8a3d }),
  trail: null,
};
scene.add(player.rig.root);
player.trail = new Trail(scene, 0xfff1c9);

let members = [];
let links = [];
const playerLink = makeLink(scene, 0xfff1c9);
let mode = 'follow';
let linked = false;
let linkTimer = 0;
let flow = 0;
let prevEra = 0;
let rosterNext = 0;
let playing = false;
let muted = false;
let shake = 0;
let elapsed = 0;
let leaderS = 30;

// player path history (used when you lead)
const hist = [];
let lastHistS = -1e9;
function histSample(s) {
  if (!hist.length) return null;
  if (s <= hist[0].s) return hist[0];
  if (s >= hist[hist.length - 1].s) return hist[hist.length - 1];
  let lo = 0, hi = hist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (hist[mid].s <= s) lo = mid; else hi = mid;
  }
  return hist[lo];
}

function addMember(rec, atS) {
  const rig = makeSkater({ outfit: rec.color, dress: true });
  scene.add(rig.root);
  const sm = city.sampleRoute(atS) ?? { p: player.p.clone(), n: player.n.clone(), f: player.f.clone() };
  const m = {
    ...rec, rig,
    trail: new Trail(scene, rec.color),
    p: sm.p.clone(), n: sm.n.clone(), f: sm.f.clone(),
    prevP: sm.p.clone(), speed: 20,
    weavePhase: Math.random() * Math.PI * 2,
  };
  members.push(m);
  if (members.length > 1) links.push(makeLink(scene, 0xfff1c9));
  return m;
}

function softReset() {
  flow = 0;
  mode = 'follow';
  linked = false;
  linkTimer = 0;
  for (const m of members) {
    scene.remove(m.rig.root);
    m.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(m.trail.mesh);
    m.trail.geo.dispose();
  }
  for (const l of links) { scene.remove(l.line); l.line.geometry.dispose(); }
  members = [];
  links = [];
  rosterNext = 0;
  leaderS = player.s + 24;
  addMember(ROSTER[rosterNext++], leaderS);
}

// ---------------------------------------------------------------- toasts
const toastQueue = [];
let toastBusy = 0;
function toast(text, dur = 2.4) { toastQueue.push({ text, dur }); }
function updateToasts(dt) {
  toastBusy -= dt;
  if (toastBusy <= 0) {
    if (el.toast.classList.contains('show')) {
      el.toast.classList.remove('show');
      toastBusy = 0.5;
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
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  if (!playing && (e.key === ' ' || e.key === 'Enter')) { startGame(); return; }
  keys.add(e.key.toLowerCase());
  if (e.key === ' ') keys.add('space');
  if (e.key.toLowerCase() === 'm') {
    muted = !muted;
    audio.setMuted(muted);
    toast(muted ? 'SOUND OFF' : 'SOUND ON', 1.2);
  }
  if (e.key.toLowerCase() === 'r' && playing) {
    softReset();
    toast('FROM THE TOP', 1.6);
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') keys.delete('space');
});
const touches = new Map();
window.addEventListener('pointerdown', (e) => {
  if (!playing) { startGame(); return; }
  const f = e.clientX / window.innerWidth;
  const zone = f < 0.35 ? 'left' : f > 0.65 ? 'right' : 'mid';
  touches.set(e.pointerId, zone);
  if (zone === 'mid') keys.add('space');
});
window.addEventListener('pointerup', (e) => {
  const zone = touches.get(e.pointerId);
  touches.delete(e.pointerId);
  if (zone === 'mid') keys.delete('space');
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

function startGame() {
  if (playing) return;
  playing = true;
  el.title.classList.add('gone');
  el.hud.classList.add('on');
  audio.start();
  audio.setMuted(muted);
  setTimeout(() => { el.help.style.opacity = 0; }, 11000);
  toast(eraLabel(0), 2.6);
}

document.addEventListener('visibilitychange', () => {
  if (!audio.started) return;
  if (document.hidden) audio.ctx.suspend();
  else audio.ctx.resume();
});

// ---------------------------------------------------------------- helpers
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _right = new THREE.Vector3();

function signedAngle(a, b, up) {
  _t3.crossVectors(a, b);
  return Math.atan2(_t3.dot(up), a.dot(b));
}

function poseRig(rig, p, n, f) {
  rig.root.position.copy(p);
  _right.crossVectors(n, f).normalize();
  const m = new THREE.Matrix4().makeBasis(_right, n, f);
  rig.root.quaternion.setFromRotationMatrix(m);
}

function respawn(toS, announce = true) {
  const sm = city.sampleRoute(toS);
  if (!sm) return;
  player.p.copy(sm.p).addScaledVector(sm.n, 0.05);
  player.prevP.copy(player.p);
  player.n.copy(sm.n);
  player.f.copy(sm.f).addScaledVector(sm.n, -sm.f.dot(sm.n)).normalize();
  if (player.f.lengthSq() < 0.5) player.f.set(0, 0, 1);
  player.v = 18;
  player.grounded = true;
  player.box = null;
  player.vel.set(0, 0, 0);
  shake = 0;
  if (announce) toast('BACK TO THE LINE', 1.6);
}

// ---------------------------------------------------------------- player
function updatePlayer(dt) {
  const steer = playing ? steerInput() : 0;
  const wobble = player.stumbleT > 0 ? Math.sin(elapsed * 24) * 0.6 : 0;
  player.prevP.copy(player.p);

  let appliedSteer = steer;
  if (!playing || window.__auto) {
    const target = city.sampleRoute(player.s + 9 + player.v * 0.28);
    if (target) {
      _t1.copy(target.p).sub(player.p);
      _t1.addScaledVector(player.n, -_t1.dot(player.n));
      if (_t1.lengthSq() > 0.04) {
        const ang = signedAngle(player.f, _t1.normalize(), player.n);
        appliedSteer = THREE.MathUtils.clamp(ang * 1.6, -1, 1);
      }
      if (playing && player.grounded) {
        for (let i = player.routeIdx; i < Math.min(player.routeIdx + 4, city.route.length); i++) {
          const pt = city.route[i];
          if (pt.jump && pt.p.distanceToSquared(player.p) < 40) { doJump(); break; }
        }
      }
    }
    player.v += ((playing ? 24 : 13) - player.v) * Math.min(1, dt);
  } else {
    let vTarget = 23;
    if (keys.has('arrowup') || keys.has('w')) vTarget += 11;
    if (keys.has('arrowdown') || keys.has('s')) vTarget = 12;
    if (linked) vTarget += 2.5;
    if (player.stumbleT > 0) vTarget = Math.min(vTarget, 10);
    player.v += (vTarget - player.v) * Math.min(1, dt * (player.grounded ? 0.9 : 0.25));
    player.v = Math.min(player.v, 46);
    if (keys.has('space') && player.grounded) {
      doJump();
      keys.delete('space');
    }
  }

  const boxes = city.activeBoxes(player.p.z);

  if (player.grounded) {
    const rate = (1.9 + player.v * 0.012) * (player.stumbleT > 0 ? 0.4 : 1);
    player.f.applyAxisAngle(player.n, appliedSteer * rate * dt);
    player.f.addScaledVector(player.n, -player.f.dot(player.n)).normalize();

    const ev = {};
    SURF.stepGrounded(boxes, player, player.v * dt, ev);
    if (ev.stumbled) stumble();
    if (ev.climbed && playing) flow += 30;
    if (ev.lost) respawn(player.s + 4);
  } else {
    player.vel.addScaledVector(player.gravN, -26 * dt);
    // landing: face below along gravity
    const sup = SURF.support(boxes, player.p, player.gravN, 60, 0.1);
    player.p.addScaledVector(player.vel, dt);
    if (sup) {
      const a = SURF.axisOf(player.gravN);
      const sgn = SURF.comp(player.gravN, a) >= 0 ? 1 : -1;
      const h = (SURF.comp(player.p, a) - sup.q) * sgn;
      if (h <= 0.04 && player.vel.dot(player.gravN) <= 0) {
        player.p.setComponent(a, sup.q);
        player.n.copy(player.gravN);
        _t1.copy(player.vel).addScaledVector(player.gravN, -player.vel.dot(player.gravN));
        if (_t1.lengthSq() > 1) player.f.copy(_t1).normalize();
        player.v = THREE.MathUtils.clamp(_t1.length(), 10, 46);
        player.grounded = true;
        player.box = sup.box;
        player.vel.set(0, 0, 0);
      }
    }
    // air-attach to a facade you leap at
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
          player.v = THREE.MathUtils.clamp(_t1.length() * 0.8, 10, 40);
          player.grounded = true;
          player.vel.set(0, 0, 0);
          if (playing) flow += 60;
          audio.link();
        }
      }
    }
    if (player.p.y < -110 || player.p.y > 160) respawn(player.s + 4);
  }

  // progress + lost check
  const nr = city.nearestS(player.p, player.routeIdx);
  player.routeIdx = nr.idx;
  player.s = nr.s;
  if (nr.dist > 52) respawn(player.s + 4);

  if (player.s - lastHistS >= 1) {
    hist.push({ s: player.s, p: player.p.clone(), n: player.n.clone(), f: player.f.clone() });
    lastHistS = player.s;
    if (hist.length > 700) hist.splice(0, hist.length - 700);
  }

  // rings + windows
  const ring = city.tryRing(player.p);
  if (ring) {
    player.v = Math.min(46, player.v + 13);
    player.boostPulse = 1;
    flow += 150;
    audio.boost();
  }
  const win = city.tryWindow(player.p, player.prevP);
  if (win && playing) {
    flow += 120;
    audio.blip([659, 880, 1318], 'triangle', 0.05, 0.15, 0.4);
    toast('THROUGH THE WINDOW', 1.2);
  }

  player.stumbleT = Math.max(0, player.stumbleT - dt);
  player.invulnT = Math.max(0, player.invulnT - dt);
  player.boostPulse = Math.max(0, player.boostPulse - dt * 1.4);

  poseRig(player.rig, player.p, player.n, player.f);
  player.rig.animate(elapsed, player.v, steerInput() + wobble);
  _t1.copy(player.p).addScaledVector(player.n, 0.22);
  player.trail.update(dt, _t1, player.n, player.f);

  if (playing) {
    const mult = mode === 'leading' ? 5 : linked ? 3 : 1;
    flow += dt * player.v * 0.6 * mult;
  }
}

function doJump() {
  player.vel.copy(player.f).multiplyScalar(player.v).addScaledVector(player.n, 10.8);
  player.gravN.copy(player.n);
  player.grounded = false;
}

function stumble() {
  if (player.invulnT > 0) return;
  player.v = Math.max(8, player.v * 0.45);
  player.stumbleT = 0.9;
  player.invulnT = 1.5;
  shake = 0.55;
  audio.stumble();
  if (mode === 'leading') {
    mode = 'follow';
    linked = false;
    toast('THE PACK SWEEPS PAST', 1.8);
  }
}

// ---------------------------------------------------------------- pack
function updatePack(dt) {
  if (!members.length) return 999;
  const leader = members[0];

  if (mode === 'follow' && playing && player.s > leaderS + 6 &&
      player.invulnT <= 0 && player.stumbleT <= 0) {
    mode = 'leading';
    toast('YOU LEAD THE NIGHT', 2.0);
    audio.link();
  } else if (mode === 'leading' && leaderS > player.s + 2) {
    mode = 'follow';
  }

  // leader pacing along the route (asymmetric rubber band)
  if (mode === 'follow') {
    const lead = leaderS - player.s;
    const ideal = 14 + (members.length - 1) * 6;
    let vL;
    if (lead < 0) vL = Math.max(player.v + 7, 30);
    else if (lead < ideal) vL = Math.min(26, player.v * 0.92 + 2);
    else vL = THREE.MathUtils.clamp(player.v + (ideal - lead) * 0.5, lead > 80 ? -9 : 0, 40);
    leaderS += vL * dt;
    leader.speed = Math.abs(vL);
  } else {
    leaderS = Math.max(leaderS - 10 * dt, player.s - 8);
  }

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    m.prevP.copy(m.p);
    let target = null;
    if (mode === 'leading') {
      target = histSample(player.s - 8 - i * 6);
    }
    if (!target) {
      target = city.sampleRoute(Math.max(2, leaderS - i * 6));
    }
    if (!target) continue;
    m.p.lerp(target.p, Math.min(1, dt * 3.2));
    m.n.lerp(target.n, Math.min(1, dt * 4.5)).normalize();
    if (target.f && target.f.lengthSq() > 0.1) {
      m.f.lerp(target.f, Math.min(1, dt * 4)).normalize();
    }
    m.f.addScaledVector(m.n, -m.f.dot(m.n));
    if (m.f.lengthSq() < 1e-4) m.f.set(0, 0, 1);
    m.f.normalize();
    const sp = m.prevP.distanceTo(m.p) / Math.max(dt, 1e-4);
    m.speed = THREE.MathUtils.lerp(m.speed ?? 20, sp, 0.2);

    poseRig(m.rig, m.p, m.n, m.f);
    m.rig.animate(elapsed + m.weavePhase, m.speed, 0);
    _t1.copy(m.p).addScaledVector(m.n, 0.22);
    m.trail.update(dt, _t1, m.n, m.f);
  }

  for (let i = 0; i < links.length; i++) {
    const a = members[i], b = members[i + 1];
    if (!a || !b) continue;
    _t1.copy(a.p).addScaledVector(a.n, 1.35);
    _t2.copy(b.p).addScaledVector(b.n, 1.35);
    links[i].set(_t1, _t2, 0.3 + Math.sin(elapsed * 5 + i) * 0.1);
  }

  const anchor = mode === 'leading' ? members[0] : members[members.length - 1];
  const d = anchor.p.distanceTo(player.p);

  if (playing && mode === 'follow') {
    if (d < 18) {
      linkTimer += dt;
      if (!linked && linkTimer > 0.8) {
        linked = true;
        audio.link();
        toast('LINKED — HOLD ON', 1.6);
      }
    } else {
      linkTimer = 0;
      if (linked && d > 26) {
        linked = false;
        audio.unlink();
      }
    }
  }

  if (linked && mode === 'follow') {
    _t1.copy(player.p).addScaledVector(player.n, 1.35);
    _t2.copy(anchor.p).addScaledVector(anchor.n, 1.35);
    playerLink.set(_t1, _t2, 0.5 + Math.sin(elapsed * 6) * 0.25);
  } else {
    playerLink.line.material.opacity *= 0.9;
  }
  return d;
}

function updateEra() {
  const e = eraIndex(player.s);
  if (e > prevEra) {
    prevEra = e;
    toast(eraLabel(player.s), 2.8);
    if (rosterNext < ROSTER.length) {
      const rec = ROSTER[rosterNext++];
      addMember(rec, leaderS + 18);
      toast(`${rec.name} JOINED THE NIGHT`, 2.2);
      audio.join();
    }
  }
}

// ---------------------------------------------------------------- camera
const smoothUp = new THREE.Vector3(0, 1, 0);
const smoothF = new THREE.Vector3(0, 0, 1);
const camPos = new THREE.Vector3(0, 5, -10);
const camLook = new THREE.Vector3();

function updateCamera(dt) {
  smoothUp.lerp(player.n, 1 - Math.exp(-4.2 * dt)).normalize();
  smoothF.lerp(player.f, 1 - Math.exp(-5.5 * dt));
  smoothF.addScaledVector(smoothUp, -smoothF.dot(smoothUp));
  if (smoothF.lengthSq() < 1e-4) smoothF.copy(player.f);
  smoothF.normalize();

  _t1.copy(player.p).addScaledVector(smoothUp, 4.1).addScaledVector(smoothF, -9.8);
  _t2.copy(player.p).addScaledVector(smoothUp, 2.1).addScaledVector(smoothF, 11.5);
  camPos.lerp(_t1, 1 - Math.exp(-7 * dt));
  camLook.lerp(_t2, 1 - Math.exp(-8.5 * dt));

  shake = Math.max(0, shake - dt * 1.4);
  _right.crossVectors(smoothUp, smoothF);
  camera.position.copy(camPos)
    .addScaledVector(_right, (Math.random() - 0.5) * shake)
    .addScaledVector(smoothUp, (Math.random() - 0.5) * shake);
  camera.up.copy(smoothUp);
  camera.lookAt(camLook);

  const fov = 62 + THREE.MathUtils.clamp(player.v - 20, 0, 22) * 0.42 + player.boostPulse * 9;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- HUD
function updateHud(d) {
  el.era.textContent = eraLabel(player.s);
  el.flow.textContent = `FLOW ${String(Math.floor(flow)).padStart(6, '0')}`;
  el.speed.textContent = `${Math.round(player.v * 3.6)} KM/H`;
  let label, fill, color;
  if (mode === 'leading') {
    label = 'LEADING THE NIGHT';
    fill = 100;
    color = '#ff7ad9';
  } else if (linked) {
    label = 'LINKED — HOLD ON';
    fill = 100;
    color = '#ffd166';
  } else {
    const f = THREE.MathUtils.clamp(1 - (d - 6) / 70, 0, 1);
    fill = f * 100;
    color = '#ffffff';
    label = d > 60 ? 'DRIFTING APART' : 'GETTING CLOSER';
  }
  el.meterLabel.textContent = label;
  el.meterFill.style.width = `${fill}%`;
  el.meterFill.style.background = color;
}

// ---------------------------------------------------------------- loop
addMember(ROSTER[rosterNext++], leaderS);

window.__stepOnce = () => step(0.016);
window.__test = {
  push: (dv = 25) => { player.v = Math.min(46, player.v + dv); },
  jump: () => { if (player.grounded) doJump(); },
  trip: () => { player.invulnT = 0; stumble(); },
  warp: (ds = 30) => { respawn(player.s + ds, false); const nr = city.nearestS(player.p, player.routeIdx + Math.round(ds / 2.4)); player.routeIdx = nr.idx; player.s = nr.s; },
};

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  step();
}
// Hidden tabs throttle timers hard; in test mode (__auto) run catch-up
// substeps so automated runs keep real-time pace while backgrounded.
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

  city.ensure(player.p.z);
  city.update(dt);
  updatePlayer(dt);
  const d = updatePack(dt);
  updateEra();
  updateCamera(dt);
  updateToasts(dt);
  if (playing) updateHud(d);

  const atm = blendedAtmosphere(player.s + 90);
  scene.fog.color.copy(atm.horizon);
  ambient.color.copy(atm.ambient);
  dirLight.color.copy(atm.sun);
  dirLight.position.copy(player.p).add(LIGHT_OFF);
  dirLight.target.position.copy(player.p);
  sky.update(dt, camera.position, player.p.z, atm);

  audio.setSpeed(player.v, !player.grounded);

  window.__game = {
    playing, mode, linked,
    p: { x: +player.p.x.toFixed(1), y: +player.p.y.toFixed(1), z: +player.p.z.toFixed(1) },
    n: `${player.n.x.toFixed(0)},${player.n.y.toFixed(0)},${player.n.z.toFixed(0)}`,
    v: +player.v.toFixed(1), s: +player.s.toFixed(1),
    grounded: player.grounded,
    flow: Math.floor(flow),
    era: eraIndex(player.s), pack: members.length,
    packDist: +(+d).toFixed(1), leadGap: +(leaderS - player.s).toFixed(1),
    routeDist: +city.nearestS(player.p, player.routeIdx).dist.toFixed(1),
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
