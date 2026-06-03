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
import {
  ROOT, nodeAt, listing, mkdir, removeEntries, copyEntries, renameEntry,
} from './lib/fs';
import type { Entry } from './lib/fs';
import type { Drive } from './data/drives';

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

// Modal state. `null` means no dialog is open.
type Dialog =
  | { type: 'mkdir'; path: string[]; side: Side }
  | { type: 'rename'; entry: Entry; path: string[]; side: Side }
  | { type: 'delete'; entries: Entry[]; path: string[]; side: Side }
  | { type: 'copy'; entries: Entry[]; fromPath: string[]; toPath: string[]; move: boolean }
  | { type: 'view'; entry: Entry; path: string[] };

function initPane(path: string[]): PaneState {
  return { path, cursor: path.length > 0 ? 1 : 0, selected: new Set(), sortKey: 'name', sortDir: 'asc' };
}

function App() {
  const [t, setTweak] = useTweaks<Tweaks>(TWEAK_DEFAULTS);
  const [, bump] = useReducer((x: number) => x + 1, 0); // fs mutation tick
  const [panes, setPanes] = useState<Record<Side, PaneState>>({
    left: initPane(['apps']),
    right: initPane(['apps', 'synth-pad']),
  });
  const [active, setActive] = useState<Side>('left');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [cmd, setCmd] = useState('');
  const [cmdFocus, setCmdFocus] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // theme apply
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
  }, [t.theme]);

  // listings
  const listFor = (p: PaneState) => listing(nodeAt(ROOT, p.path), p.sortKey, p.sortDir);
  const offsetOf = (p: PaneState) => (p.path.length > 0 ? 1 : 0);

  const patchPane = (side: Side, patch: Partial<PaneState>) =>
    setPanes((prev) => ({ ...prev, [side]: { ...prev[side], ...patch } }));

  // ---- navigation ----
  const enterDir = (side: Side, name: string) => {
    setPanes((prev) => {
      const p = prev[side];
      const np: PaneState = { ...p, path: [...p.path, name], cursor: 0, selected: new Set() };
      const items = listing(nodeAt(ROOT, np.path), np.sortKey, np.sortDir);
      np.cursor = items.length ? 1 : 0; // land on first entry (offset for "..")
      return { ...prev, [side]: np };
    });
  };
  const goUp = (side: Side) => {
    setPanes((prev) => {
      const p = prev[side];
      if (p.path.length === 0) return prev;
      const leaving = p.path[p.path.length - 1];
      const newPath = p.path.slice(0, -1);
      const items = listing(nodeAt(ROOT, newPath), p.sortKey, p.sortDir);
      const off = newPath.length > 0 ? 1 : 0;
      const idx = items.findIndex((e) => e.name === leaving);
      return { ...prev, [side]: { ...p, path: newPath, selected: new Set(), cursor: idx >= 0 ? idx + off : off } };
    });
  };
  const jumpTo = (side: Side, n: number) => {
    setPanes((prev) => {
      const p = prev[side];
      const newPath = p.path.slice(0, n);
      const items = listing(nodeAt(ROOT, newPath), p.sortKey, p.sortDir);
      return { ...prev, [side]: { ...p, path: newPath, selected: new Set(), cursor: items.length ? (newPath.length > 0 ? 1 : 0) : 0 } };
    });
  };
  const gotoDrive = (side: Side, drive: Drive) => {
    setActive(side);
    setPanes((prev) => {
      const p = prev[side];
      const items = listing(nodeAt(ROOT, drive.path), p.sortKey, p.sortDir);
      return { ...prev, [side]: { ...p, path: [...drive.path], selected: new Set(), cursor: items.length ? (drive.path.length > 0 ? 1 : 0) : 0 } };
    });
  };

  const openIndex = (side: Side, index: number) => {
    const p = panes[side];
    const off = offsetOf(p);
    if (off && index === 0) { goUp(side); return; }
    const items = listFor(p);
    const entry = items[index - off];
    if (!entry) return;
    if (entry.type === 'dir') enterDir(side, entry.name);
    else setDialog({ type: 'view', entry, path: p.path });
  };

  // ---- selection ----
  const toggleSelect = (side: Side, moveNext: boolean) => {
    setPanes((prev) => {
      const p = prev[side];
      const off = p.path.length > 0 ? 1 : 0;
      const items = listing(nodeAt(ROOT, p.path), p.sortKey, p.sortDir);
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
      const items = listing(nodeAt(ROOT, p.path), p.sortKey, p.sortDir);
      const sel = new Set<string>();
      for (const e of items) if (!p.selected.has(e.name)) sel.add(e.name);
      return { ...prev, [side]: { ...p, selected: sel } };
    });
  };

  // names to act on: selection, else cursor entry
  const targetNames = (p: PaneState): string[] => {
    if (p.selected.size) return [...p.selected];
    const items = listFor(p);
    const e = items[p.cursor - offsetOf(p)];
    return e ? [e.name] : [];
  };
  const targetEntries = (p: PaneState): Entry[] => {
    const items = listFor(p);
    const names = targetNames(p);
    return names.map((nm) => items.find((e) => e.name === nm)).filter((e): e is Entry => Boolean(e));
  };

  // ---- operations ----
  const otherSide: Side = active === 'left' ? 'right' : 'left';
  const doCopyMove = (move: boolean) => {
    const src = panes[active], dst = panes[otherSide];
    const entries = targetEntries(src);
    if (!entries.length) { showToast('nothing to ' + (move ? 'move' : 'copy')); return; }
    if (src.path.join('/') === dst.path.join('/')) { showToast('source = target pane'); return; }
    setDialog({ type: 'copy', entries, fromPath: src.path, toPath: dst.path, move });
  };
  const finishCopy = (entries: Entry[], fromPath: string[], toPath: string[], move: boolean) => {
    copyEntries(ROOT, fromPath, toPath, entries.map((e) => e.name), move);
    bump();
    patchPane(active, { selected: new Set() });
    setDialog(null);
    showToast((move ? 'moved ' : 'copied ') + entries.length + ' item' + (entries.length > 1 ? 's' : ''));
  };
  const doDelete = () => {
    const p = panes[active];
    const entries = targetEntries(p);
    if (!entries.length) { showToast('nothing to delete'); return; }
    setDialog({ type: 'delete', entries, path: p.path, side: active });
  };
  const finishDelete = (entries: Entry[], side: Side) => {
    removeEntries(ROOT, panes[side].path, entries.map((e) => e.name));
    bump();
    setPanes((prev) => {
      const p = prev[side];
      const items = listing(nodeAt(ROOT, p.path), p.sortKey, p.sortDir);
      const rowCount = items.length + (p.path.length > 0 ? 1 : 0);
      return { ...prev, [side]: { ...p, selected: new Set(), cursor: Math.min(p.cursor, Math.max(0, rowCount - 1)) } };
    });
    setDialog(null);
    showToast('deleted ' + entries.length + ' item' + (entries.length > 1 ? 's' : ''));
  };
  const doMkdir = () => setDialog({ type: 'mkdir', path: panes[active].path, side: active });
  const finishMkdir = (name: string, side: Side) => {
    if (!mkdir(ROOT, panes[side].path, name)) { showToast('name already exists'); setDialog(null); return; }
    bump();
    setPanes((prev) => {
      const p = prev[side];
      const items = listing(nodeAt(ROOT, p.path), p.sortKey, p.sortDir);
      const off = p.path.length > 0 ? 1 : 0;
      const idx = items.findIndex((e) => e.name === name);
      return { ...prev, [side]: { ...p, cursor: idx >= 0 ? idx + off : p.cursor } };
    });
    setDialog(null);
    showToast('created /' + name);
  };
  const doRename = () => {
    const p = panes[active];
    const items = listFor(p);
    const entry = items[p.cursor - offsetOf(p)];
    if (!entry) { showToast('select a file first'); return; }
    setDialog({ type: 'rename', entry, path: p.path, side: active });
  };
  const finishRename = (entry: Entry, newName: string, side: Side) => {
    if (!renameEntry(ROOT, panes[side].path, entry.name, newName)) { showToast('rename failed'); setDialog(null); return; }
    bump(); setDialog(null); showToast('renamed → ' + newName);
  };
  const doView = () => {
    const p = panes[active];
    const off = offsetOf(p);
    if (off && p.cursor === 0) { goUp(active); return; }
    const entry = listFor(p)[p.cursor - off];
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
    else if (action === 'menu') showToast('menu — not wired in this prototype');
    else if (action === 'quit') showToast('Go build. (quit is a no-op here)');
  };

  // ---- keyboard engine ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // function keys: always intercept (avoid F5 reload etc.)
      const fk = ({
        F1: 'help', F2: 'rename', F3: 'view', F4: 'view', F5: 'copy',
        F6: 'move', F7: 'mkdir', F8: 'delete', F9: 'menu', F10: 'quit',
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
        const its = listing(nodeAt(ROOT, pp.path), pp.sortKey, pp.sortDir);
        const rc = its.length + o;
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
        const node = nodeAt(ROOT, panes[active].path);
        if (node && node.type === 'dir' && node.children[arg] && node.children[arg].type === 'dir') enterDir(active, arg);
        else showToast('cd: no such folder: ' + arg);
      }
    } else if (c === 'mkdir') {
      if (arg) finishMkdir(arg, active); else showToast('mkdir: name required');
    } else if (c === 'rm' || c === 'del') {
      showToast('use F8 to delete with confirmation');
    } else if (c === 'ls' || c === 'dir') {
      showToast(activePath + ' — ' + listFor(panes[active]).length + ' items');
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
    { k: 'F9', lbl: 'Menu', action: 'menu' },
    { k: 'F10', lbl: 'Quit', action: 'quit' },
  ];

  const MENU = ['Files', 'Mark', 'Commands', 'Net', 'Show', 'Config'];

  return (
    <div className="app" data-density={t.density} data-cursor={t.cursor} data-icons={t.icons ? 'on' : 'off'} data-emph={t.emph}>
      {/* top bar */}
      <div className="topbar">
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

      {/* panes */}
      <div className="desk">
        {(['left', 'right'] as Side[]).map((side) => (
          <Pane key={side} side={side} state={panes[side]} items={listFor(panes[side])}
            active={active === side} icons={t.icons}
            onActivate={() => setActive(side)}
            onSetCursor={(i) => { setActive(side); patchPane(side, { cursor: i }); }}
            onOpen={(i) => { setActive(side); openIndex(side, i); }}
            onSort={(k) => { setActive(side); setSort(side, k); }}
            onJump={(n) => { setActive(side); jumpTo(side, n); }}
            onDrive={(d) => gotoDrive(side, d)} />
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
        <MkDirDialog path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => finishMkdir(name, dialog.side)} />
      )}
      {dialog && dialog.type === 'rename' && (
        <RenameDialog entry={dialog.entry} path={dialog.path} onClose={() => setDialog(null)} onConfirm={(name) => finishRename(dialog.entry, name, dialog.side)} />
      )}
      {dialog && dialog.type === 'delete' && (
        <DeleteDialog items={dialog.entries} path={dialog.path} onClose={() => setDialog(null)} onConfirm={() => finishDelete(dialog.entries, dialog.side)} />
      )}
      {dialog && dialog.type === 'copy' && (
        <CopyDialog items={dialog.entries} fromPath={dialog.fromPath} toPath={dialog.toPath} move={dialog.move}
          onDone={() => finishCopy(dialog.entries, dialog.fromPath, dialog.toPath, dialog.move)} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.type === 'view' && (
        <ViewerDialog entry={dialog.entry} path={dialog.path} onClose={() => setDialog(null)} />
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
