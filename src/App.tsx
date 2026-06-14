// Root component — immediately.run renders the default export of THIS file.
// Global CSS is imported here (not in main.tsx) because immediately.run's
// runtime never loads main.tsx; anything the rendered tree needs must be
// reachable from App.tsx.
//
// file commander — an orthodox two-pane file manager (think Norton/Total
// Commander) over an in-memory virtual filesystem, dressed in the
// immediately.run brand. State, the keyboard engine, the chrome and the tweaks
// panel live here; the pane, dialogs, icons and filesystem are imported.
import './index.css';
import './App.css';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import logoMark from './assets/logo-mark.png';
import Pane from './components/Pane';
import type { PaneState } from './components/Pane';
import { TweaksPanel, TweakSection, TweakRadio, TweakToggle, TweakSelect } from './components/Tweaks';
import { useTweaks } from './hooks/useTweaks';
import MkDirDialog from './components/dialogs/MkDirDialog';
import RenameDialog from './components/dialogs/RenameDialog';
import DeleteDialog from './components/dialogs/DeleteDialog';
import CopyDialog from './components/dialogs/CopyDialog';
import ViewerDialog from './components/dialogs/ViewerDialog';
import SpacesDialog from './components/dialogs/SpacesDialog';
import {
  listDir, makeDir, removeEntries, copyEntries, renameEntry, seedIfEmpty,
  collectUploads, writeUploads,
} from './lib/fs';
import type { Entry } from './lib/fs';
import type { Drive } from './data/drives';
import { useSpaceMounts, spaceIdOf, mountSegments, mountName, mountLabel, isWritable, spaces } from './hooks/useSpaces';
import type { SandboxMount } from './hooks/useSpaces';

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

// Modal state. `null` means no dialog is open.
type Dialog =
  | { type: 'mkdir'; path: string[]; side: Side }
  | { type: 'rename'; entry: Entry; path: string[]; side: Side }
  | { type: 'delete'; entries: Entry[]; path: string[]; side: Side }
  | { type: 'copy'; entries: Entry[]; fromPath: string[]; toPath: string[]; move: boolean }
  | { type: 'view'; entry: Entry; path: string[] }
  | { type: 'spaces' };

function initPane(path: string[]): PaneState {
  return { path, cursor: path.length > 0 ? 1 : 0, selected: new Set(), sortKey: 'name', sortDir: 'asc' };
}

function App() {
  const [t, setTweak] = useTweaks<Tweaks>(TWEAK_DEFAULTS);
  const [fsTick, bump] = useReducer((x: number) => x + 1, 0); // fs mutation tick
  const [panes, setPanes] = useState<Record<Side, PaneState>>({
    left: initPane([]),
    right: initPane(['apps']),
  });
  // Listings come from the real filesystem (async). Each side's rows are cached
  // here and re-read whenever its path/sort changes or after a mutation (bump).
  const [listings, setListings] = useState<Record<Side, Entry[]>>({ left: [], right: [] });
  const [active, setActive] = useState<Side>('left');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [cmd, setCmd] = useState('');
  const [cmdFocus, setCmdFocus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-side request counter (drops out-of-order async listings) and a one-shot
  // hint for which entry the cursor should land on after the next reload.
  const reqIds = useRef<Record<Side, number>>({ left: 0, right: 0 });
  const focusName = useRef<Record<Side, string | null>>({ left: null, right: null });

  // Read a side's directory and store it, clamping/placing the cursor once the
  // rows are known. Stale responses (path changed mid-flight) are discarded.
  const reload = useCallback((side: Side, path: string[], sortKey: string, sortDir: string) => {
    const id = ++reqIds.current[side];
    void listDir(path, sortKey, sortDir).then((items) => {
      if (reqIds.current[side] !== id) return;
      setListings((prev) => ({ ...prev, [side]: items }));
      setPanes((prev) => {
        const p = prev[side];
        const off = p.path.length > 0 ? 1 : 0;
        let cursor = p.cursor;
        const want = focusName.current[side];
        if (want) {
          const idx = items.findIndex((e) => e.name === want);
          if (idx >= 0) cursor = idx + off;
          focusName.current[side] = null;
        }
        const rowCount = items.length + off;
        cursor = Math.max(0, Math.min(rowCount - 1, cursor));
        return { ...prev, [side]: { ...p, cursor } };
      });
    });
  }, []);

  // Seed the demo tree on first run (no-op in dev / once seeded), then load.
  useEffect(() => {
    void seedIfEmpty().then(() => bump());
  }, []);

  // Reload both panes when their path/sort changes or a mutation bumps the tick.
  const lSig = panes.left.path.join('/') + '|' + panes.left.sortKey + '|' + panes.left.sortDir;
  const rSig = panes.right.path.join('/') + '|' + panes.right.sortKey + '|' + panes.right.sortDir;
  useEffect(() => {
    reload('left', panes.left.path, panes.left.sortKey, panes.left.sortDir);
    reload('right', panes.right.path, panes.right.sortKey, panes.right.sortDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lSig, rSig, fsTick, reload]);

  // Firestore-backed spaces currently mounted (at /spaces/{id}), plus a lazily
  // fetched id→name map so drive tabs can show friendly labels.
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
  // it (replacing the app). Swallow file drags at the window level; panes call
  // preventDefault themselves to handle real drops.
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

  // Resolve names for the mounted spaces (best-effort; tabs fall back to id).
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

  // Drive tabs for mounted spaces, appended after the built-in IR: drives. The
  // tab navigates to the mount's REAL path (host-decided, e.g. /spaces/{id} or
  // /mnt/{hash}) — never a reconstructed one — and flags a read-only mount.
  const spaceDrives: Drive[] = spaceMounts.map((m) => {
    const id = spaceIdOf(m);
    return {
      id: 'space:' + id,
      label: mountName(m) || spaceNames[id] || id.slice(0, 8),
      path: mountSegments(m),
      free: isWritable(m) ? '' : 'read-only',
    };
  });

  // Navigate the active pane into a space using the mount's actual path.
  const openSpace = (mount: SandboxMount) => {
    setPanes((prev) => ({
      ...prev,
      [active]: { ...prev[active], path: mountSegments(mount), selected: new Set(), cursor: 1 },
    }));
    showToast((isWritable(mount) ? 'opened ' : 'opened (read-only) ') + mountLabel(mount));
  };

  // Drag-and-drop upload: write the dropped files/folders into `side`'s current
  // directory, then refresh and land the cursor on the first new entry. The
  // DataTransfer is read synchronously inside collectUploads (it empties once
  // the drop event returns), so call it without awaiting first.
  const uploadTo = useCallback((side: Side, dt: DataTransfer) => {
    const dest = panes[side].path;
    void collectUploads(dt).then(async (tasks) => {
      if (tasks.length === 0) return;
      const { count, firstName, error } = await writeUploads(dest, tasks);
      if (count === 0) { showToast(error ?? 'nothing uploaded'); return; }
      focusName.current[side] = firstName;
      bump();
      showToast(`uploaded ${count} file${count === 1 ? '' : 's'}`);
    });
  }, [panes, showToast]);

  // listings (cached from the filesystem; see reload above)
  const listFor = (side: Side) => listings[side];
  const offsetOf = (p: PaneState) => (p.path.length > 0 ? 1 : 0);

  const patchPane = (side: Side, patch: Partial<PaneState>) =>
    setPanes((prev) => ({ ...prev, [side]: { ...prev[side], ...patch } }));

  // ---- navigation ---- (cursor is placed/clamped by reload once rows arrive)
  const enterDir = (side: Side, name: string) => {
    setPanes((prev) => {
      const p = prev[side];
      return { ...prev, [side]: { ...p, path: [...p.path, name], cursor: 1, selected: new Set() } };
    });
  };
  const goUp = (side: Side) => {
    setPanes((prev) => {
      const p = prev[side];
      if (p.path.length === 0) return prev;
      focusName.current[side] = p.path[p.path.length - 1]; // re-select the dir we left
      return { ...prev, [side]: { ...p, path: p.path.slice(0, -1), selected: new Set(), cursor: 1 } };
    });
  };
  const jumpTo = (side: Side, n: number) => {
    setPanes((prev) => {
      const p = prev[side];
      return { ...prev, [side]: { ...p, path: p.path.slice(0, n), selected: new Set(), cursor: 1 } };
    });
  };
  const gotoDrive = (side: Side, drive: Drive) => {
    setActive(side);
    setPanes((prev) => {
      const p = prev[side];
      return { ...prev, [side]: { ...p, path: [...drive.path], selected: new Set(), cursor: 1 } };
    });
  };

  const openIndex = (side: Side, index: number) => {
    const p = panes[side];
    const off = offsetOf(p);
    if (off && index === 0) { goUp(side); return; }
    const entry = listFor(side)[index - off];
    if (!entry) return;
    if (entry.type === 'dir') enterDir(side, entry.name);
    else setDialog({ type: 'view', entry, path: p.path });
  };

  // ---- selection ----
  const toggleSelect = (side: Side, moveNext: boolean) => {
    setPanes((prev) => {
      const p = prev[side];
      const off = p.path.length > 0 ? 1 : 0;
      const items = listings[side];
      const entry = items[p.cursor - off];
      const sel = new Set(p.selected);
      if (entry) { if (sel.has(entry.name)) sel.delete(entry.name); else sel.add(entry.name); }
      const rowCount = items.length + off;
      const cursor = moveNext ? Math.min(rowCount - 1, p.cursor + 1) : p.cursor;
      return { ...prev, [side]: { ...p, selected: sel, cursor } };
    });
  };
  const invertSelect = (side: Side) => {
    setPanes((prev) => {
      const p = prev[side];
      const sel = new Set<string>();
      for (const e of listings[side]) if (!p.selected.has(e.name)) sel.add(e.name);
      return { ...prev, [side]: { ...p, selected: sel } };
    });
  };

  // names to act on: selection, else cursor entry
  const targetNames = (side: Side): string[] => {
    const p = panes[side];
    if (p.selected.size) return [...p.selected];
    const e = listings[side][p.cursor - offsetOf(p)];
    return e ? [e.name] : [];
  };
  const targetEntries = (side: Side): Entry[] => {
    const items = listings[side];
    return targetNames(side).map((nm) => items.find((e) => e.name === nm)).filter((e): e is Entry => Boolean(e));
  };

  // ---- operations ---- (mutations hit the real fs, then bump() re-reads)
  const otherSide: Side = active === 'left' ? 'right' : 'left';
  const doCopyMove = (move: boolean) => {
    const src = panes[active], dst = panes[otherSide];
    const entries = targetEntries(active);
    if (!entries.length) { showToast('nothing to ' + (move ? 'move' : 'copy')); return; }
    if (src.path.join('/') === dst.path.join('/')) { showToast('source = target pane'); return; }
    setDialog({ type: 'copy', entries, fromPath: src.path, toPath: dst.path, move });
  };
  const finishCopy = async (entries: Entry[], fromPath: string[], toPath: string[], move: boolean) => {
    const { count, error } = await copyEntries(fromPath, toPath, entries.map((e) => e.name), move);
    patchPane(active, { selected: new Set() });
    setDialog(null);
    bump();
    if (count === 0) { showToast(error ?? ('could not ' + (move ? 'move' : 'copy'))); return; }
    const verb = move ? 'moved ' : 'copied ';
    showToast(verb + count + ' item' + (count > 1 ? 's' : '') + (error ? ' · some failed: ' + error : ''));
  };
  const doDelete = () => {
    const entries = targetEntries(active);
    if (!entries.length) { showToast('nothing to delete'); return; }
    setDialog({ type: 'delete', entries, path: panes[active].path, side: active });
  };
  const finishDelete = async (entries: Entry[], side: Side) => {
    const { count, error } = await removeEntries(panes[side].path, entries.map((e) => e.name));
    patchPane(side, { selected: new Set() }); // reload clamps the cursor
    setDialog(null);
    bump();
    if (count === 0) { showToast(error ?? 'could not delete'); return; }
    showToast('deleted ' + count + ' item' + (count > 1 ? 's' : '') + (error ? ' · some failed: ' + error : ''));
  };
  const doMkdir = () => setDialog({ type: 'mkdir', path: panes[active].path, side: active });
  const finishMkdir = async (name: string, side: Side) => {
    const { ok, error } = await makeDir(panes[side].path, name);
    setDialog(null);
    if (!ok) { showToast(error ?? 'could not create folder'); return; }
    focusName.current[side] = name; // land the cursor on the new folder
    bump();
    showToast('created /' + name);
  };
  const doRename = () => {
    const p = panes[active];
    const entry = listFor(active)[p.cursor - offsetOf(p)];
    if (!entry) { showToast('select a file first'); return; }
    setDialog({ type: 'rename', entry, path: p.path, side: active });
  };
  const finishRename = async (entry: Entry, newName: string, side: Side) => {
    const { ok, error } = await renameEntry(panes[side].path, entry.name, newName);
    setDialog(null);
    if (!ok) { showToast(error ?? 'rename failed'); return; }
    focusName.current[side] = newName;
    bump();
    showToast('renamed → ' + newName);
  };
  const doView = () => {
    const p = panes[active];
    const off = offsetOf(p);
    if (off && p.cursor === 0) { goUp(active); return; }
    const entry = listFor(active)[p.cursor - off];
    if (!entry) return;
    if (entry.type === 'dir') enterDir(active, entry.name);
    else setDialog({ type: 'view', entry, path: p.path });
  };

  const setSort = (side: Side, key: string) => {
    setPanes((prev) => {
      const p = prev[side];
      const dir = p.sortKey === key && p.sortDir === 'asc' ? 'desc' : 'asc';
      return { ...prev, [side]: { ...p, sortKey: key, sortDir: dir } };
    });
  };

  // Single dispatcher shared by the F-key bar (below) and the keyboard engine,
  // so the two stay in lockstep.
  const runFkey = (action: string) => {
    if (action === 'help') showToast('↑↓ move · Tab switch · Enter open · Ins select · F-keys act');
    else if (action === 'rename') doRename();
    else if (action === 'view') doView();
    else if (action === 'copy') doCopyMove(false);
    else if (action === 'move') doCopyMove(true);
    else if (action === 'mkdir') doMkdir();
    else if (action === 'delete') doDelete();
    else if (action === 'spaces') setDialog({ type: 'spaces' });
    else if (action === 'quit') showToast('Go build. (quit is a no-op here)');
  };

  // ---- keyboard engine ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // function keys: always intercept (avoid F5 reload etc.)
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

      const p = panes[active];
      const moveCursor = (fn: (c: number, rc: number) => number) => setPanes((prev) => {
        const pp = prev[active];
        const o = pp.path.length > 0 ? 1 : 0;
        const rc = listings[active].length + o;
        const c = Math.max(0, Math.min(rc - 1, fn(pp.cursor, rc)));
        return { ...prev, [active]: { ...pp, cursor: c } };
      });

      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveCursor((c) => c + 1); break;
        case 'ArrowUp': e.preventDefault(); moveCursor((c) => c - 1); break;
        case 'Home': e.preventDefault(); moveCursor(() => 0); break;
        case 'End': e.preventDefault(); moveCursor((_c, rc) => rc - 1); break;
        case 'PageDown': e.preventDefault(); moveCursor((c) => c + 12); break;
        case 'PageUp': e.preventDefault(); moveCursor((c) => c - 12); break;
        case 'Tab': e.preventDefault(); setActive((a) => (a === 'left' ? 'right' : 'left')); break;
        case 'Enter': e.preventDefault(); openIndex(active, p.cursor); break;
        case 'Backspace': e.preventDefault(); goUp(active); break;
        case 'Insert': e.preventDefault(); toggleSelect(active, true); break;
        case ' ': e.preventDefault(); toggleSelect(active, false); break;
        case '*': e.preventDefault(); invertSelect(active); break;
        case 'Delete': e.preventDefault(); doDelete(); break;
        case 'Escape': patchPane(active, { selected: new Set() }); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- command line ----
  const activePath = 'IR:/' + panes[active].path.join('/');
  const runCmd = () => {
    const raw = cmd.trim();
    setCmd('');
    if (!raw) return;
    const [c, ...rest] = raw.split(/\s+/);
    const arg = rest.join(' ');
    if (c === 'cd') {
      if (arg === '..') goUp(active);
      else if (arg === '/' || arg === '~') jumpTo(active, 0);
      else {
        const found = listings[active].find((e) => e.name === arg && e.type === 'dir');
        if (found) enterDir(active, arg);
        else showToast('cd: no such folder: ' + arg);
      }
    } else if (c === 'mkdir') {
      if (arg) void finishMkdir(arg, active); else showToast('mkdir: name required');
    } else if (c === 'rm' || c === 'del') {
      showToast('use F8 to delete with confirmation');
    } else if (c === 'ls' || c === 'dir') {
      showToast(activePath + ' — ' + listFor(active).length + ' items');
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
        {(['left', 'right'] as Side[]).map((side) => {
          const p = panes[side];
          const label = p.path.length ? p.path[p.path.length - 1] : 'IR:/';
          return (
            <button key={side} className={'pswitch' + (active === side ? ' on' : '')}
              onClick={() => setActive(side)}>
              <span className="glyph">▸</span>
              <span className="pl">{label}</span>
              <span className="pn">{listFor(side).length}</span>
            </button>
          );
        })}
      </div>

      {/* panes */}
      <div className="desk">
        {(['left', 'right'] as Side[]).map((side) => (
          <Pane key={side} side={side} state={panes[side]} items={listFor(side)}
            active={active === side} icons={t.icons} spaces={spaceDrives}
            onActivate={() => setActive(side)}
            onSetCursor={(i) => { setActive(side); patchPane(side, { cursor: i }); }}
            onOpen={(i) => { setActive(side); openIndex(side, i); }}
            onSort={(k) => { setActive(side); setSort(side, k); }}
            onJump={(n) => { setActive(side); jumpTo(side, n); }}
            onDrive={(d) => gotoDrive(side, d)}
            onUpload={(dt) => uploadTo(side, dt)} />
        ))}
      </div>

      {/* command line */}
      <div className={'cmdline' + (cmdFocus ? ' typing' : '')}>
        <span className="prompt">{activePath}&gt;</span>
        <div className="field">
          <input value={cmd} placeholder="type a command — cd <dir> · mkdir <name> · ls"
            onChange={(e) => setCmd(e.target.value)}
            onFocus={() => setCmdFocus(true)} onBlur={() => setCmdFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') runCmd(); }} />
          <span className="caret"></span>
        </div>
      </div>

      {/* function keys */}
      <div className="fkeys">
        {FKEYS.map((f) => (
          <button key={f.k} className={'fkey' + (f.danger ? ' danger' : '')} onClick={() => runFkey(f.action)}>
            <span className="kc">{f.k}</span><span className="lbl">{f.lbl}</span>
          </button>
        ))}
      </div>

      {/* dialogs */}
      {dialog && dialog.type === 'mkdir' && (
        <MkDirDialog path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => void finishMkdir(name, dialog.side)} />
      )}
      {dialog && dialog.type === 'rename' && (
        <RenameDialog entry={dialog.entry} path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => void finishRename(dialog.entry, name, dialog.side)} />
      )}
      {dialog && dialog.type === 'delete' && (
        <DeleteDialog items={dialog.entries} path={dialog.path} onClose={() => setDialog(null)} onConfirm={() => void finishDelete(dialog.entries, dialog.side)} />
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
