import { Space } from './space.js';
import { Shell, APPS } from './shell.js';
import * as fs from './fs.js';

const space = new Space(document.getElementById('gl'), document.getElementById('css'));
const shell = new Shell(space);
window.__terrarium = { space, shell, fs };

// ---- dock ------------------------------------------------------------------

const dock = document.getElementById('dock');
dock.innerHTML = APPS.map(a => `<button class="app" data-app="${a.id}">${a.icon}<span class="tip">${a.title}</span></button>`).join('')
  + `<span class="sep"></span><button class="nav" data-nav="left" title="Turn left">◀</button><button class="nav" data-nav="over" title="Step back">◎</button><button class="nav" data-nav="right" title="Turn right">▶</button><span class="clock"></span>`;

dock.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.nav) return nav(b.dataset.nav);
  const app = APPS.find(a => a.id === b.dataset.app);
  const mine = shell.order.concat(shell.wins.filter(w => !shell.order.includes(w))).filter(w => w.app.id === app.id);
  if (shell.space.overTarget) shell.setOverview(false);
  // first click brings the one you have; a click on the one already in front opens another
  const top = mine[0];
  const centered = top && !top.parked && shell.order[0] === top && Math.abs(Math.sin(top.theta - space.panTarget)) < 0.15;
  if (top && !centered && !e.shiftKey) shell.bring(top);
  else shell.launch(app);
});

shell.onWindows = () => {
  const running = new Set(shell.wins.map(w => w.app.id));
  dock.querySelectorAll('.app').forEach(b => b.classList.toggle('running', running.has(b.dataset.app)));
  dock.querySelector('[data-nav="over"]').classList.toggle('on', space.overTarget > 0);
};

const clock = dock.querySelector('.clock');
const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
tick(); setInterval(tick, 10000);

function nav(n) {
  const step = space.hfov * 0.6;
  if (n === 'left') space.panTarget -= step;
  else if (n === 'right') space.panTarget += step;
  else if (n === 'over') shell.setOverview(!space.overTarget);
  shell.saveLayout();
}

// ---- turning the room --------------------------------------------------------

const cssRoot = space.css.domElement;
const isBackground = (t) => t === cssRoot || t === cssRoot.firstChild || t.id === 'gl' || t.tagName === 'CANVAS';

addEventListener('pointerdown', (e) => {
  if (!isBackground(e.target) || e.button !== 0) return;
  const sx = e.clientX, p0 = space.panTarget;
  let moved = false;
  document.body.classList.add('panning');
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

addEventListener('wheel', (e) => {
  if (!isBackground(e.target)) return;
  e.preventDefault();
  space.panTarget += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / space.D;
  shell.saveLayout();
}, { passive: false });

addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement !== document.body) return;
  if (e.key === 'ArrowLeft') nav('left');
  else if (e.key === 'ArrowRight') nav('right');
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
await shell.restore();
shell.onWindows();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  space.update(dt, now / 1000);
  shell.update(dt);
  space.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
