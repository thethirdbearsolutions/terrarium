import { Space } from './space.js';
import { Shell, APPS } from './shell.js';
import { closeMenus, menuOpen } from './menu.js';
import * as fs from './fs.js';
import * as maze from './maze.js';

const space = new Space(document.getElementById('gl'), document.getElementById('css'));
const shell = new Shell(space);
window.__terrarium = { space, shell, fs, APPS, maze };

// ---- the empty world: the floor, the walls, the sky -----------------------------

const cssRoot = space.css.domElement;
const isBackground = (t) => t === cssRoot || t === cssRoot.firstChild || t === document.documentElement || t === document.body;

/** Is the pointer on a window, or on a wall that stands in front of it? */
function hiddenBehindWall(e) {
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
  const sx = e.clientX, yaw0 = space.player.yaw;
  let moved = false;
  document.body.classList.add('panning');
  // the keys belong to the shell again
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  const move = (ev) => {
    const dx = ev.clientX - sx;
    if (Math.abs(dx) > 3) moved = true;
    space.player.glide = null;
    space.player.yaw = yaw0 + dx / space.D * (1 + space.over * 1.5);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    document.body.classList.remove('panning');
    if (!moved && space.overTarget) {
      // on the map, a click near a window's footprint goes to it
      const pt = space.pickFloor(ev0.clientX, ev0.clientY), w = pt && shell.windowAt(pt);
      if (w) shell.shieldClick(w); else shell.setOverview(false);
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
  if (!isBackground(e.target) || e.button !== 0) return;
  grabWorld(e);
});

// double-click the desktop for the Task List
addEventListener('dblclick', (e) => { if (isBackground(e.target) && !space.overTarget) shell.taskList(); });

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
closeMenus();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  shell.update(dt);
  space.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
