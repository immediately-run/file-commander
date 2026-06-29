// Root component — immediately.run renders the default export of THIS file.
// Global CSS is imported here (not in main.tsx) because immediately.run's
// runtime never loads main.tsx; anything the rendered tree needs must be
// reachable from App.tsx.
//
// file commander — an orthodox two-pane file manager (think Norton/Total
// Commander) over an in-memory virtual filesystem, dressed in the
// immediately.run brand. As of the file-explorer-library migration, each PANE'S
// listing is rendered by the shared `@immediately-run/file-explorer-ui`
// (`FileExplorerView`, list layout), driven by File Commander's own fs/roots/
// actions. File Commander still owns the chrome (top bar, drive tabs, command
// line, F-key bar), the cross-pane commander operations + their dialogs, spaces,
// and the tweaks panel; only the within-pane browse + listing now come from the
// library.
import './index.css';
import './App.css';
// The library ships its own stylesheet (the panel/list/row/breadcrumb styles);
// it is scoped to the library's own class names and does not fight File
// Commander's tokens (we still set the brand via index.css + App.css).
import '@immediately-run/file-explorer-ui/styles.css';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
// `@immediately-run/file-explorer-ui` is the shared file-explorer library. In
// package.json it is pinned as `file:../file-explorer` — the LOCAL-DEV/CI form
// (a sibling checkout), mirroring how this repo already links `@immediately-run/
// dev-fs`. At immediately.run RUNTIME the library instead resolves via the
// platform git-mount (LIBRARY_MOUNTS_SPEC), which transpiles the library's TS/
// JSX source on demand; the `file:` form is its local equivalent.
import { FileExplorerView } from '@immediately-run/file-explorer-ui';
import type { ExplorerRoot } from '@immediately-run/file-explorer-ui';
import logoMark from './assets/logo-mark.png';
import { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect } from './components/Tweaks';
import { useTweaks } from './hooks/useTweaks';
import MkDirDialog from './components/dialogs/MkDirDialog';
import RenameDialog from './components/dialogs/RenameDialog';
import DeleteDialog from './components/dialogs/DeleteDialog';
import CopyDialog from './components/dialogs/CopyDialog';
import ViewerDialog from './components/dialogs/ViewerDialog';
import SpacesDialog from './components/dialogs/SpacesDialog';
import {
  makeDir, removeEntries, copyEntries, renameEntry, seedIfEmpty,
  extOf, kindOf,
} from './lib/fs';
import type { Entry } from './lib/fs';
import { fcFsSource } from './lib/fcFsSource';
import { buildRoots, IR_ROOT } from './lib/fcRoots';
import { buildActions } from './lib/fcActions';
import { useSpaceMounts, spaceIdOf, mountLabel, isWritable, spaces } from './hooks/useSpaces';
import type { SandboxMount } from './hooks/useSpaces';
import { useOpenWith } from './hooks/useOpenWith';

interface Tweaks {
  density: string;
  cursor: string;
  icons: boolean;
  theme: string;
  emph: string;
  [key: string]: unknown;
}

const TWEAK_DEFAULTS: Tweaks = /*EDITMODE-BEGIN*/{
  density: 'regular',
  cursor: 'bar',
  icons: true,
  theme: 'dark',
  emph: 'glow',
}/*EDITMODE-END*/;

type Side = 'left' | 'right';

// immediately.run runs the app inside an iframe and overlays its own topnav
// pulldown tab in the top-right corner, which would obscure the clock/status.
// When hosted, reserve empty space there. We can't use `import.meta.env.DEV` —
// the in-browser transpiler doesn't treat files as modules, so `import.meta`
// throws "Cannot use 'import.meta' outside a module". Detect the iframe instead;
// plain `vite dev` runs at the top level.
function isHosted(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin access to window.top throws — that only happens when framed.
    return true;
  }
}

// What a panel's library view is currently browsing — its root and the
// mount-relative directory within it (reported via `onNavigate`). This replaces
// the old `path[]` model; it is the COPY/MOVE destination for the OTHER pane.
interface PaneCwd {
  root: ExplorerRoot;
  relPath: string; // leading-slash, mount-relative ("/" = the root itself)
}

// The item currently focused in a panel (reported via onSelect / onActivate) —
// the SUBJECT of the active pane's F-key operations. Replaces the old cursor.
interface PaneItem {
  root: ExplorerRoot;
  relPath: string; // leading-slash, mount-relative
  isDir: boolean;
}

// Modal state. `null` means no dialog is open.
type Dialog =
  | { type: 'mkdir'; path: string[]; side: Side }
  | { type: 'rename'; entry: Entry; path: string[]; side: Side }
  | { type: 'delete'; entries: Entry[]; path: string[]; side: Side }
  | { type: 'copy'; entries: Entry[]; fromPath: string[]; toPath: string[]; move: boolean }
  | { type: 'view'; entry: Entry; path: string[] }
  | { type: 'spaces' };

// Absolute "/a/b" path → ["a","b"] segments; "/" → [].
function segs(absPath: string): string[] {
  return absPath.split('/').filter(Boolean);
}
// A pane location's parent dir + final name as absolute segments.
function joinSegs(root: ExplorerRoot, relPath: string): string[] {
  return [...segs(root.path), ...segs(relPath)];
}
// Build a minimal Entry for the ViewerDialog from a file's name (kind/ext only;
// the viewer reads its own bytes/size from the fs by path+name).
function entryFor(name: string): Entry {
  return {
    name,
    type: 'file',
    ext: extOf(name),
    kind: kindOf(name, 'file'),
    size: null,
    count: null,
    date: '',
  };
}

function App() {
  const [t, setTweak] = useTweaks<Tweaks>(TWEAK_DEFAULTS);
  const [, bump] = useReducer((x: number) => x + 1, 0); // fs mutation tick (chrome refresh)
  const [active, setActive] = useState<Side>('left');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [cmd, setCmd] = useState('');
  const [cmdFocus, setCmdFocus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each panel's browsed directory (the copy/move destination) and focused item
  // (the operation subject). Tracked from the library's onNavigate/onSelect/
  // onActivate callbacks; default to the IR: root with nothing focused.
  const [cwd, setCwd] = useState<Record<Side, PaneCwd>>({
    left: { root: IR_ROOT, relPath: '/' },
    right: { root: IR_ROOT, relPath: '/' },
  });
  const [item, setItem] = useState<Record<Side, PaneItem | null>>({ left: null, right: null });

  // Seed the demo tree on first run (no-op in dev / once seeded), then refresh.
  useEffect(() => {
    void seedIfEmpty().then(() => bump());
  }, []);

  // Firestore-backed spaces currently mounted, plus a lazily fetched id→name map
  // so the roots/drive tabs can show friendly labels.
  const spaceMounts = useSpaceMounts();
  const [spaceNames, setSpaceNames] = useState<Record<string, string>>({});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // theme apply
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
  }, [t.theme]);

  // A file dropped outside a pane would otherwise make the browser navigate to
  // it (replacing the app). Swallow file drags at the window level; the library
  // handles real drops onto its directory rows.
  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  // Resolve names for the mounted spaces (best-effort; labels fall back to id).
  const mountKey = spaceMounts.map((m) => spaceIdOf(m)).join(',');
  useEffect(() => {
    if (!mountKey) return;
    let alive = true;
    spaces.listSpaces()
      .then((all) => {
        if (!alive) return;
        const names: Record<string, string> = {};
        for (const s of all) if (s.name) names[s.spaceId] = s.name;
        setSpaceNames(names);
      })
      .catch(() => { /* names are optional */ });
    return () => { alive = false; };
  }, [mountKey]);

  // The full root list every panel renders (IR: tree + each mounted space).
  const roots = buildRoots(spaceMounts, spaceNames);

  // §6 "Open with the app it belongs to": the active pane's focused folder, as
  // absolute path segments — only when the focused item is actually a folder.
  // The hook resolves whether that folder lives in a mounted space with a valid
  // opener marker; it stays null otherwise so the affordance simply hides.
  const cursorFolder = ((): string[] | null => {
    const it = item[active];
    if (!it || !it.isDir) return null;
    return joinSegs(it.root, it.relPath);
  })();
  const openWith = useOpenWith(cursorFolder, spaceMounts);

  // Launch the focused folder with the app its marker names. Typed refusals
  // degrade to a toast — never a crash, never EROFS as UX (CLAUDE.md §5/§9).
  const doOpenWith = async () => {
    if (!openWith) { showToast('no openable project here'); return; }
    const res = await openWith.invoke();
    if (res.ok) return;
    const msg = ({
      cancelled: 'cancelled',
      forbidden: 'you cannot open this here',
      'no-such-task': 'no app is bound to open this',
      'invalid-params': 'could not open this folder',
    } as Record<string, string>)[res.code] ?? 'could not open this folder';
    showToast(msg);
  };

  // Navigate the active pane into a space. We can't programmatically drive the
  // library view's internal cwd, so this records the destination as the active
  // pane's tracked cwd (so a subsequent copy/move targets it) and toasts; the
  // user browses into the space via the library's own root list / breadcrumb.
  const openSpace = (mount: SandboxMount) => {
    const id = spaceIdOf(mount);
    const root = roots.find((r) => r.id === 'space:' + id);
    if (root) setCwd((prev) => ({ ...prev, [active]: { root, relPath: '/' } }));
    showToast((isWritable(mount) ? 'opened ' : 'opened (read-only) ') + mountLabel(mount));
  };

  // ---- the library's view, per side ----
  // The viewer (F3/F4 + library "Open") for a file the library asks to open.
  const openInViewer = useCallback((root: ExplorerRoot, relPath: string) => {
    const all = joinSegs(root, relPath);
    const name = all[all.length - 1] ?? '';
    setDialog({ type: 'view', entry: entryFor(name), path: all.slice(0, -1) });
  }, []);

  // One shared action bundle (mutations re-read App chrome via bump()).
  const actions = buildActions(openInViewer, bump);

  // ---- cross-pane commander operations (single-item v1; see PR notes) ----
  const otherSide: Side = active === 'left' ? 'right' : 'left';

  // The active pane's focused item as { dir segments, name } — the operation
  // subject. Null when nothing is focused (e.g. fresh roots list).
  const activeTarget = (): { entry: Entry; dir: string[] } | null => {
    const it = item[active];
    if (!it) return null;
    const all = joinSegs(it.root, it.relPath);
    const name = all[all.length - 1];
    if (!name) return null;
    const dir = all.slice(0, -1);
    // Build an Entry good enough for the dialogs (name/type/kind/ext).
    const entry: Entry = it.isDir
      ? { name, type: 'dir', ext: '', kind: 'dir', size: null, count: null, date: '' }
      : entryFor(name);
    return { entry, dir };
  };

  // The OTHER pane's current directory as absolute segments — the destination.
  const destDir = (): string[] => joinSegs(cwd[otherSide].root, cwd[otherSide].relPath);

  const doCopyMove = (move: boolean) => {
    const tgt = activeTarget();
    if (!tgt) { showToast('select an item first'); return; }
    const from = tgt.dir;
    const to = destDir();
    if (from.join('/') === to.join('/')) { showToast('source = target pane'); return; }
    setDialog({ type: 'copy', entries: [tgt.entry], fromPath: from, toPath: to, move });
  };
  const finishCopy = async (entries: Entry[], fromPath: string[], toPath: string[], move: boolean) => {
    const { count, error } = await copyEntries(fromPath, toPath, entries.map((e) => e.name), move);
    setDialog(null);
    bump();
    if (count === 0) { showToast(error ?? ('could not ' + (move ? 'move' : 'copy'))); return; }
    const verb = move ? 'moved ' : 'copied ';
    showToast(verb + count + ' item' + (count > 1 ? 's' : '') + (error ? ' · some failed: ' + error : ''));
  };
  const doDelete = () => {
    const tgt = activeTarget();
    if (!tgt) { showToast('select an item first'); return; }
    setDialog({ type: 'delete', entries: [tgt.entry], path: tgt.dir, side: active });
  };
  const finishDelete = async (entries: Entry[], path: string[]) => {
    const { count, error } = await removeEntries(path, entries.map((e) => e.name));
    setDialog(null);
    bump();
    if (count === 0) { showToast(error ?? 'could not delete'); return; }
    showToast('deleted ' + count + ' item' + (count > 1 ? 's' : '') + (error ? ' · some failed: ' + error : ''));
  };
  const doMkdir = () => {
    const c = cwd[active];
    setDialog({ type: 'mkdir', path: joinSegs(c.root, c.relPath), side: active });
  };
  const finishMkdir = async (name: string, path: string[]) => {
    const { ok, error } = await makeDir(path, name);
    setDialog(null);
    if (!ok) { showToast(error ?? 'could not create folder'); return; }
    bump();
    showToast('created /' + name);
  };
  const doRename = () => {
    const tgt = activeTarget();
    if (!tgt) { showToast('select a file first'); return; }
    setDialog({ type: 'rename', entry: tgt.entry, path: tgt.dir, side: active });
  };
  const finishRename = async (entry: Entry, newName: string, path: string[]) => {
    const { ok, error } = await renameEntry(path, entry.name, newName);
    setDialog(null);
    if (!ok) { showToast(error ?? 'rename failed'); return; }
    bump();
    showToast('renamed → ' + newName);
  };
  const doView = () => {
    const it = item[active];
    if (!it || it.isDir) { showToast('select a file to view'); return; }
    const all = joinSegs(it.root, it.relPath);
    const name = all[all.length - 1] ?? '';
    setDialog({ type: 'view', entry: entryFor(name), path: all.slice(0, -1) });
  };

  // Single dispatcher shared by the F-key bar (below) and the keyboard engine,
  // so the two stay in lockstep.
  const runFkey = (action: string) => {
    if (action === 'help') showToast('Tab switch pane · click/Enter browse · F-keys act on the focused item');
    else if (action === 'rename') doRename();
    else if (action === 'view') doView();
    else if (action === 'copy') doCopyMove(false);
    else if (action === 'move') doCopyMove(true);
    else if (action === 'mkdir') doMkdir();
    else if (action === 'delete') doDelete();
    else if (action === 'spaces') setDialog({ type: 'spaces' });
    else if (action === 'open') void doOpenWith();
    else if (action === 'quit') showToast('Go build. (quit is a no-op here)');
  };

  // ---- keyboard engine ----
  // Within-pane navigation (arrows / Enter / Home / End) is now the library
  // view's own (roving focus + Enter-to-open in its list layout). File Commander
  // keeps the GLOBAL commands: the F-keys and Tab (switch the active pane).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const fk = ({
        F1: 'help', F2: 'rename', F3: 'view', F4: 'view', F5: 'copy',
        F6: 'move', F7: 'mkdir', F8: 'delete', F9: 'spaces', F10: 'quit',
      } as Record<string, string>)[e.key];
      if (fk) {
        e.preventDefault();
        if (dialog) return;
        runFkey(fk);
        return;
      }
      if (dialog) return;
      if (cmdFocus) { if (e.key === 'Escape') (e.target as HTMLElement).blur(); return; }
      if (e.key === 'Tab') { e.preventDefault(); setActive((a) => (a === 'left' ? 'right' : 'left')); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- command line ----
  const activePathLabel = 'IR:' + (cwd[active].root.path === '/' ? '' : cwd[active].root.path) + (cwd[active].relPath === '/' ? '/' : cwd[active].relPath);
  const runCmd = () => {
    const raw = cmd.trim();
    setCmd('');
    if (!raw) return;
    const [c, ...rest] = raw.split(/\s+/);
    const arg = rest.join(' ');
    if (c === 'mkdir') {
      if (arg) void finishMkdir(arg, joinSegs(cwd[active].root, cwd[active].relPath)); else showToast('mkdir: name required');
    } else if (c === 'rm' || c === 'del') {
      showToast('use F8 to delete with confirmation');
    } else if (c === 'cd') {
      showToast('browse with the panel’s breadcrumb / folder rows');
    } else if (c === 'ls' || c === 'dir') {
      showToast(activePathLabel);
    } else if (c === 'clear') {
      // noop
    } else {
      showToast(c + ': command not found');
    }
  };

  // ---- function key bar (plain data; handlers go through runFkey) ----
  const FKEYS = [
    { k: 'F1', lbl: 'Help', action: 'help' },
    { k: 'F2', lbl: 'Rename', action: 'rename' },
    { k: 'F3', lbl: 'View', action: 'view' },
    { k: 'F4', lbl: 'Edit', action: 'view' },
    { k: 'F5', lbl: 'Copy', action: 'copy' },
    { k: 'F6', lbl: 'Move', action: 'move' },
    { k: 'F7', lbl: 'NewDir', action: 'mkdir' },
    { k: 'F8', lbl: 'Delete', action: 'delete', danger: true },
    { k: 'F9', lbl: 'Spaces', action: 'spaces' },
    { k: 'F10', lbl: 'Quit', action: 'quit' },
  ];

  const MENU = ['Files', 'Mark', 'Commands', 'Net', 'Show', 'Config'];

  // The header label for a side: its tracked browsed directory.
  const sideLabel = (side: Side): string => {
    const c = cwd[side];
    if (c.relPath === '/') return c.root.label;
    return c.root.label + c.relPath;
  };

  return (
    <div className="app" data-density={t.density} data-cursor={t.cursor} data-icons={t.icons ? 'on' : 'off'} data-emph={t.emph}>
      {/* top bar */}
      <div className={isHosted() ? 'topbar hosted' : 'topbar'}>
        <div className="brand">
          <img className="mark" src={logoMark} alt="" />
          <div className="wm">file<span className="dim"> commander</span></div>
        </div>
        <div className="menu">
          {MENU.map((m) => <button key={m} onClick={() => showToast(m + ' menu — not wired')}>{m}</button>)}
        </div>
        <span className="spacer"></span>
        <div className="stat"><span>IR:</span><span className="bar"><i></i></span><span className="v">612 mb</span><span>free</span></div>
        <span className="clock">11:45</span>
      </div>

      {/* mobile-only single-pane switcher (hidden on wide screens via CSS).
          On a phone only the active pane is shown; these tabs pick which. */}
      <div className="paneswitch">
        {(['left', 'right'] as Side[]).map((side) => (
          <button key={side} className={'pswitch' + (active === side ? ' on' : '')}
            onClick={() => setActive(side)}>
            <span className="glyph">▸</span>
            <span className="pl">{sideLabel(side)}</span>
          </button>
        ))}
      </div>

      {/* panes — each is a library FileExplorerView wrapped in File Commander
          chrome. Distinct storageKey per side persists each panel's layout. */}
      <div className="desk">
        {(['left', 'right'] as Side[]).map((side) => (
          <div key={side}
            className={'pane fcpane' + (active === side ? ' active' : '')}
            onMouseDown={() => setActive(side)}
            data-screen-label={'pane-' + side}>
            <FileExplorerView
              roots={roots}
              fs={fcFsSource}
              actions={actions}
              layout="list"
              storageKey={side === 'left' ? 'fc.left' : 'fc.right'}
              header={{ title: sideLabel(side) }}
              onNavigate={(root, relPath) => {
                setActive(side);
                setCwd((prev) => ({ ...prev, [side]: { root, relPath } }));
              }}
              onSelect={(root, relPath) => {
                setActive(side);
                setItem((prev) => ({ ...prev, [side]: { root, relPath, isDir: false } }));
              }}
              onActivate={(root, relPath, isDir) => {
                setActive(side);
                setItem((prev) => ({ ...prev, [side]: { root, relPath, isDir } }));
              }}
            />
          </div>
        ))}
      </div>

      {/* command line */}
      <div className={'cmdline' + (cmdFocus ? ' typing' : '')}>
        <span className="prompt">{activePathLabel}&gt;</span>
        <div className="field">
          <input value={cmd} placeholder="type a command — mkdir <name> · ls"
            onChange={(e) => setCmd(e.target.value)}
            onFocus={() => setCmdFocus(true)} onBlur={() => setCmdFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') runCmd(); }} />
          <span className="caret"></span>
        </div>
      </div>

      {/* function keys */}
      <div className="fkeys">
        {openWith && (
          <button className="fkey open" title="open the folder with the app it belongs to"
            onClick={() => runFkey('open')}>
            <span className="kc">↵</span><span className="lbl">{openWith.label}</span>
          </button>
        )}
        {FKEYS.map((f) => (
          <button key={f.k} className={'fkey' + (f.danger ? ' danger' : '')} onClick={() => runFkey(f.action)}>
            <span className="kc">{f.k}</span><span className="lbl">{f.lbl}</span>
          </button>
        ))}
      </div>

      {/* dialogs */}
      {dialog && dialog.type === 'mkdir' && (
        <MkDirDialog path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => void finishMkdir(name, dialog.path)} />
      )}
      {dialog && dialog.type === 'rename' && (
        <RenameDialog entry={dialog.entry} path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => void finishRename(dialog.entry, name, dialog.path)} />
      )}
      {dialog && dialog.type === 'delete' && (
        <DeleteDialog items={dialog.entries} path={dialog.path} onClose={() => setDialog(null)} onConfirm={() => void finishDelete(dialog.entries, dialog.path)} />
      )}
      {dialog && dialog.type === 'copy' && (
        <CopyDialog items={dialog.entries} fromPath={dialog.fromPath} toPath={dialog.toPath} move={dialog.move}
          onDone={() => void finishCopy(dialog.entries, dialog.fromPath, dialog.toPath, dialog.move)} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'view' && (
        <ViewerDialog entry={dialog.entry} path={dialog.path} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'spaces' && (
        <SpacesDialog
          mountedIds={new Set(spaceMounts.map(spaceIdOf))}
          onOpenSpace={openSpace}
          onToast={showToast}
          onClose={() => setDialog(null)} />
      )}

      {/* tweaks */}
      <TweaksPanel>
        <TweakSection label="Listing" />
        <TweakRadio label="Density" value={t.density} options={['compact', 'regular', 'comfy']} onChange={(v) => setTweak('density', v)} />
        <TweakToggle label="File icons" value={t.icons} onChange={(v) => setTweak('icons', v)} />
        <TweakSection label="Cursor & focus" />
        <TweakRadio label="Cursor style" value={t.cursor} options={['bar', 'filled', 'outline']} onChange={(v) => setTweak('cursor', v)} />
        <TweakSelect label="Active pane" value={t.emph} options={['glow', 'border', 'dim']} onChange={(v) => setTweak('emph', v)} />
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={t.theme} options={['dark', 'light']} onChange={(v) => setTweak('theme', v)} />
      </TweaksPanel>

      {toast && <div className="toast"><span className="k">›</span> {toast}</div>}
    </div>
  );
}

export default App;
