// motion.js — a procedural locomotion controller for the hero skater.
// No keyframe clips: every joint is solved each frame from physics state,
// borrowing from robotics and modern game animation:
//   - analytic two-bone leg IK with pole vectors -> feet PLANT on the surface
//   - gait-phase oscillator (CPG-style) -> stroke cycle tracks true speed
//   - balance from real dynamics -> lean = atan(v*omega / g), not input
//   - head stabilization (VOR) -> the head stays more level than the body
//   - critically-damped springs on every target -> no pops, ever
// All math runs in root-local space (+Y = surface normal, +Z = facing), so
// walls, ceilings and corners need no special cases. Bone-local frames are
// never guessed: every solve measures the live pose and conjugates a world
// rotation into the bone (the armBases trick, generalized).
import * as THREE from 'three';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
// entry copies for helpers — callers pass shared temps, so helpers must
// never write to a temp before consuming their arguments
const _sf1 = new THREE.Vector3(), _sf2 = new THREE.Vector3();
const _sl1 = new THREE.Vector3(), _sl2 = new THREE.Vector3();
// straddle temps: per-foot plane transform during corners
const _qf = new THREE.Quaternion();
const _st1 = new THREE.Vector3(), _st2 = new THREE.Vector3(), _st3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// layered sines read as organic micro-noise (balance corrections, breath)
function noise(t, seed = 0) {
  return Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.13 + seed * 2.7) * 0.4;
}

// All joint math happens in PARENT-LOCAL space. World-quaternion decompose
// proved unreliable on this rig (conjugated deltas silently no-opped once
// the root left the identity orientation), so: the current child direction
// comes from pure local transforms, the desired world direction is pulled
// into parent space through the inverted parent matrix, and the rotation is
// premultiplied onto the bone's local quaternion. No decompose anywhere.
const _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4();

// rotate `bone` so the direction to `child` becomes `dirWorld`
function aim(bone, child, dirWorld) {
  bone.updateMatrix();
  _v2.copy(child.position).applyMatrix4(bone.matrix).sub(bone.position).normalize();
  bone.parent.updateWorldMatrix(true, false);
  _m2.copy(bone.parent.matrixWorld).invert();
  _v3.copy(dirWorld).transformDirection(_m2);
  _q1.setFromUnitVectors(_v2, _v3);
  bone.quaternion.premultiply(_q1);
  bone.updateWorldMatrix(false, true);
  if (typeof window !== 'undefined' && window.__traceAim) {
    const pa = bone.getWorldPosition(new THREE.Vector3());
    const pb = child.getWorldPosition(new THREE.Vector3());
    const got = pb.sub(pa).normalize();
    (window.__aimLog = window.__aimLog || []).push({
      bone: bone.name.slice(-12),
      want: dirWorld.toArray().map(v => +v.toFixed(2)),
      got: got.toArray().map(v => +v.toFixed(2)),
      dot: +got.dot(dirWorld).toFixed(3),
    });
  }
}

// rotate `bone` about world-space axes by angles: pairs = [[axisW, ang], ...]
function nudgeAxes(bone, pairs) {
  bone.parent.updateWorldMatrix(true, false);
  _m2.copy(bone.parent.matrixWorld).invert();
  _q3.identity();
  for (const [axisW, ang] of pairs) {
    if (!ang) continue;
    _v3.copy(axisW).transformDirection(_m2);
    _q1.setFromAxisAngle(_v3, ang);
    _q3.multiply(_q1);
  }
  bone.quaternion.premultiply(_q3);
  bone.updateWorldMatrix(false, true);
}

export class SkaterMotion {
  constructor(root, model, bones) {
    this.root = root;
    this.model = model;
    this.b = bones;

    model.updateMatrixWorld(true);

    // ---- bind-pose measurement (root quat is identity here)
    const wp = (bone) => bone.getWorldPosition(new THREE.Vector3());
    this.bind = {};
    for (const k in bones) {
      this.bind[k] = {
        q0: bones[k].getWorldQuaternion(new THREE.Quaternion()),
        p0: wp(bones[k]),
        local: bones[k].quaternion.clone(),
      };
    }
    // hands: first bone child of each forearm (for elbow aim)
    this.hands = {};
    for (const side of ['left', 'right']) {
      const fa = bones[side + 'forearm'];
      this.hands[side] = fa ? fa.children.find(c => c.isBone) ?? null : null;
    }
    const L = (a, b) => this.bind[a].p0.distanceTo(this.bind[b].p0);
    this.thighL = L('leftupleg', 'leftleg');
    this.shinL = L('leftleg', 'leftfoot');
    this.legReach = this.thighL + this.shinL;
    this.ankleH = Math.max(0.05, this.bind.leftfoot.p0.y);
    this.hipW = Math.max(0.085, Math.abs(this.bind.leftupleg.p0.x - this.bind.rightupleg.p0.x) / 2);
    this.sideL = Math.sign(this.bind.leftupleg.p0.x) || 1;   // which world X is "left"
    this.hipY = this.bind.hips.p0.y;
    this.hipsLocal0 = bones.hips.position.clone();
    // world meters -> hips-parent local units
    bones.hips.parent.getWorldPosition(_v1);
    _v1.set(1, 1, 1);
    bones.hips.parent.getWorldScale(_v1);
    this.u = 1 / Math.max(1e-6, _v1.y);

    // ---- runtime state
    this.phase = 0;            // gait phase, [0, 2pi)
    this.lastSupport = 1;      // +1: left foot leads at rest
    this.load = { x: 0, v: 0 };          // pelvis load spring (landings, hops)
    this.roll = 0; this.pitch = 0;       // smoothed balance angles
    this.accelS = 0; this.lastSpeed = 0;
    this.lookYaw = 0; this.headPitch = 0;
    this.corner = { t: 9, asym: 0, hopped: false, oldN: new THREE.Vector3(0, 1, 0), lead: 1 };
    // turning at a standstill: feet hold their world heading and step around
    this.pivot = { yawL: 0, yawR: 0, step: 0, s: 0, shift: 0 };
    this.grazeT = { left: 0, right: 0 };   // arm-hit reactions, per side
    this.wmP = 0;              // windmill phase (stumble arms)
    this.elapsed = 0;
    // smoothed targets: feet (root-local), arm dirs (root-local)
    this.foot = {
      left:  { p: new THREE.Vector3(this.sideL * this.hipW, this.ankleH, 0.02), yaw: 0 },
      right: { p: new THREE.Vector3(-this.sideL * this.hipW, this.ankleH, 0.02), yaw: 0 },
    };
    this.armDir = {
      left:  new THREE.Vector3(this.sideL * 0.34, -0.82, 0.12).normalize(),
      right: new THREE.Vector3(-this.sideL * 0.34, -0.82, 0.12).normalize(),
    };
    this._dbgInfo = { mode: 'idle', footErr: 0 };
  }

  // ---- public events --------------------------------------------------
  startCorner(asym = 0, oldN = null, edgeW = null) {
    this.corner.t = 0;
    this.corner.asym = clamp(asym, -1, 1);
    this.corner.hopped = false;
    if (oldN) this.corner.oldN.copy(oldN).normalize();
    this.corner.edgeW = this.corner.edgeW || new THREE.Vector3();
    if (edgeW) this.corner.edgeW.copy(edgeW); else this.corner.edgeW.copy(this.root.position);
    this.corner.lead = this.lastSupport || this.sideL;
    this.load.v += 1.4;
  }
  land(amt = 0.5) { this.load.v += amt * 2.6; }
  // a hand just clipped something: that arm snaps in for a beat
  graze(side) { if (this.grazeT[side] !== undefined) this.grazeT[side] = 0.45; }

  // ---- helpers ---------------------------------------------------------
  // root-local point -> world (root carries no scale)
  toWorld(p, out) { return out.copy(p).applyMatrix4(this.root.matrixWorld); }
  // root-local dir -> world
  dirW(d, out) { return out.copy(d).applyQuaternion(this.root.quaternion); }

  // set a bone's world orientation to (bind orientation rotated by frame R),
  // where R maps bind axes to a desired root-local frame, lifted to world.
  // Matrix-only path: local = invert(parentWorld) * R * bindWorld, columns
  // re-normalized to strip the parent's uniform scale.
  setFrame(boneKey, fwdL, upL) {
    const bone = this.b[boneKey];
    if (!bone) return;
    _sf1.copy(fwdL);
    _sf2.copy(upL);
    this.dirW(_sf2, _v1).normalize();
    this.dirW(_sf1, _v2);
    _v3.crossVectors(_v1, _v2);
    if (_v3.lengthSq() < 1e-8) return;
    _v3.normalize();
    _v2.crossVectors(_v3, _v1);
    _m1.makeBasis(_v3, _v1, _v2);                       // desired world rotation
    _m2.makeRotationFromQuaternion(this.bind[boneKey].q0);
    _m1.multiply(_m2);                                   // R * bindWorld
    bone.parent.updateWorldMatrix(true, false);
    _m3.copy(bone.parent.matrixWorld).invert().multiply(_m1);
    // strip scale: normalize the basis columns, then read the rotation
    const e = _m3.elements;
    for (let c = 0; c < 3; c++) {
      const i = c * 4;
      const n = 1 / Math.hypot(e[i], e[i + 1], e[i + 2]);
      e[i] *= n; e[i + 1] *= n; e[i + 2] *= n;
    }
    bone.quaternion.setFromRotationMatrix(_m3);
    bone.updateWorldMatrix(false, true);
  }

  // analytic two-bone leg IK: ankle to `target` (world), knee toward `pole`
  solveLeg(side, target, pole) {
    const hip = this.b[side + 'upleg'], knee = this.b[side + 'leg'], foot = this.b[side + 'foot'];
    if (!hip || !knee || !foot) return;
    _sl1.copy(target);
    _sl2.copy(pole);
    hip.getWorldPosition(_v1);
    _v2.copy(_sl1).sub(_v1);
    const d = clamp(_v2.length(), 0.02, this.legReach * 0.995);
    _v2.normalize();
    // plane normal: rotating dir about it by +alpha bows the knee toward pole
    _v3.crossVectors(_v2, _sl2);
    if (_v3.lengthSq() < 1e-6) _v3.crossVectors(_v2, X);
    _v3.normalize();
    const L1 = this.thighL, L2 = this.shinL;
    const alpha = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    _v4.copy(_v2).applyAxisAngle(_v3, alpha);
    aim(hip, knee, _v4);
    knee.getWorldPosition(_v5);
    _v6.copy(_sl1).sub(_v5).normalize();
    aim(knee, foot, _v6);
    if (typeof window !== 'undefined' && window.__traceIK && side === 'left') {
      const fp = foot.getWorldPosition(new THREE.Vector3());
      const kp = knee.getWorldPosition(new THREE.Vector3());
      const hp = hip.getWorldPosition(new THREE.Vector3());
      this._dbgInfo.solve = {
        d: +d.toFixed(3), alpha: +(alpha * 57.3).toFixed(0),
        thighDirWant: _v4.toArray().map(v => +v.toFixed(2)),
        thighDirGot: kp.clone().sub(hp).normalize().toArray().map(v => +v.toFixed(2)),
        shinWant: _v6.toArray().map(v => +v.toFixed(2)),
        shinGot: fp.clone().sub(kp).normalize().toArray().map(v => +v.toFixed(2)),
        tgt: _sl1.toArray().map(v => +v.toFixed(2)),
        foot: fp.toArray().map(v => +v.toFixed(2)),
      };
    }
  }

  // ---- the controller ---------------------------------------------------
  // ctx: { speed, turn, crouch, stumble, grounded, pushing, braking,
  //        gliding, diving }
  update(dt, t, ctx) {
    const b = this.b;
    this.elapsed = t;
    // the pose is a pure function of state: every mapped bone restarts from
    // its bind rotation each frame, so per-frame offsets can NEVER accumulate
    // (the spine once folded itself into the pelvis within a second of load)
    for (const k in b) b[k].quaternion.copy(this.bind[k].local);
    // one consistent frame: root pose was just written by poseRig
    this.root.updateMatrixWorld(true);
    const speed = ctx.speed || 0;
    const grounded = ctx.grounded !== false;
    const crouch = ctx.crouch || 0;
    const stumble = clamp((ctx.stumble || 0) / 0.9, 0, 1);
    const pushing = !!ctx.pushing && grounded;
    const braking = !!ctx.braking && grounded && speed > 2.5;
    const moving = speed > 2.2;

    // ---- balance from real dynamics
    const aLat = speed * (ctx.turn || 0);                  // centripetal
    this.accelS += ((speed - this.lastSpeed) / Math.max(dt, 1e-4) - this.accelS) * Math.min(1, dt * 4);
    this.lastSpeed = speed;
    const rollTgt = grounded ? clamp(Math.atan2(aLat, 9.81) * 1.15, -0.6, 0.6) : 0;
    // launching from a standstill: the first pushes drive deeper and lower
    const launch = pushing && grounded ? clamp((4.5 - speed) / 4.5, 0, 1) : 0;
    const basePitch = grounded && moving ? 0.10 + Math.min(0.16, speed * 0.005) : 0.02;
    const pitchTgt = basePitch + clamp(this.accelS, -8, 8) * 0.02 + crouch * 0.34
      + launch * 0.11
      + (braking ? -0.16 : 0) + (!grounded ? (ctx.diving ? 0.5 : 0.12) : 0);
    this.roll += (rollTgt - this.roll) * Math.min(1, dt * 7);
    this.pitch += (pitchTgt - this.pitch) * Math.min(1, dt * 7);

    // ---- load spring (landings, corner hops) — pelvis dips, knees absorb
    this.load.v += (-90 * this.load.x - 14 * this.load.v) * dt;
    this.load.x = clamp(this.load.x + this.load.v * dt, -0.08, 0.30);

    // ---- corner pulse (the feet do the storytelling now — see straddle)
    let hop = 0, flare = 0, cornerKnee = 0;
    if (this.corner.t < 1) {
      this.corner.t = Math.min(1, this.corner.t + dt / 0.62);
      const ph = this.corner.t;
      hop = Math.sin(Math.PI * clamp((ph - 0.14) / 0.62, 0, 1)) * 0.10;
      flare = Math.sin(Math.PI * ph);
      cornerKnee = ph < 0.16 ? ph / 0.16 * 0.10 : 0;
      if (!this.corner.hopped && ph > 0.62) { this.corner.hopped = true; this.load.v += 1.2; }
    }

    // ---- gait phase (strokes pause while stepping across a corner)
    const inCorner = this.corner.t < 1;
    const effort = pushing ? clamp(1.15 - speed / 38, 0.4, 1) : 0;
    if (pushing && moving && !inCorner) {
      const freq = clamp(0.55 + speed * 0.052, 0.6, 2.0);
      this.phase = (this.phase + 2 * Math.PI * freq * dt) % (2 * Math.PI);
    } else {
      // glide the phase to the nearest rest point so legs settle, never snap
      const rest = this.phase < Math.PI ? Math.PI * 0.5 : Math.PI * 1.5;
      this.phase += (rest - this.phase) * Math.min(1, dt * 4);
    }
    const pushSide = this.phase < Math.PI ? this.sideL : -this.sideL;  // who strokes
    const supSide = -pushSide;                                          // who glides
    const u = (this.phase % Math.PI) / Math.PI;                         // 0..1 in stroke

    // ---- pelvis (COM)
    const rideY = this.hipY * (moving ? lerp(0.92, 0.84, clamp(speed / 26, 0, 1)) : 0.97) - launch * 0.05
      - crouch * 0.24 - this.load.x - cornerKnee
      + hop
      + (!grounded ? 0.05 : 0)
      + noise(t * 0.9, 3) * 0.004;
    const strokeBob = pushing ? Math.sin(this.phase * 2) * 0.018 * effort : 0;
    // weight rides the gliding (support) foot — and the planted foot
    // during pivot steps (pivot.shift is written by the feet pass below)
    const weightX = grounded
      ? supSide * (pushing ? 0.045 * Math.sin(u * Math.PI) : 0)
        + (moving ? 0 : this.sideL * noise(t * 0.45, 7) * 0.030)
        + this.pivot.shift
      : 0;
    const pelvX = weightX + noise(t * 0.7, 1) * 0.003;
    const pelvZ = (braking ? -0.05 : 0.01) + this.pitch * -0.05;

    // place the pelvis in world space — FBX armatures hide axis conversions
    // in the bone's parent, so local-axis writes are never trusted
    const hips = b.hips;
    this.toWorld(_v1.set(pelvX, rideY + strokeBob, pelvZ), _v2);
    _m1.copy(hips.parent.matrixWorld).invert();
    hips.position.copy(_v2.applyMatrix4(_m1));

    // pelvis orientation: lean into the turn, pitch with stance, hips sway
    const pelvYaw = (pushing ? pushSide * 0.07 * Math.sin(u * Math.PI) : 0) + (ctx.turn || 0) * 0.06;
    _q1.setFromAxisAngle(Y, pelvYaw);
    _q2.setFromAxisAngle(X, this.pitch * 0.55);
    _q1.multiply(_q2);
    _q2.setFromAxisAngle(Z, this.roll * 0.65);
    _q1.multiply(_q2);
    _v1.copy(Z).applyQuaternion(_q1);
    _v2.copy(Y).applyQuaternion(_q1);
    this.setFrame('hips', _v1, _v2);

    // ---- spine chain: distribute the remaining lean, shoulders counter hips
    const chest = ['spine', 'spine1', 'spine2'].filter(k => b[k]);
    const rollRem = this.roll * 0.5 / Math.max(1, chest.length);
    const pitchRem = (this.pitch * 0.6 + crouch * 0.3) / Math.max(1, chest.length);
    const counterYaw = -pelvYaw * 1.5 + (ctx.turn || 0) * 0.10 + (pushing ? -pushSide * 0.05 * Math.sin(u * Math.PI) : 0);
    for (let i = 0; i < chest.length; i++) {
      const k = chest[i];
      this.dirW(Z, _v4);
      this.dirW(Y, _v5);
      this.dirW(X, _v6);
      nudgeAxes(b[k], [
        [_v4, rollRem],
        [_v6, pitchRem + (i === 0 ? noise(t * 0.8, 11) * 0.006 : 0)],
        [_v5, i === chest.length - 1 ? counterYaw : 0],
      ]);
    }

    // ---- feet targets (root-local)
    const fl = this.foot.left, fr = this.foot.right;
    const tgtFor = (side) => (side === this.sideL ? fl : fr);
    const setTgt = (side, x, y, z, yaw, planted) => {
      const f = tgtFor(side);
      const k = planted ? 26 : 15;
      f.p.x += (x - f.p.x) * Math.min(1, dt * k);
      f.p.z += (z - f.p.z) * Math.min(1, dt * k);
      // grounded feet snap to the plane — floating feet are the #1 tell
      if (planted) f.p.y = y; else f.p.y += (y - f.p.y) * Math.min(1, dt * 18);
      f.yaw += (yaw - f.yaw) * Math.min(1, dt * 12);
    };

    this._dbgInfo.mode =
      !grounded ? (ctx.gliding ? 'glide' : ctx.diving ? 'dive' : 'air')
      : braking ? 'brake'
      : pushing && moving ? 'stroke'
      : moving ? 'coast' : 'idle';

    if (!grounded) {
      // tucked under the body, knees forward; dive pulls tighter
      const tuck = ctx.diving || crouch > 0.5 ? 0.62 : ctx.gliding ? 0.38 : 0.5;
      const reach = rideY - this.legReach * (1 - tuck * 0.45);
      setTgt(this.sideL, this.sideL * this.hipW * 1.05, Math.max(0.1, reach), 0.10, 0, false);
      setTgt(-this.sideL, -this.sideL * this.hipW * 0.95, Math.max(0.1, reach + 0.09), -0.06, 0, false);
    } else if (braking) {
      // T-stop: front foot rolls on, rear foot turns out and drags
      const rear = -this.lastSupport;
      setTgt(-rear, -rear * this.hipW * 0.8, this.ankleH, 0.16, 0, true);
      setTgt(rear, rear * this.hipW * 1.25, this.ankleH, -0.20, rear * 1.25, true);
    } else if (pushing && moving) {
      this.lastSupport = supSide;
      // support glides under the COM, riding its edge
      setTgt(supSide, supSide * this.hipW * (0.5 + 0.12 * Math.sin(u * Math.PI)),
        this.ankleH, 0.06 - 0.10 * u, 0, true);
      // stroke: drive out and back along the ground, then a low recovery arc
      if (u < 0.58) {
        const s = u / 0.58;
        setTgt(pushSide,
          pushSide * this.hipW * (0.7 + 1.9 * s * effort),
          this.ankleH,
          0.10 - 0.45 * s * effort,
          pushSide * (0.28 + launch * 0.3) * s, true);
      } else {
        const s = (u - 0.58) / 0.42;
        setTgt(pushSide,
          pushSide * this.hipW * (0.7 + 1.9 * effort * (1 - s)),
          this.ankleH + 0.07 * Math.sin(Math.PI * s),
          -0.35 * effort + (0.45 * effort + 0.12) * s,
          pushSide * 0.28 * (1 - s), false);
      }
    } else if (moving) {
      // coast: easy scissor on the last support
      const lead = this.lastSupport;
      setTgt(lead, lead * this.hipW * 0.62, this.ankleH, 0.13, 0, true);
      setTgt(-lead, -lead * this.hipW * 0.66, this.ankleH, -0.08, 0, true);
    } else {
      // idle / pivot. There is no such thing as rotating in place on
      // skates: planted feet HOLD their world heading while the body turns
      // (counter-yawing in body space), and when one lags too far behind
      // it lifts and steps around — alternating little pivot steps.
      const pv = this.pivot;
      const turn = ctx.turn || 0;
      const turning = Math.abs(turn) > 0.25;
      if (pv.step !== this.sideL) pv.yawL -= turn * dt;
      if (pv.step !== -this.sideL) pv.yawR -= turn * dt;
      if (!turning && !pv.step) {
        pv.yawL *= Math.max(0, 1 - dt * 2.5);
        pv.yawR *= Math.max(0, 1 - dt * 2.5);
      }
      const lagL = Math.abs(pv.yawL), lagR = Math.abs(pv.yawR);
      if (!pv.step && turning && Math.max(lagL, lagR) > 0.6) {
        pv.step = lagL >= lagR ? this.sideL : -this.sideL;
        pv.s = 0;
      }
      if (pv.step) {
        pv.s = Math.min(1, pv.s + dt / 0.15);
        const k = 0.5 - 0.5 * Math.cos(Math.PI * pv.s);
        // the stepping foot swings around to land well ahead of the turn —
        // big deliberate steps, not a frantic shuffle
        const tgtYaw = turning ? 0.35 * Math.sign(turn) : 0;
        if (pv.step === this.sideL) pv.yawL = lerp(pv.yawL, tgtYaw, k);
        else pv.yawR = lerp(pv.yawR, tgtYaw, k);
        if (pv.s >= 1) { this.load.v += 0.3; pv.step = 0; }
      }
      // weight rides whichever foot is planted while the other swings
      const wantShift = pv.step ? -pv.step * 0.05 * Math.sin(Math.PI * pv.s) : 0;
      pv.shift += (wantShift - pv.shift) * Math.min(1, dt * 10);
      const place = (side, yaw, stepping) => {
        _v6.set(side * (this.hipW * 0.78 + noise(t * 0.3, side * 5) * 0.008), 0,
          side === this.sideL ? 0.03 : -0.01);
        _v6.applyAxisAngle(Y, yaw);
        const lift = stepping ? Math.sin(Math.PI * pv.s) * 0.07 : 0;
        setTgt(side, _v6.x, this.ankleH + lift, _v6.z,
          yaw + side * 0.055, !stepping);
      };
      place(this.sideL, pv.yawL, pv.step === this.sideL);
      place(-this.sideL, pv.yawR, pv.step === -this.sideL);
    }
    // leaving the standstill cancels any half-taken pivot step
    if (moving || !grounded || braking) {
      this.pivot.step = 0;
      this.pivot.yawL *= Math.max(0, 1 - dt * 6);
      this.pivot.yawR *= Math.max(0, 1 - dt * 6);
      this.pivot.shift *= Math.max(0, 1 - dt * 6);
    }

    // stumble: quick lateral catch-steps under a wobbling body
    if (stumble > 0.05 && grounded) {
      const catchX = Math.sin(t * 9.1) * 0.08 * stumble;
      fl.p.x += catchX * dt * 22;
      fr.p.x += catchX * dt * 22;
    }

    // ---- surface straddle: through a corner each foot crosses on its own
    // beat. The lead foot steps onto the new plane while the trail foot is
    // still flat on the old one — for a moment she straddles the edge, then
    // the trail foot steps across. No more both-feet-magnetized-at-once.
    let strad = null;
    if (inCorner && this.corner.edgeW) {
      _q2.copy(this.root.quaternion).invert();
      _st1.copy(this.corner.oldN).applyQuaternion(_q2).normalize();
      const ang = Math.acos(clamp(_st1.dot(Y), -1, 1));
      if (ang > 0.03) {
        _st2.crossVectors(Y, _st1);
        if (_st2.lengthSq() < 1e-6) _st2.copy(X);
        this.strad = this.strad || { axis: new THREE.Vector3(), ang: 0, edge: new THREE.Vector3() };
        this.strad.axis.copy(_st2.normalize());
        this.strad.ang = ang;
        // the physical corner edge, in root-local space — the old-plane foot
        // stays anchored here while the body travels onto the new surface
        this.strad.edge.copy(this.corner.edgeW).sub(this.root.position).applyQuaternion(_q2);
        strad = this.strad;
      }
    }
    this._dbgInfo.straddle = strad ? +strad.ang.toFixed(2) : 0;

    // ---- solve legs (world space)
    const stage = (typeof window !== 'undefined' && window.__motionStage) || 9;
    this.model.updateMatrixWorld(true);
    if (stage >= 3) for (const side of [this.sideL, -this.sideL]) {
      const key = side === this.sideL ? 'left' : 'right';
      const f = side === this.sideL ? fl : fr;
      // the foot's own plane: identity on the new surface; during a corner
      // it stays rolled back onto the old plane until its step window,
      // lifting through a small arc as it crosses
      _qf.identity();
      let lift = 0;
      if (strad) {
        const lead = side === this.corner.lead;
        const a0 = lead ? 0.04 : 0.30, a1 = lead ? 0.28 : 0.58;
        const s = clamp((this.corner.t - a0) / (a1 - a0), 0, 1);
        const k = 0.5 - 0.5 * Math.cos(Math.PI * s);
        // full old-plane pose: the stance offset (body travel stripped)
        // rotated onto the old surface, anchored at the receding edge —
        // the leg stretches back to the ground it came from
        _qf.setFromAxisAngle(strad.axis, strad.ang);
        _st1.set(f.p.x, f.p.y, clamp(f.p.z, -0.3, 0.3))
          .applyQuaternion(_qf).add(strad.edge);
        _st1.lerp(f.p, k);                          // the step across
        _qf.setFromAxisAngle(strad.axis, strad.ang * (1 - k));
        lift = Math.sin(Math.PI * s) * 0.12;
      } else {
        _st1.copy(f.p);
      }
      _st2.copy(Y).applyQuaternion(_qf);
      _st1.addScaledVector(_st2, lift);
      this.toWorld(_st1, _st3);
      this.dirW(_st1.set(side * 0.35, 0, 1).normalize().applyQuaternion(_qf), _v4);
      this.solveLeg(key, _st3, _v4);
      // foot frame: flat on its own plane, toes along travel (+ stroke yaw)
      if (stage >= 4) {
        _st1.copy(Z).applyAxisAngle(Y, f.yaw).applyQuaternion(_qf);
        _st2.copy(Y).applyQuaternion(_qf);
        this.setFrame(key + 'foot', _st1, _st2);
      }
      if (this._dbgInfo) {
        this.b[key + 'foot'].getWorldPosition(_v6);
        this._dbgInfo['post_' + key] = +_v6.distanceTo(_st3).toFixed(3);
      }
    }

    // ---- arms: spring-driven direction targets
    this.wmP += dt * (9 + stumble * 4);
    if (stage >= 5) for (const side of [this.sideL, -this.sideL]) {
      const key = side === this.sideL ? 'left' : 'right';
      const cur = this.armDir[key];
      // base carry, breathing
      _v1.set(side * (0.36 + noise(t * 0.5, side * 13) * 0.02), -0.80, 0.10 + this.pitch * 0.3);
      if (pushing && moving) {
        // arms swing counter to the stroke
        _v1.z += (side === pushSide ? 1 : -1) * 0.22 * Math.sin(u * Math.PI) * effort;
        _v1.y += 0.06 * Math.sin(u * Math.PI) * effort;
      }
      if (braking) _v1.set(side * 0.5, -0.70, 0.34);
      if (!grounded) {
        _v1.set(side * 0.95, -0.12, 0.04);                       // wings
        if (ctx.diving) _v1.set(side * 0.42, -0.5, -0.55);       // swept back
      }
      if (flare > 0) _v1.lerp(_v2.set(side * 0.95, -0.10, 0.05), flare * 0.6);
      // carve: the whole carry frame banks with the body roll
      _v1.applyAxisAngle(Z, this.roll * 0.9);
      // stumble: windmill
      if (stumble > 0.05) {
        _v2.set(side * 0.55, -0.15 + 0.55 * Math.sin(this.wmP + side), 0.5 * Math.cos(this.wmP + side));
        _v1.lerp(_v2, stumble * 0.85);
      }
      // graze: the clipped arm yanks in fast, then releases
      const gz = this.grazeT[key];
      if (gz > 0) {
        this.grazeT[key] = Math.max(0, gz - dt);
        const e = Math.min(1, gz / 0.45);
        _v1.lerp(_v2.set(side * 0.10, -0.70, 0.22), 0.85 * e);
      }
      _v1.normalize();
      cur.lerp(_v1, Math.min(1, dt * (9 + (gz > 0 ? 26 : 0)))).normalize();
      this.dirW(cur, _v3);
      const arm = b[key + 'arm'], fore = b[key + 'forearm'], hand = this.hands[key];
      if (arm && fore) {
        aim(arm, fore, _v3);
        if (hand) {
          // elbow: bend the forearm toward the body's forward
          const flex = 0.30 + (braking ? 0.25 : 0) + (pushing ? 0.15 * Math.sin(u * Math.PI) : 0)
            + (!grounded && !ctx.diving ? -0.18 : 0) + stumble * 0.3;
          this.dirW(_v4.copy(cur).multiplyScalar(1 - flex * 0.4).addScaledVector(Z, flex).normalize(), _v5);
          aim(fore, hand, _v5);
        }
      }
    }

    // ---- head: stabilized gaze, looking through the turn
    if (stage < 6) { this._dbgFinish(); return; }
    const lookTgt = clamp((ctx.turn || 0) * 0.55, -0.5, 0.5) + noise(t * 0.33, 21) * 0.04;
    this.lookYaw += (lookTgt - this.lookYaw) * Math.min(1, dt * 6);
    const hpTgt = !grounded ? (ctx.diving ? 0.35 : -0.15) : crouch * 0.15 + stumble * 0.14 - this.pitch * 0.55;
    this.headPitch += (hpTgt - this.headPitch) * Math.min(1, dt * 5);
    // VOR: the head cancels most of the body roll to keep the horizon level
    _v2.copy(Y).applyAxisAngle(Z, this.roll * 0.30);            // only 30% of body roll
    _v1.copy(Z).applyAxisAngle(Y, this.lookYaw);
    _v1.applyAxisAngle(X, -this.headPitch);
    this.setFrame('head', _v1, _v2);
    if (b.neck) {
      this.dirW(_v3.copy(Y), _v4);
      nudgeAxes(b.neck, [[_v4, this.lookYaw * 0.35]]);
    }

    this._dbgFinish();
  }

  _dbgFinish() {
    if (this.b.leftfoot) {
      this.toWorld(this.foot.left.p, _v5);
      this.b.leftfoot.getWorldPosition(_v6);
      this._dbgInfo.footErr = +_v6.distanceTo(_v5).toFixed(3);
    }
  }

  dbg() {
    const kneeDeg = (side) => {
      const hip = this.b[side + 'upleg'], knee = this.b[side + 'leg'], foot = this.b[side + 'foot'];
      if (!hip || !knee || !foot) return null;
      hip.getWorldPosition(_v1); knee.getWorldPosition(_v2); foot.getWorldPosition(_v3);
      _v4.copy(_v1).sub(_v2).normalize();
      _v5.copy(_v3).sub(_v2).normalize();
      return Math.round(THREE.MathUtils.radToDeg(Math.acos(clamp(_v4.dot(_v5), -1, 1))));
    };
    const hipW = this.b.leftupleg.getWorldPosition(new THREE.Vector3());
    const footW = this.b.leftfoot.getWorldPosition(new THREE.Vector3());
    const tgtW = this.toWorld(this.foot.left.p, new THREE.Vector3());
    return {
      mode: this._dbgInfo.mode,
      footErr: this._dbgInfo.footErr,
      post: { l: this._dbgInfo.post_left, r: this._dbgInfo.post_right },
      solve: this._dbgInfo.solve ?? null,
      kneeL: kneeDeg('left'), kneeR: kneeDeg('right'),
      phase: +this.phase.toFixed(2),
      roll: +this.roll.toFixed(2), pitch: +this.pitch.toFixed(2),
      load: +this.load.x.toFixed(2),
      pivot: { yL: +this.pivot.yawL.toFixed(2), yR: +this.pivot.yawR.toFixed(2), step: this.pivot.step, s: +this.pivot.s.toFixed(2) },
      geo: {
        thighL: +this.thighL.toFixed(3), shinL: +this.shinL.toFixed(3),
        ankleH: +this.ankleH.toFixed(3), hipW: +this.hipW.toFixed(3),
        hipBindY: +this.hipY.toFixed(3), u: +this.u.toFixed(1), sideL: this.sideL,
      },
      live: {
        hip: hipW.toArray().map(v => +v.toFixed(2)),
        foot: footW.toArray().map(v => +v.toFixed(2)),
        tgt: tgtW.toArray().map(v => +v.toFixed(2)),
        tgtLocal: this.foot.left.p.toArray().map(v => +v.toFixed(2)),
        d: +hipW.distanceTo(tgtW).toFixed(3),
      },
    };
  }
}
