// Picking a thing up and throwing it: a window by its title bar, a box by
// any face. It's held where it is from you, so it comes along as you walk;
// across moves it across, up pushes it away and down pulls it near, and
// with Shift up and down raise and lower it instead, as does the wheel.
// Let go while it's moving and it's thrown (the shell takes the speed).
//
// A thing that can be carried has x, z, yaw and y, and hold(), letGo(thrown)
// and lift(dy).

export const CARRY = {
  push: 260,               // screen px dragged up to carry a thing e times further off
  near: 0.4, far: 12,      // how near and far you can hold one, as shares of D
};

/** Carry thing from a pointerdown e until the button comes up. */
export function carryDrag(shell, thing, e, { turning = false, onClick = null } = {}) {
  const sp = shell.space;
  thing.hold();
  const c = thing.carry = shell.carryFrom(thing);
  let px = e.clientX, py = e.clientY, moved = false;
  const sx = px, sy = py;
  document.body.classList.add('dragging');
  const move = (ev) => {
    const dx = ev.clientX - px, dy = ev.clientY - py, k = Math.max(0.05, c.ahead / sp.D);
    px = ev.clientX; py = ev.clientY;
    if (Math.abs(px - sx) + Math.abs(py - sy) > 3) moved = true;
    if (turning) c.turn -= dx / 220;
    else if (ev.shiftKey) {
      // Shift: up and down raise and lower it, under the pointer
      c.side += dx * k;
      thing.lift(-dy * k);
    } else {
      c.side += dx * k;
      c.ahead = Math.max(sp.D * CARRY.near, Math.min(sp.D * CARRY.far, c.ahead * Math.exp(-dy / CARRY.push)));
    }
  };
  // scrolling anywhere while it's held raises and lowers it
  const wheel = (ev) => { ev.preventDefault(); ev.stopPropagation(); thing.lift(-ev.deltaY * 0.6); moved = true; };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    removeEventListener('wheel', wheel, { capture: true });
    document.body.classList.remove('dragging');
    thing.letGo(moved);
    if (!moved) onClick?.();
    shell.saveLayout();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
  addEventListener('wheel', wheel, { capture: true, passive: false });
}
