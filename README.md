# file commander

An orthodox two-pane file manager (think Norton / Total Commander) over an
in-memory virtual filesystem, built on [immediately.run](https://immediately.run):
React + TypeScript + Vite, dressed in the brand design system. Navigate with the
keyboard, view files with syntax highlighting, copy / move / rename / delete
between panes, and tweak the look live.

## Try it instantly

Try this app on [immediately.run](https://immediately.run/present/github/immediately-run/file-commander/main/files/src/App.tsx)

> After you push to your own repo, update the link to
> `https://immediately.run/present/github/<owner>/<repo>/<ref>/files/src/App.tsx`.

## Keys

- **↑ ↓ · Home · End · PgUp · PgDn** — move the cursor
- **Tab** — switch the active pane · **Enter** — open dir / view file ·
  **Backspace** — up one level
- **Insert / Space** — mark · **\*** — invert selection · **Esc** — clear marks
- **F2** rename · **F3 / F4** view · **F5** copy · **F6** move · **F7** new dir ·
  **F8 / Del** delete
- The command line takes `cd <dir>`, `mkdir <name>`, and `ls`.

The floating **Tweaks** panel (immediately.run edit mode) adjusts listing
density, file icons, cursor style, active-pane emphasis, and the light / dark
theme.

## How it's organized

immediately.run renders the **default export of `src/App.tsx`** — that's the
entry point, not `main.tsx`.

```
src/
  main.tsx              # local vite dev/build entry only — immediately.run IGNORES this
  App.tsx               # ROOT: state, keyboard engine, chrome + imports the global CSS
  index.css             # fonts, design tokens (dark + light + editor syntax), resets
  App.css               # layout + component styles (the commander chrome)
  components/           # one default-exported React component per file
    Pane.tsx            # a single pane (drive tabs, crumbs, columns, listing, status)
    Icon.tsx            # inline Lucide-style icon set, looked up by name
    Tweaks.tsx          # the floating edit-mode panel + form controls
    dialogs/            # MkDir / Rename / Delete / Copy / Viewer modals
  data/                 # typed data arrays (NO components/JSX here)
    drives.ts           # quick-access drive tabs
  hooks/                # custom hooks (NO components here)
    useTweaks.ts        # tweak state + the immediately.run edit-mode protocol
  lib/                  # plain logic modules (NO components here)
    fs.ts               # the virtual filesystem + path/sort/mutation helpers
    highlight.ts        # tiny syntax highlighter for the file viewer
  assets/               # images you import, e.g. import logo from './assets/logo-mark.png'
```

The structure shows the core immediately.run patterns: typed data mapped to UI
(`data/drives.ts` → `components/Pane.tsx`), logic kept out of component files
(`lib/fs.ts`), a custom hook (`hooks/useTweaks.ts`), and one default-exported
component per file — all reachable from `App.tsx`, which imports the global CSS.

## Filesystem access (`fs`)

immediately.run apps can read and write a filesystem by importing `fs` (async
only — `fs.promises.*` and callback style). This template has local-dev support
for it built in via [`@immediately-run/dev-fs`](https://github.com/immediately-run/dev-fs),
a Vite plugin (already wired into `vite.config.ts`) that bridges the same
filesystem to your real local disk during `vite dev`. See that repo for the
supported API and details.

```ts
import fs from 'fs'

await fs.promises.writeFile('/data/notes.txt', 'hello', 'utf8')
const text = await fs.promises.readFile('/data/notes.txt', 'utf8')
```

`main.tsx` runs a one-off round-trip smoke test in dev — check the browser
console for the `[dev-fs]` group, and delete it freely.

## The rules that keep it working on immediately.run

See [`CLAUDE.md`](./CLAUDE.md) for the full list. The essentials:

- **Global CSS is imported from `App.tsx`, never only from `main.tsx`.**
- **A file that exports a component exports *only* components** — data, consts,
  and helpers go in `data/`, `hooks/`, or `lib/`. `npm run lint` enforces this.
- **Pull colors, fonts, radii, and shadows from the tokens in `index.css`**
  rather than hard-coding values.

## Develop

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev      # local dev server
npm run build    # tsc -b && vite build — must pass with no type errors
npm run lint     # eslint — enforces the React Fast Refresh / HMR rule
npm run preview  # serve the production build
```
