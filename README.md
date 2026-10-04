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

- Program Manager starts things: double-click an icon in Main (or select it
  and press Enter). An app you have open is brought to you rather than
  started again; Shift opens another.
- Drag the empty desktop, scroll, or press ← → to turn. Program Manager's
  Window menu has Turn Left, Turn Right, and Step Back (or `o`), which shows
  the whole room; click a window there to go to it.
- Double-click the empty desktop, or press Ctrl+Esc, for the Task List:
  Switch To, End Task, Cascade (stacked, each further back), Tile (side by
  side along the ring) and Arrange Icons. Program Manager is always on it,
  so a closed one can come back.
- Drag a window by its title bar; double-click the bar to maximize. Drag
  any edge or corner of the border to size it. Scroll on the bar to push it
  away or pull it near; right-drag (or Alt-drag) the bar to turn it.
- ▼ minimizes a window to an icon along the bottom of the view; click the
  icon for its control menu, double-click it to restore. ▲ maximizes to fill
  the view; Restore puts it back.
- The box at the left of the title bar opens the control menu (Alt+Space
  when no app has the keyboard): Restore, Move and Size (with the arrow
  keys), Minimize, Maximize, Close (Ctrl+F4, or double-click the box),
  Switch To, and Turn Around, which shows the back of the window. You can
  write on the back; F5 puts in the time and date.
- Windows are solid. One that would pass through another is pushed back or
  aside instead, and a thrown one knocks the others about.
- File Manager shows the files as drive c:, opens them with their app, and
  imports, exports, renames and deletes. Files dropped onto the room land in
  `c:\documents`.
- Control Panel ▸ Desktop sets the desktop color and pattern.

The layout, the notes on the backs, the desktop, and the files persist in
the browser.

## Apps

An app is a page in a frame. It can talk to the shell over `postMessage`
to open and save files, set its title, and say when it has unsaved
changes: see [PROTOCOL.md](PROTOCOL.md). `tools/probe.html` is a minimal
app that speaks it.

## Tests

    node --test test/*.test.mjs

## Layout

- `src/space.js` the room: camera, desktop color, patterned floor, turning, stepping back
- `src/desktop.js` the desktop colors and patterns
- `src/window.js` a window: frame, faces, edges, dragging, sizing, the control menu, its icon
- `src/physics.js` windows as rigid bodies: impacts, spin, friction, the walls
- `src/shell.js` focus, minimizing and maximizing, Cascade and Tile, opening files, the protocol, saving the layout
- `src/menu.js` drop-down menus and menu bars
- `src/dialogs.js` message boxes, list boxes, combo boxes, the Task List
- `src/progman.js` Program Manager
- `src/files.js` File Manager, the Open and Save As dialog
- `src/clock.js`, `src/control.js` Clock, Control Panel
- `src/icons.js` pixel art in the sixteen VGA colors
- `src/fs.js` the filesystem, in IndexedDB
- `src/apps.js` what Program Manager can start
