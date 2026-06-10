// CLOSER — an infinite disco, on rollerskates.
// You skate the inside of an endless rotating city; gravity is wherever
// your wheels are. Stay close to the pack, or take the lead.
import * as THREE from 'three';
import {
  World, R, corridorTheta, eraIndex, eraLabel,
  surfPoint, upVec, tanVec, quatFromBasis, angWrap,
} from './world.js';
import { makeSkater, Trail, makeLink } from './skaters.js';
import { DiscoAudio } from './audio.js';

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x47102b);
scene.fog = new THREE.Fog(0x47102b, 26, 300);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

const ambient = new THREE.AmbientLight(0xff9a66, 1.25);
scene.add(ambient);
const sunLight = new THREE.DirectionalLight(0xffc890, 1.4);
scene.add(sunLight);
scene.add(sunLight.target);

const world = new World(scene);
const audio = new DiscoAudio();

// film grain background tile
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

const player = {
  z: 0, theta: corridorTheta(0), psi: 0, v: 16,
  h: 0, vh: 0, onGround: true,
  stumbleT: 0, invulnT: 0, boostPulse: 0,
  rig: makeSkater({ outfit: 0xffc23d, hair: 0xff4660, skin: 0xeab38a, dress: false, jeans: true, accent: 0xff8a3d }),
  trail: null,
};
scene.add(player.rig.root);
player.trail = new Trail(scene, 0xfff1c9);

let members = [];        // the pack, leader first
let links = [];          // glow lines between consecutive pack members
let playerLink = makeLink(scene, 0xfff1c9);
let mode = 'follow';     // 'follow' | 'leading'
let linked = false;
let linkTimer = 0;
let flow = 0;
let prevEra = 0;
let rosterNext = 0;
let playing = false;
let muted = false;
let shake = 0;
let elapsed = 0;

// player path history for when you lead the pack
const path = [];         // {z, theta}, ascending z, ~1m apart
let lastPathZ = -1e9;

function pathTheta(z) {
  if (path.length === 0) return corridorTheta(z);
  if (z <= path[0].z) return path[0].theta;
  if (z >= path[path.length - 1].z) return path[path.length - 1].theta;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].z <= z) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[hi];
  const t = (z - a.z) / Math.max(1e-6, b.z - a.z);
  return a.theta + angWrap(b.theta - a.theta) * t;
}

function addMember(rec, spawnZ) {
  const rig = makeSkater({ outfit: rec.color, dress: true });
  scene.add(rig.root);
  const m = {
    ...rec, rig,
    trail: new Trail(scene, rec.color),
    z: spawnZ, theta: corridorTheta(spawnZ), h: 0,
    prevZ: spawnZ, prevTheta: corridorTheta(spawnZ), psi: 0, speed: 20,
    weavePhase: Math.random() * Math.PI * 2,
  };
  members.push(m);
  if (members.length > 1) links.push(makeLink(scene, 0xfff1c9));
  return m;
}

function removeAllMembers() {
  for (const m of members) {
    scene.remove(m.rig.root);
    m.rig.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    scene.remove(m.trail.line);
    m.trail.geo.dispose();
  }
  for (const l of links) { scene.remove(l.line); l.line.geometry.dispose(); }
  members = [];
  links = [];
}

function reset() {
  player.z = 0;
  player.theta = corridorTheta(0);
  player.psi = 0;
  player.v = 16;
  player.h = 0; player.vh = 0; player.onGround = true;
  player.stumbleT = 0; player.invulnT = 0; player.boostPulse = 0;
  player.trail.primed = false;
  flow = 0; prevEra = 0; rosterNext = 0;
  mode = 'follow'; linked = false; linkTimer = 0;
  path.length = 0; lastPathZ = -1e9;
  removeAllMembers();
  addMember(ROSTER[rosterNext++], 34);
  for (const m of members) m.trail.primed = false;
  toastQueue.length = 0;
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
      toastBusy = 0.55;
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
    reset();
    toast('FROM THE TOP', 1.6);
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === ' ') keys.delete('space');
});

// touch: left/right thirds steer, middle jumps
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

// ---------------------------------------------------------------- physics
const _U = new THREE.Vector3(), _T = new THREE.Vector3(), _F = new THREE.Vector3();
const _right = new THREE.Vector3(), _pos = new THREE.Vector3(), _tmp = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function updatePlayer(dt) {
  const steer = playing ? steerInput() : 0;
  const wobble = player.stumbleT > 0 ? Math.sin(elapsed * 24) * 0.7 : 0;

  // autopilot before the game starts (attract mode behind the title)
  if (!playing) {
    const err = angWrap(corridorTheta(player.z + 10) - player.theta);
    player.psi += (THREE.MathUtils.clamp(err * 2.2, -0.9, 0.9) - player.psi) * Math.min(1, dt * 2);
    player.v += (13 - player.v) * Math.min(1, dt);
  } else {
    const steerRate = (1.7 + player.v * 0.012) * (player.onGround ? 1 : 0.55) * (player.stumbleT > 0 ? 0.4 : 1);
    player.psi += steer * steerRate * dt;
    player.psi -= player.psi * 0.22 * dt;  // gentle straighten
    player.psi = THREE.MathUtils.clamp(player.psi, -1.35, 1.35);

    let vTarget = 23;
    if (keys.has('arrowup') || keys.has('w')) vTarget += 11;
    if (keys.has('arrowdown') || keys.has('s')) vTarget = 12;
    if (linked) vTarget += 2.5;
    if (player.stumbleT > 0) vTarget = Math.min(vTarget, 10);
    player.v += (vTarget - player.v) * Math.min(1, dt * (player.onGround ? 0.9 : 0.25));
    player.v = Math.min(player.v, 46);

    if (keys.has('space') && player.onGround) {
      player.vh = 10.5;
      player.onGround = false;
      keys.delete('space');
    }
  }

  // integrate on the surface
  const prevTheta = player.theta, prevZ = player.z;
  const rEff = R - player.h;
  player.theta += (player.v * Math.sin(player.psi) / rEff) * dt;
  player.z += player.v * Math.cos(player.psi) * dt;

  if (!player.onGround) {
    player.vh -= 26 * dt;
    player.h += player.vh * dt;
  }

  // ground / walls / roofs
  const g = world.groundHeight(player.theta, player.z);
  if (player.onGround) {
    if (g > player.h + 0.6) {
      hitWall(prevTheta, prevZ);
    } else if (g >= player.h - 0.25) {
      player.h = g;
    } else {
      player.onGround = false;  // skated off an edge
      player.vh = 0;
    }
  } else {
    if (player.h < g - 0.45 && player.vh <= 0.01 && g > 0.5) {
      hitWall(prevTheta, prevZ);
      player.vh = Math.min(player.vh, 0);
    } else if (player.vh <= 0 && player.h <= g) {
      player.h = g;
      player.vh = 0;
      player.onGround = true;
    }
    if (player.h < 0) { player.h = 0; player.vh = 0; player.onGround = true; }
  }

  // boost rings
  const ring = world.tryBoost(player.theta, player.z, player.h);
  if (ring) {
    player.v = Math.min(46, player.v + 13);
    player.boostPulse = 1;
    flow += 150;
    audio.boost();
  }

  player.stumbleT = Math.max(0, player.stumbleT - dt);
  player.invulnT = Math.max(0, player.invulnT - dt);
  player.boostPulse = Math.max(0, player.boostPulse - dt * 1.4);

  // record the line you're drawing through the city
  if (player.z - lastPathZ >= 1) {
    path.push({ z: player.z, theta: player.theta });
    lastPathZ = player.z;
    if (path.length > 900) path.splice(0, path.length - 900);
  }

  // pose the rig
  upVec(player.theta, _U);
  tanVec(player.theta, _T);
  _F.copy(Z_AXIS).multiplyScalar(Math.cos(player.psi)).addScaledVector(_T, Math.sin(player.psi)).normalize();
  surfPoint(player.theta, player.z, player.h, _pos);
  player.rig.root.position.copy(_pos);
  _right.crossVectors(_U, _F);
  quatFromBasis(_right, _U, _F, player.rig.root.quaternion);
  player.rig.animate(elapsed, player.v, steerInput() + wobble);

  // skate trail from the feet
  _tmp.copy(_pos).addScaledVector(_U, 0.25);
  player.trail.update(dt, _tmp);

  if (playing) {
    const mult = mode === 'leading' ? 5 : linked ? 3 : 1;
    flow += dt * player.v * 0.6 * mult;
  }
}

function hitWall(prevTheta, prevZ) {
  player.theta = prevTheta;
  player.z = prevZ;
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
  if (!members.length) return;
  const leader = members[0];

  if (mode === 'follow' && playing && player.z > leader.z + 4) {
    mode = 'leading';
    toast('YOU LEAD THE NIGHT', 2.0);
    audio.link();
  } else if (mode === 'leading' && leader.z > player.z + 2) {
    mode = 'follow';
  }

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    m.prevZ = m.z; m.prevTheta = m.theta;

    let zT, thT;
    if (mode === 'leading') {
      zT = player.z - 8 - i * 6;
      thT = pathTheta(zT);
    } else if (i === 0) {
      const lead = leader.z - player.z;
      const vL = THREE.MathUtils.clamp(player.v + (30 - lead) * 0.35, 6, 44);
      m.z += vL * dt;
      m.speed = vL;
      zT = m.z;
      thT = corridorTheta(m.z);
    } else {
      zT = leader.z - i * 6;
      thT = corridorTheta(zT);
    }
    thT += Math.sin(elapsed * 0.7 + m.weavePhase) * 0.018 * (i % 2 ? 1 : -1);

    if (mode === 'leading' || i > 0) {
      m.z += (zT - m.z) * Math.min(1, dt * 2.6);
      m.speed = Math.abs(zT - m.z) > 0.5 ? player.v : m.speed;
    }
    m.theta += angWrap(thT - m.theta) * Math.min(1, dt * 2.2);

    const g = world.groundHeight(m.theta, m.z);
    m.h += (g - m.h) * Math.min(1, dt * 6);

    // derive heading for the pose
    const dz = Math.max(1e-4, m.z - m.prevZ);
    const dth = angWrap(m.theta - m.prevTheta) * (R - m.h);
    m.psi = Math.atan2(dth, dz);

    upVec(m.theta, _U);
    tanVec(m.theta, _T);
    _F.copy(Z_AXIS).multiplyScalar(Math.cos(m.psi)).addScaledVector(_T, Math.sin(m.psi)).normalize();
    surfPoint(m.theta, m.z, m.h, _pos);
    m.rig.root.position.copy(_pos);
    _right.crossVectors(_U, _F);
    quatFromBasis(_right, _U, _F, m.rig.root.quaternion);
    m.rig.animate(elapsed + m.weavePhase, m.speed ?? 20, m.psi * 0.8);

    _tmp.copy(_pos).addScaledVector(_U, 0.25);
    m.trail.update(dt, _tmp);
  }

  // hand-hold chain inside the pack
  for (let i = 0; i < links.length; i++) {
    const a = members[i], b = members[i + 1];
    if (!a || !b) continue;
    handPoint(a, _pos);
    handPoint(b, _tmp);
    links[i].set(_pos, _tmp, 0.32 + Math.sin(elapsed * 5 + i) * 0.1);
  }

  // closeness + linking
  const anchor = mode === 'leading' ? members[0] : members[members.length - 1];
  const dz = anchor.z - player.z;
  const darc = angWrap(anchor.theta - player.theta) * R;
  const d = Math.hypot(dz, darc);

  if (playing && mode === 'follow') {
    if (d < 14) {
      linkTimer += dt;
      if (!linked && linkTimer > 0.8) {
        linked = true;
        audio.link();
        toast('LINKED — HOLD ON', 1.6);
      }
    } else {
      linkTimer = 0;
      if (linked && d > 22) {
        linked = false;
        audio.unlink();
      }
    }
  }

  if (linked && mode === 'follow') {
    handPoint(player, _pos);
    handPoint(anchor, _tmp);
    playerLink.set(_pos, _tmp, 0.5 + Math.sin(elapsed * 6) * 0.25);
  } else {
    playerLink.line.material.opacity *= 0.9;
  }

  return d;
}

function handPoint(s, out) {
  upVec(s.theta, _U);
  return surfPoint(s.theta, s.z, s.h, out).addScaledVector(_U, 1.35);
}

// era progression + new friends
function updateEra() {
  const e = eraIndex(player.z);
  if (e > prevEra) {
    prevEra = e;
    toast(eraLabel(player.z), 2.8);
    if (rosterNext < ROSTER.length) {
      const rec = ROSTER[rosterNext++];
      addMember(rec, members[0].z + 26);
      toast(`${rec.name} JOINED THE NIGHT`, 2.2);
      audio.join();
    }
  }
}

// ---------------------------------------------------------------- camera
const camPos = new THREE.Vector3(0, -(R - 6), -12);
const camLook = new THREE.Vector3();
const smoothUp = upVec(player.theta, new THREE.Vector3());
const _camTarget = new THREE.Vector3(), _lookTarget = new THREE.Vector3();

function updateCamera(dt) {
  upVec(player.theta, _U);
  tanVec(player.theta, _T);
  _F.copy(Z_AXIS).multiplyScalar(Math.cos(player.psi)).addScaledVector(_T, Math.sin(player.psi)).normalize();
  surfPoint(player.theta, player.z, player.h, _pos);

  _camTarget.copy(_pos).addScaledVector(_U, 4.4).addScaledVector(_F, -8.8);
  _lookTarget.copy(_pos).addScaledVector(_U, 1.9).addScaledVector(_F, 9);

  camPos.lerp(_camTarget, 1 - Math.exp(-6.5 * dt));
  camLook.lerp(_lookTarget, 1 - Math.exp(-8 * dt));
  smoothUp.lerp(_U, 1 - Math.exp(-4.5 * dt)).normalize();

  shake = Math.max(0, shake - dt * 1.4);
  _right.crossVectors(smoothUp, _F);
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
  el.era.textContent = eraLabel(player.z);
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
addMember(ROSTER[rosterNext++], 34);

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.034, clock.getDelta());
  elapsed += dt;

  updatePlayer(dt);
  const d = updatePack(dt) ?? 999;
  updateEra();
  updateCamera(dt);
  updateToasts(dt);
  if (playing) updateHud(d);
  world.update(dt, player.z, scene, camera, ambient, sunLight);

  sunLight.position.set(0, 0, player.z + 400);
  sunLight.target.position.set(_pos.x, _pos.y, player.z);

  audio.setSpeed(player.v, !player.onGround);

  // expose state for automation/tests
  window.__game = {
    playing, z: player.z, theta: player.theta, psi: player.psi, v: player.v,
    h: player.h, onGround: player.onGround, mode, linked, flow: Math.floor(flow),
    era: eraIndex(player.z), pack: members.length, packDist: d,
  };

  renderer.render(scene, camera);
}
frame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
