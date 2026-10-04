// What the maze walls are made of, drawn on a canvas one texel to a world
// pixel. Each tile repeats seamlessly: TILE.w across, TILE.h up.

export const TILE = { w: 400, h: 450 };

const canvas = () => {
  const c = document.createElement('canvas');
  c.width = TILE.w; c.height = TILE.h;
  return [c, c.getContext('2d')];
};

/** Raised gray panels, like the face of a dialog: white light up and left, gray and black shade down and right. */
function panels() {
  const [c, g] = canvas(), W = TILE.w, H = TILE.h;
  g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, W, H);
  const raised = (x, y, w, h, b) => {
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, b); g.fillRect(x, y, b, h);
    g.fillStyle = '#808080'; g.fillRect(x, y + h - b, w, b); g.fillRect(x + w - b, y, b, h);
    g.fillStyle = '#000000'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
  };
  const sunken = (x, y, w, h, b) => {
    g.fillStyle = '#808080'; g.fillRect(x, y, w, b); g.fillRect(x, y, b, h);
    g.fillStyle = '#ffffff'; g.fillRect(x, y + h - b, w, b); g.fillRect(x + w - b, y, b, h);
  };
  raised(0, 0, W, H, 6);
  // a sunken field inside, and a raised plate in it, as on a group box
  sunken(34, 34, W - 68, H - 68, 3);
  g.fillStyle = '#c0c0c0'; g.fillRect(37, 37, W - 74, H - 74);
  // a screw in each corner
  for (const x of [18, W - 22]) for (const y of [18, H - 22]) { g.fillStyle = '#808080'; g.fillRect(x, y, 4, 4); g.fillStyle = '#ffffff'; g.fillRect(x, y, 2, 2); }
  return c;
}

const DRAW = { Panels: panels };
const cache = new Map();

/** The tile canvas for a kind of wall. */
export function wallTile(kind) {
  const k = DRAW[kind] ? kind : 'Panels';
  if (!cache.has(k)) cache.set(k, DRAW[k]());
  return cache.get(k);
}
