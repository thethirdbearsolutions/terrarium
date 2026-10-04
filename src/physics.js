// Windows are rigid slabs sliding on the floor. Seen from above each is a
// line segment with a little thickness, a mass, a velocity, and a spin about
// the vertical. They knock each other with impulses at the point of contact,
// bounce, and slide to a stop. The room is a ring: a glass wall near the eye,
// a far wall beyond. Units are CSS pixels and seconds.

export const TUNING = {
  restitution: 0.45,     // bounce between windows
  wallRestitution: 0.5,
  friction: 0.25,        // between windows at the contact
  drag: 1.6,             // floor: speed lost per second, proportionally
  rollingStop: 90,       // floor: px/s lost per second outright
  spinDrag: 2.4,
  spinStop: 0.6,
  maxSpeed: 5000,
  maxSpin: 14,
  slop: 0.5,             // overlap allowed before positions are corrected
  correction: 0.8,
  substeps: 8,
};

export class Body {
  constructor({ x = 0, z = 0, yaw = 0, y = 0, hw = 200, hh = 150, ht = 7 } = {}) {
    Object.assign(this, { x, z, yaw, y, hw, hh, ht });
    this.vx = 0; this.vz = 0; this.w = 0;
    this.kinematic = false;   // moved by a hand, not by the world
  }
  get mass() { return (this.hw * this.hh) / 2500; }
  get inertia() { return this.mass * (4 * this.hw * this.hw) / 12; }
  get invMass() { return this.kinematic ? 0 : 1 / this.mass; }
  get invInertia() { return this.kinematic ? 0 : 1 / this.inertia; }
  get axis() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }     // across the face
  get normal() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }    // through the face
  ends() {
    const u = this.axis;
    return [{ x: this.x - u.x * this.hw, z: this.z - u.z * this.hw }, { x: this.x + u.x * this.hw, z: this.z + u.z * this.hw }];
  }
  /** Velocity of the point p on this body. A spin w moves an offset r by w*(r.z, -r.x). */
  velocityAt(p) {
    const rx = p.x - this.x, rz = p.z - this.z;
    return { x: this.vx + this.w * rz, z: this.vz - this.w * rx };
  }
  /** Push the body with impulse j at point p. */
  hit(j, p) {
    const rx = p.x - this.x, rz = p.z - this.z;
    this.vx += j.x * this.invMass; this.vz += j.z * this.invMass;
    this.w += (rz * j.x - rx * j.z) * this.invInertia;
  }
  get moving() { return Math.hypot(this.vx, this.vz) > 2 || Math.abs(this.w) > 0.01; }
}

const dot = (a, b) => a.x * b.x + a.z * b.z;

function reach(b, a) {
  return b.hw * Math.abs(dot(b.axis, a)) + b.ht * Math.abs(dot(b.normal, a));
}

/** Overlap of two slabs: unit normal from a to b and depth, or null. */
export function contact(a, b) {
  if (Math.abs(a.y - b.y) >= a.hh + b.hh) return null;
  const d = { x: b.x - a.x, z: b.z - a.z };
  let best = null;
  for (const ax of [a.axis, a.normal, b.axis, b.normal]) {
    const s = dot(d, ax), depth = reach(a, ax) + reach(b, ax) - Math.abs(s);
    if (depth <= 1e-6) return null;
    if (!best || depth < best.depth) best = { depth, n: s < 0 ? { x: -ax.x, z: -ax.z } : ax };
  }
  best.p = touchPoint(a, b);
  return best;
}

/** Where two slabs touch: the midpoint of the closest points of their centerlines. */
function touchPoint(a, b) {
  const [p1, q1] = a.ends(), [p2, q2] = b.ends();
  const d1 = { x: q1.x - p1.x, z: q1.z - p1.z }, d2 = { x: q2.x - p2.x, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, z: p1.z - p2.z };
  const A = dot(d1, d1), E = dot(d2, d2), F = dot(d2, r), C = dot(d1, r), B = dot(d1, d2);
  const den = A * E - B * B;
  let s = den > 1e-9 ? clamp((B * F - C * E) / den, 0, 1) : 0;
  let t = (B * s + F) / E;
  if (t < 0) { t = 0; s = clamp(-C / A, 0, 1); } else if (t > 1) { t = 1; s = clamp((B - C) / A, 0, 1); }
  const c1 = { x: p1.x + d1.x * s, z: p1.z + d1.z * s }, c2 = { x: p2.x + d2.x * t, z: p2.z + d2.z * t };
  return { x: (c1.x + c2.x) / 2, z: (c1.z + c2.z) / 2 };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Resolve a contact between a and b (b may be null for a fixed wall). */
function collide(a, b, n, p, depth, e, T) {
  const va = a.velocityAt(p), vb = b ? b.velocityAt(p) : { x: 0, z: 0 };
  const rel = { x: vb.x - va.x, z: vb.z - va.z };
  const vn = dot(rel, n);
  const ra = { x: p.x - a.x, z: p.z - a.z }, rb = b ? { x: p.x - b.x, z: p.z - b.z } : null;
  const lever = (r, k) => r.z * k.x - r.x * k.z;
  const k = (dir) => a.invMass + (b ? b.invMass : 0)
    + lever(ra, dir) ** 2 * a.invInertia + (b ? lever(rb, dir) ** 2 * b.invInertia : 0);
  if (vn < 0) {
    const j = -(1 + e) * vn / k(n);
    a.hit({ x: -n.x * j, z: -n.z * j }, p);
    b?.hit({ x: n.x * j, z: n.z * j }, p);
    // a little friction along the contact, which is what sets things spinning
    const t = { x: -n.z, z: n.x }, vt = dot(rel, t);
    const jt = clamp(-vt / k(t), -T.friction * j, T.friction * j);
    a.hit({ x: -t.x * jt, z: -t.z * jt }, p);
    b?.hit({ x: t.x * jt, z: t.z * jt }, p);
  }
  // and never leave them inside each other
  const total = a.invMass + (b ? b.invMass : 0);
  if (total === 0) return;
  const push = Math.max(0, depth - T.slop) * T.correction / total;
  a.x -= n.x * push * a.invMass; a.z -= n.z * push * a.invMass;
  if (b) { b.x += n.x * push * b.invMass; b.z += n.z * push * b.invMass; }
}

/** Advance the world by dt. room: { near, far } radii of the walls around the origin. */
export function step(bodies, dt, room = null, T = TUNING) {
  const h = dt / T.substeps;
  for (let s = 0; s < T.substeps; s++) {
    for (const b of bodies) {
      // a hand-held window moves too, in the same small steps, so a fast
      // swing can't jump clean through something thinner than one frame's travel
      b.x += b.vx * h; b.z += b.vz * h; b.yaw += b.w * h;
      if (b.kinematic) continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0) {
        const nsp = clamp(sp * Math.exp(-T.drag * h) - T.rollingStop * h, 0, T.maxSpeed);
        b.vx *= nsp / sp; b.vz *= nsp / sp;
      }
      const aw = Math.abs(b.w);
      if (aw > 0) b.w = Math.sign(b.w) * clamp(aw * Math.exp(-T.spinDrag * h) - T.spinStop * h, 0, T.maxSpin);
    }
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (a.kinematic && b.kinematic) continue;
        const c = contact(a, b);
        if (c) collide(a, b, c.n, c.p, c.depth, T.restitution, T);
      }
    }
    if (room) for (const b of bodies) {
      if (b.kinematic) continue;
      for (const p of b.ends()) {
        const r = Math.hypot(p.x, p.z);
        if (r < 1e-6) continue;
        const out = { x: p.x / r, z: p.z / r };
        // the wall pushes along n toward the inside of the room; collide() takes n as pointing from b to the wall
        if (r < room.near) collide(b, null, { x: -out.x, z: -out.z }, p, room.near - r, T.wallRestitution, T);
        else if (r > room.far) collide(b, null, out, p, r - room.far, T.wallRestitution, T);
      }
    }
  }
}
