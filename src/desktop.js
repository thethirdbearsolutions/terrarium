// The desktop: a color and an 8×8 pattern on the floor, the color again in a
// darker shade on the ceiling, and what the walls are made of. Chosen in
// Control Panel, kept in localStorage.

const KEY = 'terrarium.desktop';

export const COLORS = [
  { name: 'Teal', color: '#008080' }, { name: 'Navy', color: '#000080' }, { name: 'Green', color: '#008000' },
  { name: 'Olive', color: '#808000' }, { name: 'Maroon', color: '#800000' }, { name: 'Purple', color: '#800080' },
  { name: 'Gray', color: '#808080' }, { name: 'Silver', color: '#c0c0c0' }, { name: 'Black', color: '#000000', ink: '#808080' },
];

// eight rows of eight; 1 is ink
export const PATTERNS = [
  { name: 'Sprouts', rows: ['00000000', '00000000', '00010100', '00001000', '00001000', '00000000', '00000000', '00000000'] },
  { name: 'Pebbles', rows: ['00000000', '01100000', '01100000', '00000000', '00000000', '00000110', '00000110', '00000000'] },
  { name: 'Lattice', rows: ['10000001', '01000010', '00100100', '00011000', '00011000', '00100100', '01000010', '10000001'] },
  { name: 'Bricks', rows: ['11111111', '10000000', '10000000', '10000000', '11111111', '00001000', '00001000', '00001000'] },
  { name: 'Ripples', rows: ['00000000', '00000000', '01100000', '10010001', '00001110', '00000000', '00000000', '00000000'] },
  { name: 'Stitch', rows: ['11000000', '00000000', '00001100', '00000000', '11000000', '00000000', '00001100', '00000000'] },
  { name: 'Drizzle', rows: ['10000000', '10000000', '00000000', '00001000', '00001000', '00000000', '00100000', '00000000'] },
];

export const WALLS = ['Panels', 'Brick', 'Stone'];

export const DEFAULT = { color: '#008080', pattern: 'Sprouts', walls: 'Panels' };

export function load() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEFAULT }; }
}

export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {}
}

export const inkFor = (color) => COLORS.find(c => c.color === color)?.ink || '#000000';
export const patternNamed = (name) => PATTERNS.find(p => p.name === name) || PATTERNS[0];
export const wallsNamed = (name) => (WALLS.includes(name) ? name : WALLS[0]);

/** The ceiling: the desktop color, darker (and black lifted to a dark gray, so it reads). */
export function ceilingFor(color) {
  const n = parseInt(color.slice(1), 16), k = 0.55;
  const ch = (v) => Math.round(Math.max(v * k, 0x20)).toString(16).padStart(2, '0');
  return '#' + ch(n >> 16) + ch((n >> 8) & 255) + ch(n & 255);
}

/** The pattern drawn into a canvas, scale px per bit. */
export function tile({ color, pattern }, scale = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 8 * scale;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = inkFor(color);
  patternNamed(pattern).rows.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') g.fillRect(x * scale, y * scale, scale, scale); }));
  return c;
}
