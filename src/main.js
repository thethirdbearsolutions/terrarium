import { Space } from './space.js';
import { Shell, APPS } from './shell.js';
import { closeMenus, menuOpen } from './menu.js';
import * as fs from './fs.js';

const space = new Space(document.getElementById('gl'), document.getElementById('css'));
const shell = new Shell(space);
window.__terrarium = { space, shell, fs, APPS };

// ---- turning the room --------------------------------------------------------

const cssRoot = space.css.domElement;
const isBackground = (t) => t === cssRoot || t === cssRoot.firstChild || t.id === 'gl' || t.tagName === 'CANVAS';

addEventListener('pointerdown', (e) => {
  if (!isBackground(e.target) || e.button !== 0) return;
  const sx = e.clientX, p0 = space.panTarget;
  let moved = false;
  document.body.classList.add('panning');
  if (document.activeElement?.tagName === 'IFRAME') document.activeElement.blur();
  const move = (ev) => {
    const dx = ev.clientX - sx;
    if (Math.abs(dx) > 3) moved = true;
    space.panTarget = p0 - dx / space.D * (1 + space.over * 1.5);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    document.body.classList.remove('panning');
    if (!moved && space.overTarget) shell.setOverview(false);
    shell.saveLayout();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
});

// double-click the desktop for the Task List
addEventListener('dblclick', (e) => { if (isBackground(e.target) && !space.overTarget) shell.taskList(); });

addEventListener('wheel', (e) => {
  if (!isBackground(e.target)) return;
  e.preventDefault();
  space.panTarget += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / space.D;
  shell.saveLayout();
}, { passive: false });

addEventListener('keydown', (e) => {
  if (menuOpen()) return;
  const a = document.activeElement;
  if (a?.tagName === 'IFRAME') return;
  // the shell's own keys, wherever in the shell the focus is
  if (e.key === 'Escape' && e.ctrlKey) shell.taskList();
  else if (e.code === 'Space' && e.altKey) { const w = shell.top; if (w) { shell.bring(w); w.toggleMenu(); } }
  else if (e.key === 'F4' && e.ctrlKey) { const w = shell.top; if (w) shell.close(w); }
  else if (shell.top?.onKey?.(e)) { /* the window took it */ }
  else if (a && a !== document.body && !a.classList.contains('sys')) return;
  else if (e.key === 'ArrowLeft') shell.turn(-1);
  else if (e.key === 'ArrowRight') shell.turn(1);
  else if (e.key === 'o' || e.key === 'Escape') shell.setOverview(e.key === 'o' ? !space.overTarget : false);
  else return;
  e.preventDefault();
});

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
  space.update(dt, now / 1000);
  shell.update(dt);
  space.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
