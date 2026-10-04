# terrarium/1

How an app in a Terrarium window talks to the shell. Every app is an
ordinary page in an iframe; it must also work standalone, so nothing here
is required. An app that never says hello is just a window.

Every message is a plain object posted with `postMessage(msg, '*')` and
carries `terrarium: 1`.

## Handshake

App → shell, once loaded:

```js
{ terrarium: 1, type: 'hello', title: 'Hard Return', accepts: ['.hr', '.txt'] }
```

Shell → app:

```js
{ terrarium: 1, type: 'welcome', windowId: 'w3', file: null | File }
```

`file` is set when the window was opened by opening a file.

An app detects the shell by `window.parent !== window` plus the welcome
arriving. Without a welcome within a second or so, run standalone.

## Requests (app → shell, answered by `reply`)

Each request carries an `id` the app chooses; the shell answers with
`{ terrarium: 1, type: 'reply', id, ok: true, ...result }` or
`{ terrarium: 1, type: 'reply', id, ok: false, error: 'message' }`.
`ok: false, error: 'cancelled'` means the person closed a dialog.

| type   | fields                                     | result            |
|--------|--------------------------------------------|-------------------|
| `open` | `accept?: ['.hr']`                         | `{ file: File }` (shell shows its Open dialog) |
| `save` | `path?`, `name?`, `content`, `mime?`       | `{ path }` (no `path` → shell shows Save As) |
| `read` | `path`                                     | `{ file: File }`  |
| `list` | `dir` (e.g. `/Documents`)                  | `{ entries: [{ path, name, dir: bool, size, mtime }] }` |

## Notices (app → shell, no reply)

| type     | fields              |
|----------|---------------------|
| `title`  | `title`             |
| `resize` | `w`, `h` (CSS px of the app area) |
| `dirty`  | `dirty: bool` (unsaved changes; the shell asks before closing) |
| `close`  | —                   |

## Notices (shell → app)

| type        | fields        |
|-------------|---------------|
| `open-file` | `file: File`  (the person opened a file this app accepts) |
| `focus`     | —             |
| `blur`      | —             |

## File

```js
{ path: '/Documents/letter.hr', name: 'letter.hr', mime: 'application/x-hardreturn+json',
  content: '…string…', mtime: 1790000000000 }
```

Content is always a string in version 1. Paths are absolute, `/`-separated.
Top-level folders the shell creates: `/Documents`, `/Levels`, `/Programs`.
