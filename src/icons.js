// Pixel art, drawn on a grid in the sixteen VGA colors and written out as a
// crisp SVG. Every icon in the shell comes from here.

export const VGA = {
  k: '#000000', r: '#800000', g: '#008000', o: '#808000', n: '#000080', p: '#800080', t: '#008080', s: '#c0c0c0',
  d: '#808080', R: '#ff0000', G: '#00ff00', Y: '#ffff00', B: '#0000ff', M: '#ff00ff', C: '#00ffff', w: '#ffffff',
};

/** Draw on a w×h grid with draw(api); returns an SVG string. Colors are VGA keys. */
export function art(w, h, draw) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = c; };
  const api = {
    px,
    rect(x, y, rw, rh, c) { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) px(i, j, c); },
    box(x, y, rw, rh, c) { api.line(x, y, x + rw - 1, y, c); api.line(x, y + rh - 1, x + rw - 1, y + rh - 1, c); api.line(x, y, x, y + rh - 1, c); api.line(x + rw - 1, y, x + rw - 1, y + rh - 1, c); },
    line(x0, y0, x1, y1, c) {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    },
    disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) px(cx + x, cy + y, c); },
    ring(cx, cy, r, c) {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = x * x + y * y;
        if (d <= r * r + r * 0.8 && d > (r - 1) * (r - 1) + (r - 1) * 0.8) px(cx + x, cy + y, c);
      }
    },
    /** rows of characters, each a VGA key or '.' for nothing */
    map(x, y, rows) { rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') px(x + i, y + j, ch); })); },
  };
  draw(api);
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      const c = g[y][x];
      let n = 1;
      while (x + n < w && g[y][x + n] === c) n++;
      if (c) out += `<path d="M${x} ${y}h${n}v1h-${n}z" fill="${VGA[c] || c}"/>`;
      x += n;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${out}</svg>`;
}

// ---- the frame's own buttons ------------------------------------------------

export const GLYPH = {
  // the bar in the control-menu box
  sys: art(13, 3, (a) => { a.rect(0, 0, 12, 2, 'w'); a.box(0, 0, 12, 2, 'k'); a.rect(1, 2, 12, 1, 'd'); a.rect(12, 1, 1, 2, 'd'); }),
  min: art(7, 4, (a) => a.map(0, 0, ['kkkkkkk', '.kkkkk.', '..kkk..', '...k...'])),
  max: art(7, 4, (a) => a.map(0, 0, ['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk'])),
  restore: art(7, 9, (a) => a.map(0, 0, ['...k...', '..kkk..', '.kkkkk.', 'kkkkkkk', '.......', 'kkkkkkk', '.kkkkk.', '..kkk..', '...k...'])),
};

// ---- small icons for lists ----------------------------------------------------

export const SMALL = {
  folder: art(16, 12, (a) => a.map(0, 0, [
    '.kkkk...........', 'kYYYYk..........', 'kYYYYYkkkkkkkkk.', 'kYYYYYYYYYYYYYk.', 'kYYYYYYYYYYYYYk.', 'kYYYYYYYYYYYYYk.',
    'kYYYYYYYYYYYYYk.', 'kYYYYYYYYYYYYYk.', 'kYYYYYYYYYYYYYk.', 'kYYYYYYYYYYYYYk.', 'kkkkkkkkkkkkkkk.', '................'])),
  open: art(16, 12, (a) => a.map(0, 0, [
    '.kkkk...........', 'kYYYYk..........', 'kYYYYYkkkkkkk...', 'kYYYYYYYYYYYk...', 'kYYkkkkkkkkkkkk.', 'kYkwwwwwwwwwwwk.',
    'kYkwwwwwwwwwwk..', 'kkwwwwwwwwwwwk..', 'kkwwwwwwwwwwk...', 'kwwwwwwwwwwwk...', 'kkkkkkkkkkkkk...', '................'])),
  doc: art(16, 12, (a) => a.map(0, 0, [
    '..kkkkkkk.......', '..kwwwwwkk......', '..kwkkkwkwk.....', '..kwwwwwkkkk....', '..kwkkkkkwwk....', '..kwwwwwwwwk....',
    '..kwkkkkkkwk....', '..kwwwwwwwwk....', '..kwkkkkkkwk....', '..kwwwwwwwwk....', '..kkkkkkkkkk....', '................'])),
  file: art(16, 12, (a) => a.map(0, 0, [
    '..kkkkkkk.......', '..kwwwwwkk......', '..kwwwwwkwk.....', '..kwwwwwkkkk....', '..kwwwwwwwwk....', '..kwwwwwwwwk....',
    '..kwwwwwwwwk....', '..kwwwwwwwwk....', '..kwwwwwwwwk....', '..kwwwwwwwwk....', '..kkkkkkkkkk....', '................'])),
  prog: art(16, 12, (a) => a.map(0, 0, [
    '.kkkkkkkkkkkkk..', '.knnnnnnnnnnnk..', '.kkkkkkkkkkkkk..', '.kwwwwwwwwwwwk..', '.kwwwwwwwwwwwk..', '.kwwwwwwwwwwwk..',
    '.kwwwwwwwwwwwk..', '.kwwwwwwwwwwwk..', '.kkkkkkkkkkkkk..', '................', '................', '................'])),
  drive: art(22, 12, (a) => a.map(0, 0, [
    '......................', '..kkkkkkkkkkkkkkkkk...', '.kwwwwwwwwwwwwwwwwdk..', 'kwsssssssssssssssskdk.', 'kkkkkkkkkkkkkkkkkkkdk.',
    'kssssssssssssssssskdk.', 'ksssssssssssssGGsskdk.', 'kssssssssssssssssskk..', 'kkkkkkkkkkkkkkkkkkk...', '......................', '......................', '......................'])),
};

// ---- message box icons ---------------------------------------------------------

export const MSG = {
  exclamation: art(32, 32, (a) => {
    a.disc(16, 16, 14, 'k'); a.disc(15, 15, 13, 'Y');
    a.rect(14, 6, 4, 12, 'k'); a.rect(14, 21, 4, 4, 'k');
  }),
  question: art(32, 32, (a) => {
    a.disc(16, 16, 14, 'k'); a.disc(15, 15, 13, 'w');
    a.map(10, 6, [
      '..kkkkkkk...', '.kkkkkkkkk..', 'kkk.....kkk.', 'kkk.....kkk.', '........kkk.', '.......kkk..',
      '.....kkkk...', '....kkk.....', '....kkk.....', '............', '....kkk.....', '....kkk.....', '....kkk.....']);
  }),
  info: art(32, 32, (a) => {
    a.disc(16, 16, 14, 'k'); a.disc(15, 15, 13, 'w');
    a.rect(14, 7, 4, 4, 'B'); a.rect(12, 13, 6, 3, 'B'); a.rect(14, 13, 4, 11, 'B'); a.rect(12, 23, 8, 2, 'B');
  }),
  stop: art(32, 32, (a) => {
    a.disc(16, 16, 14, 'k'); a.disc(15, 15, 13, 'R');
    a.rect(7, 13, 17, 5, 'w');
  }),
};
