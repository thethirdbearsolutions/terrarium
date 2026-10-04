# Terrarium

A desktop in a room. The windows stand in a ring around you; turn to see the
rest of them, step back to see them all.

## Running it

Static, no build. Three.js comes from a CDN import map.

    node tools/dev.mjs

serves this repo and its siblings (`hardreturn`, `bingleball`, `magnimarbles`,
`turtlebloom`, `webturtles`) from one origin at http://localhost:8077/, and
the shell frames the local copies. Deployed, it frames the deployed apps.

## Using it

- The dock starts things. Clicking an app you have open turns you to it;
  clicking it again opens another. Shift-click always opens another.
- Drag empty space, scroll, or use ◀ ▶ (or the arrow keys) to turn.
  ◎ (or `o`) steps back to see the whole room; click a window there to go to it.
- Drag a window by its bar. Scroll on the bar to push it away or pull it near.
  Right-drag (or Alt-drag) the bar to turn it.
- ⇄ shows the back of a window, which you can write on.
- ▭ puts a window on the shelf at the left edge; click it to bring it back.
- The corner grip resizes.
- Windows are solid. One that would pass through another is pushed back or
  aside instead; the one in your hand, then the one you last used, holds its
  place.
- Files dropped onto the room land in `/Documents`.

The layout, the notes on the backs, and the files persist in the browser.

## Apps

An app is a page in a frame. It can talk to the shell over `postMessage`
to open and save files, set its title, and say when it has unsaved
changes: see [PROTOCOL.md](PROTOCOL.md). `tools/probe.html` is a minimal
app that speaks it.

## Tests

    node --test test/*.test.mjs

## Layout

- `src/space.js` the room: camera, sky, floor, turning, stepping back
- `src/window.js` a window: faces, edges, dragging, the shelf
- `src/collide.js` keeping windows out of each other
- `src/shell.js` focus, dialogs, opening files, the protocol, saving the layout
- `src/files.js` Files, the Open and Save As dialogs
- `src/fs.js` the filesystem, in IndexedDB
- `src/apps.js` what the dock can start
