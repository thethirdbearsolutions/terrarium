// Clock: a round face with hour dots and hands, or the digits.

import { menuBar } from './menu.js';
import { message } from './dialogs.js';

const PREFS = 'terrarium.clock';
const load = () => { try { return { analog: true, seconds: true, date: true, ...JSON.parse(localStorage.getItem(PREFS)) }; } catch { return { analog: true, seconds: true, date: true }; } };

// a hand: a diamond from the middle out to length, width across, at angle t (0 = twelve)
const hand = (t, len, wid, back) => {
  const s = Math.sin(t), c = -Math.cos(t), px = -c, py = s;
  const pts = [[s * len, c * len], [s * len * 0.25 + px * wid, c * len * 0.25 + py * wid], [-s * back, -c * back], [s * len * 0.25 - px * wid, c * len * 0.25 - py * wid]];
  return pts.map(([x, y]) => `${(100 + x).toFixed(1)},${(100 + y).toFixed(1)}`).join(' ');
};

export function mountClock(win) {
  const shell = win.shell, prefs = load();
  const save = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };
  win.body.innerHTML = `<div class="app clock"><div class="mb"></div><div class="dial"></div></div>`;
  const dial = win.body.querySelector('.dial');

  // the dots don't move; draw them once
  let dots = '';
  for (let i = 0; i < 60; i++) {
    const t = i / 60 * Math.PI * 2, x = 100 + Math.sin(t) * 84, y = 100 - Math.cos(t) * 84;
    dots += i % 5
      ? `<rect x="${(x - 1.5).toFixed(1)}" y="${(y - 1.5).toFixed(1)}" width="3" height="3" fill="#000080"/>`
      : `<rect x="${(x - 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" width="8" height="8" fill="#008080"/><path d="M${(x - 4).toFixed(1)} ${(y + 4).toFixed(1)}v-8h8" stroke="#00ffff" fill="none"/><path d="M${(x + 4).toFixed(1)} ${(y - 4).toFixed(1)}v8h-8" stroke="#000" fill="none"/>`;
  }

  const tick = () => {
    const n = new Date();
    const h = n.getHours() % 12, m = n.getMinutes(), s = n.getSeconds();
    win.setTitle(prefs.date ? `Clock - ${n.getMonth() + 1}/${n.getDate()}` : 'Clock');
    if (prefs.analog) {
      dial.innerHTML = `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">${dots}
        <polygon points="${hand((h + m / 60) / 12 * Math.PI * 2, 52, 7, 8)}" fill="#008080" stroke="#000" stroke-width="1.5"/>
        <polygon points="${hand((m + s / 60) / 60 * Math.PI * 2, 76, 6, 8)}" fill="#008080" stroke="#000" stroke-width="1.5"/>
        ${prefs.seconds ? `<line x1="100" y1="100" x2="${(100 + Math.sin(s / 60 * Math.PI * 2) * 78).toFixed(1)}" y2="${(100 - Math.cos(s / 60 * Math.PI * 2) * 78).toFixed(1)}" stroke="#000" stroke-width="1.5"/>` : ''}</svg>`;
    } else {
      const t = n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: prefs.seconds ? '2-digit' : undefined });
      dial.innerHTML = `<div class="digits"><div class="t">${t}</div>${prefs.date ? `<div class="d">${n.toLocaleDateString()}</div>` : ''}</div>`;
      const d = dial.querySelector('.t');
      d.style.fontSize = Math.max(12, Math.min(dial.clientWidth / (t.length * 0.62), dial.clientHeight * 0.5)) + 'px';
    }
    dial.classList.toggle('analog', prefs.analog);
  };
  const set = (k, v) => { prefs[k] = v; save(); tick(); };
  menuBar(win.body.querySelector('.mb'), win.front, [
    { t: '&Settings', items: () => [
      { t: '&Analog', check: prefs.analog, run: () => set('analog', true) },
      { t: '&Digital', check: !prefs.analog, run: () => set('analog', false) }, '-',
      { t: '&Seconds', check: prefs.seconds, run: () => set('seconds', !prefs.seconds) },
      { t: 'D&ate', check: prefs.date, run: () => set('date', !prefs.date) }, '-',
      { t: 'A&bout Clock...', run: () => message(shell, win, 'Terrarium\nClock', { title: 'About Clock', icon: 'info' }) },
    ] },
  ]);
  tick();
  const timer = setInterval(tick, 1000);
  win.onClose = () => clearInterval(timer);
}
