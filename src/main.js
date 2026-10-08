import { Space } from './space.js';
import { Shell, APPS } from './shell.js';
import { closeMenus, menuOpen } from './menu.js';
import * as fs from './fs.js';
import * as maze from './maze.js';
import { Marbles } from './marbles.js';
import { FLOOR_Y } from './space.js';
import { MOVE } from './player.js';

const space = new Space(document.getElementById('gl'), document.getElementById('css'));
const shell = new Shell(space);
const marbles = new Marbles(space, shell, FLOOR_Y);
window.__terrarium = { space, shell, fs, APPS, maze, marbles };

// ---- the empty world: the floor, the walls, the sky -----------------------------

const cssRoot = space.css.domElement;
const isBackground = (t) => t === cssRoot || t === cssRoot.firstChild || t === document.documentElement || t === document.body;

/** Is the pointer on a window, or on a wall that stands in front of it? */
function hiddenBehindWall(e) {
  const box = e.target.closest?.('.gbox')?.box;
  if (box) {
    // as far off as the box stands, near enough
    if (space.over > 0.02) return false;
    const ray = space.ray(e.clientX, e.clientY), d = Math.hypot(box.x - ray.ox, box.z - ray.oz) - 60, n = Math.hypot(ray.dx, ray.dz);
    return space.wallDistance(ray.ox, ray.oz, ray.dx / n, ray.dz / n) < d;
  }
  const el = e.target.closest?.('.win');
  const w = el?.win;
  if (!w?.cur || w.minimized || w.maximized || el.classList.contains('dialog') || space.over > 0.02) return false;
  const ray = space.ray(e.clientX, e.clientY), c = w.cur;
  // where the ray meets the window's plane
  const yaw = c.yaw, n = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const den = ray.dx * n.x + ray.dz * n.z;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((c.x - ray.ox) * n.x + (c.z - ray.oz) * n.z) / den;
  return t > 0 && space.wallDistance(ray.ox, ray.oz, ray.dx, ray.dz) < t;
}

function grabWorld(e) {
  const ev0 = e;
  const sx = e.clientX, sy = e.clientY, yaw0 = space.player.yaw, pitch0 = space.player.pitch;
  let moved = false;
  document.body.classList.add('panning');
  // the keys belong to the shell again
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const move = (ev) => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy, p = space.player;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    p.glide = null;
    p.yaw = yaw0 + dx / space.D * (1 + space.over * 1.5);
    // up and down look up and down, as if the floor were pulled; not on the map
    if (!space.overTarget) p.pitch = Math.max(-MOVE.lookDown, Math.min(MOVE.lookUp, pitch0 + dy / space.D));
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    document.body.classList.remove('panning');
    if (!moved && space.overTarget) {
      // on the map, a click near a window's footprint goes to it
      const pt = space.pickFloor(ev0.clientX, ev0.clientY), w = pt && shell.windowAt(pt);
      if (w) shell.shieldClick(w); else shell.setOverview(false);
    } else if (!moved) {
      // a click on the floor puts a magnet there, unless it was the first of a double-click
      const pt = floorAt(ev0.clientX, ev0.clientY);
      if (pt) {
        clearTimeout(placing);
        placing = setTimeout(() => marbles.place(pt, ev0.shiftKey ? -1 : 1), 260);
      }
    }
    shell.saveLayout();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}

// a wall in front of a window takes the click, not the window it hides
addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !hiddenBehindWall(e)) return;
  e.stopPropagation(); e.preventDefault();
  closeMenus();
  grabWorld(e);
}, true);

addEventListener('pointerdown', (e) => {
  if (!isBackground(e.target) || (e.button !== 0 && e.button !== 2)) return;
  if (!space.overTarget && grabMagnet(e)) return;
  if (e.button === 0) grabWorld(e);
});
addEventListener('contextmenu', (e) => { if (isBackground(e.target)) e.preventDefault(); });

// double-click the desktop for the Task List
addEventListener('dblclick', (e) => { if (isBackground(e.target) && !space.overTarget) { clearTimeout(placing); shell.taskList(); } });

// ---- magnets on the floor --------------------------------------------------------

const MAGNET_REACH = 9000;   // px: further off than this a click on the floor is for turning, not for magnets
let placing = null;

/** The floor you can see under the pointer, near enough to reach: not the floor past a wall. */
function floorAt(cx, cy) {
  const pt = space.pickFloor(cx, cy), eye = space.camera.position;
  if (!pt) return null;
  const d = Math.hypot(pt.x - eye.x, pt.z - eye.z);
  if (d > MAGNET_REACH) return null;
  return space.wallDistance(eye.x, eye.z, (pt.x - eye.x) / d, (pt.z - eye.z) / d) < d ? null : pt;
}

/** A magnet under the pointer: click flips it, drag moves it, Alt- or right-click picks it up. */
function grabMagnet(e) {
  const pt = floorAt(e.clientX, e.clientY), m = pt && marbles.magnetAt(pt);
  if (!m) return false;
  e.preventDefault();
  if (e.altKey || e.button === 2) { marbles.remove(m); return true; }
  const sx = e.clientX, sy = e.clientY;
  let moved = false;
  document.body.classList.add('dragging');
  const move = (ev) => {
    if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
    const q = space.pickFloor(ev.clientX, ev.clientY);
    if (moved && q) marbles.moveTo(m, q);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    document.body.classList.remove('dragging');
    if (!moved) marbles.flip(m); else marbles.save();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
  return true;
}

// the wheel walks
addEventListener('wheel', (e) => {
  if (!isBackground(e.target)) return;
  e.preventDefault();
  space.player.nudge(-(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 2);
}, { passive: false });

// ---- keys --------------------------------------------------------------------------

const shellHasKeys = () => {
  const a = document.activeElement;
  return !a || a === document.body || a.classList.contains('sys');
};

addEventListener('keydown', (e) => {
  if (menuOpen()) return;
  const a = document.activeElement;
  if (a?.tagName === 'IFRAME') return;
  // the shell's own keys, wherever in the shell the focus is
  if (e.key === 'Escape' && e.ctrlKey) shell.taskList();
  else if (e.code === 'Space' && e.altKey) { const w = shell.top; if (w) { shell.bring(w); w.toggleMenu(); } }
  else if (e.key === 'F4' && e.ctrlKey) { const w = shell.top; if (w) shell.close(w); }
  else if (shell.top?.onKey?.(e)) { /* the window took it */ }
  else if (!shellHasKeys()) {
    // Esc gives the keys back to the shell from a built-in app
    if (e.key !== 'Escape' || e.defaultPrevented || a.closest('.dialog')) return;
    a.blur();
  }
  else if (space.player.keyDown(e)) { if (space.overTarget && !e.altKey) shell.setOverview(false); }
  else if (e.key === 'o' || e.key === 'Escape') shell.setOverview(e.key === 'o' ? !space.overTarget : false);
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => space.player.keyUp(e));
addEventListener('blur', () => space.player.release());

// ---- dropping files in ---------------------------------------------------------

let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dropping'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dropping');
  if (e.dataTransfer?.files.length) shell.drop([...e.dataTransfer.files]);
});

// ---- go --------------------------------------------------------------------------

await fs.seed();
await shell.restoreLayout();
shell.restoreBoxes();
closeMenus();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  shell.update(dt);
  marbles.update(dt);
  space.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
