// surface.js — locomotion on axis-aligned architecture.
// The skater's "down" is whatever face they're on. Run off an edge and you
// wrap around it (roof -> facade -> underside); skate into a tall wall and
// you ride up it. All geometry is AABBs, which keeps the math exact.
import * as THREE from 'three';

export function comp(v, a) { return v.getComponent(a); }
export function axisOf(v) {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  return ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
}
export function axisVec(a, s, out = new THREE.Vector3()) {
  out.set(0, 0, 0);
  out.setComponent(a, s);
  return out;
}

// Find the face supporting p along -n (normal == n), within maxDrop below feet.
// Boxes with a `rot` record are rotating platforms: y-extents are world-space,
// x/z bounds live in the platform's local (yawed) frame; only their horizontal
// faces support.
export function support(boxes, p, n, maxDrop = 0.9, grow = 0.06) {
  const a = axisOf(n);
  const s = comp(n, a) >= 0 ? 1 : -1;
  let best = null;
  for (const b of boxes) {
    if (b.rot && a !== 1) continue;
    const q = s > 0 ? comp(b.max, a) : comp(b.min, a);
    const h = (comp(p, a) - q) * s;
    if (h < -0.08 || h > maxDrop) continue;
    let inside = true;
    if (b.rot) {
      const cy = Math.cos(b.rot.yaw), sy = Math.sin(b.rot.yaw);
      const dx = p.x - b.rot.cx, dz = p.z - b.rot.cz;
      const lx = dx * cy + dz * sy;
      const lz = -dx * sy + dz * cy;
      inside = lx >= b.min.x - grow && lx <= b.max.x + grow &&
               lz >= b.min.z - grow && lz <= b.max.z + grow;
    } else {
      for (let k = 0; k < 3; k++) {
        if (k === a) continue;
        if (comp(p, k) < comp(b.min, k) - grow || comp(p, k) > comp(b.max, k) + grow) {
          inside = false;
          break;
        }
      }
    }
    if (!inside) continue;
    if (!best || h < best.h) best = { box: b, q, h };
  }
  return best;
}

// Swept landing test: which face (normal == n) did the segment from->to
// cross this frame? Checks lateral bounds AT THE CROSSING POINT, so fast
// falls and long glides can't tunnel through roofs, slabs or bridges.
const _sweepPt = new THREE.Vector3();
export function sweepLand(boxes, from, to, n, grow = 0.12) {
  const a = axisOf(n);
  const s = comp(n, a) >= 0 ? 1 : -1;
  const fa = comp(from, a), ta = comp(to, a);
  if ((fa - ta) * s <= 0) return null;        // not descending along -n
  let best = null;
  for (const b of boxes) {
    if (b.rot && a !== 1) continue;
    const q = s > 0 ? comp(b.max, a) : comp(b.min, a);
    const hf = (fa - q) * s, ht = (ta - q) * s;
    if (hf < -0.08 || ht > 0.04) continue;     // plane not crossed downward
    const t = THREE.MathUtils.clamp(hf / Math.max(1e-6, hf - ht), 0, 1);
    _sweepPt.copy(from).lerp(to, t);
    let inside = true;
    if (b.rot) {
      const cy = Math.cos(b.rot.yaw), sy = Math.sin(b.rot.yaw);
      const dx = _sweepPt.x - b.rot.cx, dz = _sweepPt.z - b.rot.cz;
      const lx = dx * cy + dz * sy;
      const lz = -dx * sy + dz * cy;
      inside = lx >= b.min.x - grow && lx <= b.max.x + grow &&
               lz >= b.min.z - grow && lz <= b.max.z + grow;
    } else {
      for (let k = 0; k < 3; k++) {
        if (k === a) continue;
        if (comp(_sweepPt, k) < comp(b.min, k) - grow || comp(_sweepPt, k) > comp(b.max, k) + grow) {
          inside = false;
          break;
        }
      }
    }
    if (!inside) continue;
    if (!best || (q - best.q) * s > 0) best = { box: b, q };  // first plane hit
  }
  return best;
}

// Point containment for flock slot projection (static boxes only).
export function insideBox(p, b, grow = 0) {
  if (b.rot) return false;
  return p.x > b.min.x - grow && p.x < b.max.x + grow &&
         p.y > b.min.y - grow && p.y < b.max.y + grow &&
         p.z > b.min.z - grow && p.z < b.max.z + grow;
}

// Face blocking motion along axis k (sign sk) within dist, rising above the
// feet plane. extent tells how far it rises; small extents are stumbles,
// tall ones are rideable walls.
export function wallAhead(boxes, p, n, k, sk, dist, r = 0.45) {
  const a = axisOf(n);
  const s = comp(n, a) >= 0 ? 1 : -1;
  const c = 3 - a - k;
  let best = null;
  for (const b of boxes) {
    if (b.rot) continue;          // rotating platforms have no side collision
    const q = sk > 0 ? comp(b.min, k) : comp(b.max, k);
    const gap = (q - comp(p, k)) * sk;
    if (gap < -0.25 || gap > dist) continue;
    if (comp(p, c) < comp(b.min, c) - r || comp(p, c) > comp(b.max, c) + r) continue;
    const extent = s > 0 ? comp(b.max, a) - comp(p, a) : comp(p, a) - comp(b.min, a);
    if (extent < 0.25) continue;
    const base = s > 0 ? comp(b.min, a) - comp(p, a) : comp(p, a) - comp(b.max, a);
    if (base > 1.4) continue;   // floating overhead, not a wall at our feet
    if (!best || gap < best.gap) best = { box: b, q, gap, extent };
  }
  return best;
}

const _d = new THREE.Vector3();
const _oldN = new THREE.Vector3();

// Concave: ride up onto a wall blocking axis k. new up = -d, forward's
// blocked component turns upward along the old normal.
export function climb(state, k, sk, q, box) {
  axisVec(k, sk, _d);
  _oldN.copy(state.n);
  const fd = state.f.dot(_d);
  state.f.addScaledVector(_d, -fd).addScaledVector(_oldN, fd);
  if (state.f.lengthSq() < 1e-6) state.f.copy(_oldN);
  state.f.normalize();
  state.p.setComponent(k, q);
  state.p.addScaledVector(_oldN, 0.06);
  state.n.copy(_d).negate();
  state.box = box;
}

// Convex: wrap around the edge we ran off. new up = exit direction,
// forward's exit component turns down the new face.
export function wrap(state, k, sk, bound) {
  axisVec(k, sk, _d);
  _oldN.copy(state.n);
  const fd = state.f.dot(_d);
  state.f.addScaledVector(_d, -fd).addScaledVector(_oldN, -fd);
  if (state.f.lengthSq() < 1e-6) state.f.copy(_oldN).negate();
  state.f.normalize();
  state.p.setComponent(k, bound);
  state.p.addScaledVector(_oldN, -0.06);
  state.n.copy(_d);
}

// One grounded step. Mutates state {p, n, f, box}; reports what happened in
// ev {climbed, wrapped, stumbled, lost}.
export function stepGrounded(boxes, state, dist, ev) {
  const a = axisOf(state.n);
  const move = _stepMove.copy(state.f).multiplyScalar(dist);
  move.setComponent(a, 0);

  const t1 = (a + 1) % 3, t2 = (a + 2) % 3;
  const order = Math.abs(comp(move, t1)) >= Math.abs(comp(move, t2)) ? [t1, t2] : [t2, t1];

  for (const k of order) {
    const mk = comp(move, k);
    if (Math.abs(mk) < 1e-7) continue;
    const sk = mk > 0 ? 1 : -1;
    const w = wallAhead(boxes, state.p, state.n, k, sk, Math.abs(mk) + 0.55);
    if (w && w.gap <= Math.abs(mk) + 0.5) {
      if (w.extent >= 2.2) {
        climb(state, k, sk, w.q, w.box);
        ev.climbed = w;
        return;
      }
      ev.stumbled = true;
      continue;                 // blocked by a curb/planter: drop this axis
    }
    state.p.setComponent(k, comp(state.p, k) + mk);
  }

  // settle on a face (allow double wrap for thin slabs -> undersides)
  for (let i = 0; i < 3; i++) {
    const sup = support(boxes, state.p, state.n, 0.9, 0.06);
    if (sup) {
      state.box = sup.box;
      state.p.setComponent(axisOf(state.n), sup.q);
      if (i > 0) ev.wrapped = true;
      return;
    }
    const b = state.box;
    if (!b) { ev.lost = true; return; }
    if (b.rot) { ev.fell = true; return; }   // ran off a rotor: airborne, no wrap
    // which tangent bound did we run past on the box we were standing on?
    const aa = axisOf(state.n);
    let bestK = -1, bestOver = 0, bestSign = 1, bestBound = 0;
    for (let k = 0; k < 3; k++) {
      if (k === aa) continue;
      const lo = comp(b.min, k), hi = comp(b.max, k), x = comp(state.p, k);
      if (x > hi && x - hi > bestOver) { bestOver = x - hi; bestK = k; bestSign = 1; bestBound = hi; }
      if (x < lo && lo - x > bestOver) { bestOver = lo - x; bestK = k; bestSign = -1; bestBound = lo; }
    }
    if (bestK < 0) { ev.lost = true; return; }
    wrap(state, bestK, bestSign, bestBound);
    ev.wrapped = true;
  }
  ev.lost = true;
}
const _stepMove = new THREE.Vector3();
