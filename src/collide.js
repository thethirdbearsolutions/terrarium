// Windows are solid. Seen from above each one is a thin box (its width by its
// thickness, turned by its yaw); seen from the side it spans its height. Two
// boxes that overlap in both are pushed apart along the shortest way out,
// and only the one that matters less moves.

/**
 * bodies: [{ x, z, y, hw, hh, ht, yaw }], most important first. hw, hh, ht
 * are half the width, height and thickness. Moves x and z in place. With an
 * eye ({ x, z }), a window would rather be pushed away from it than toward
 * it, so nothing gets shoved in front of what you're looking at.
 */
export function resolve(bodies, { gap = 0, passes = 6, eye = null } = {}) {
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const push = separation(bodies[i], bodies[j], gap, eye);
        if (!push) continue;
        bodies[j].x += push.x; bodies[j].z += push.z;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return bodies;
}

const axes = (b) => {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return [{ x: c, z: -s }, { x: s, z: c }];   // across the face, through the face
};

const reach = (b, a) => {
  const [u, n] = axes(b);
  return b.hw * Math.abs(u.x * a.x + u.z * a.z) + b.ht * Math.abs(n.x * a.x + n.z * a.z);
};

const TOWARD_EYE = 20;  // how much worse a push toward the eye is than one away

/** The cheapest move of b that clears a, or null if they don't touch. */
export function separation(a, b, gap = 0, eye = null) {
  if (Math.abs(a.y - b.y) >= a.hh + b.hh) return null;
  const dx = b.x - a.x, dz = b.z - a.z;
  const out = eye && Math.hypot(b.x - eye.x, b.z - eye.z) > 0 ? norm(b.x - eye.x, b.z - eye.z) : null;
  let best = null;
  for (const ax of [...axes(a), ...axes(b)]) {
    const d = dx * ax.x + dz * ax.z, r = reach(a, ax) + reach(b, ax) + gap;
    if (r - Math.abs(d) <= 1e-6) return null;
    // either way along the axis clears them; the far way costs more
    for (const sign of [1, -1]) {
      const dist = r - sign * d;
      const mx = ax.x * sign * dist, mz = ax.z * sign * dist;
      const inward = out ? -(mx * out.x + mz * out.z) / dist : 0;
      const cost = dist * (1 + (TOWARD_EYE - 1) * Math.max(0, inward));
      if (!best || cost < best.cost) best = { cost, x: mx, z: mz };
    }
  }
  return { x: best.x, z: best.z };
}

const norm = (x, z) => { const l = Math.hypot(x, z); return { x: x / l, z: z / l }; };
