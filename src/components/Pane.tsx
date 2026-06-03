// file commander — a single pane (drive tabs, path crumbs, columns, listing,
// status). Sub-components (Crumbs / ColHead / Row) stay module-local so this
// file default-exports only the Pane component.
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { DRIVES } from '../data/drives';
import type { Drive } from '../data/drives';
import { fmtSize, fmtTotal } from '../lib/fs';
import type { Entry } from '../lib/fs';

export interface PaneState {
  path: string[];
  cursor: number;
  selected: Set<string>;
  sortKey: string;
  sortDir: string;
}

// A listing row, including the synthetic ".." up-entry shown when not at root.
type RowEntry = Entry & { upDir?: boolean };

function Crumbs({ path, onJump }: { path: string[]; onJump: (n: number) => void }) {
  return (
    <div className="crumbs">
      <span className="seg root" onClick={() => onJump(0)}>IR:</span>
      <span className="sl">/</span>
      {path.map((seg, i) => (
        <span key={i} className="cseg">
          <span className={'seg' + (i === path.length - 1 ? ' last' : '')} onClick={() => onJump(i + 1)}>{seg}</span>
          {i < path.length - 1 && <span className="sl">/</span>}
        </span>
      ))}
    </div>
  );
}

function ColHead({ sortKey, sortDir, onSort }: { sortKey: string; sortDir: string; onSort: (k: string) => void }) {
  const cols = [
    { k: 'name', label: 'Name', cls: '' },
    { k: 'ext', label: 'Ext', cls: '' },
    { k: 'size', label: 'Size', cls: 'r' },
    { k: 'date', label: 'Modified', cls: 'r' },
  ];
  return (
    <div className="colhead">
      {cols.map((c) => (
        <div key={c.k} className={'ch ' + c.cls + (sortKey === c.k ? ' on' : '')} onClick={() => onSort(c.k)}>
          <span>{c.label}</span>
          {sortKey === c.k && <span className="arr">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </div>
      ))}
    </div>
  );
}

interface RowProps {
  entry: RowEntry;
  isCursor: boolean;
  isSel: boolean;
  icons: boolean;
  onClick: () => void;
  onDouble: () => void;
  rowRef: React.Ref<HTMLDivElement> | null;
}

function Row({ entry, isCursor, isSel, icons, onClick, onDouble, rowRef }: RowProps) {
  const up = entry.upDir;
  const cls = ['row'];
  if (entry.type === 'dir') cls.push('dir');
  if (up) cls.push('up');
  if (isCursor) cls.push('cursor');
  if (isSel) cls.push('sel');
  const iconName = up ? 'folderUp' : entry.type === 'dir' ? 'folder' : entry.kind;
  return (
    <div className={cls.join(' ')} data-kind={entry.kind} ref={rowRef} onClick={onClick} onDoubleClick={onDouble}>
      <div className="name">
        {icons && <span className="ic-cell"><Icon name={iconName} size={15} /></span>}
        <span className="fname">{up ? '..' : entry.name}</span>
      </div>
      <div className="ext">{up ? '' : entry.ext}</div>
      <div className="size">{up ? '<UP>' : entry.type === 'dir' ? entry.count + ' it' : fmtSize(entry.size)}</div>
      <div className="date">{up ? '' : entry.date}</div>
    </div>
  );
}

interface PaneProps {
  side: string;
  state: PaneState;
  items: Entry[];
  active: boolean;
  icons: boolean;
  spaces?: Drive[];
  onActivate: () => void;
  onSetCursor: (i: number) => void;
  onOpen: (i: number) => void;
  onSort: (k: string) => void;
  onJump: (n: number) => void;
  onDrive: (d: Drive) => void;
  onUpload: (dt: DataTransfer) => void;
}

export default function Pane({
  side, state, items, active, icons, spaces = [],
  onActivate, onSetCursor, onOpen, onSort, onJump, onDrive, onUpload,
}: PaneProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  // Drag-and-drop file upload. `dragDepth` rides enter/leave so the overlay
  // doesn't flicker as the pointer crosses child rows; we only react to drags
  // that actually carry files (not text/internal drags).
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const onDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    onActivate();
    onUpload(e.dataTransfer);
  };

  // keep cursor row in view
  useEffect(() => {
    if (active && cursorRef.current && listRef.current) {
      const el = cursorRef.current, box = listRef.current;
      const top = el.offsetTop, bot = top + el.offsetHeight;
      if (top < box.scrollTop) box.scrollTop = top - 4;
      else if (bot > box.scrollTop + box.clientHeight) box.scrollTop = bot - box.clientHeight + 4;
    }
  }, [state.cursor, active]);

  const dirCount = items.filter((e) => e.type === 'dir').length;
  const fileCount = items.filter((e) => e.type === 'file').length;
  const selNames = state.selected;
  const selItems = items.filter((e) => selNames.has(e.name));
  const selBytes = selItems.reduce((s, e) => s + (e.size || 0), 0);
  const curEntry = items[state.cursor - 1]; // -1 because of ".." row offset

  // rows including ".." at top (when not at root)
  const rows: RowEntry[] = [];
  if (state.path.length > 0) rows.push({ upDir: true, type: 'dir', kind: 'dir', name: '..', ext: '', count: 0, size: null, date: '' });
  for (const it of items) rows.push(it);

  const allDrives = [...DRIVES, ...spaces];
  const here = state.path.join('/');
  const activeDrive = here === '' ? 'ir' : (allDrives.find((d) => d.path.join('/') === here)?.id ?? null);

  return (
    <div className={'pane' + (active ? ' active' : '') + (dropping ? ' dropping' : '')}
      onMouseDown={onActivate}
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      data-screen-label={'pane-' + side}>
      {dropping && (
        <div className="dropmask">
          <div className="dropmsg">
            <Icon name="folderUp" size={22} />
            <span>drop to upload to <b>IR:/{here}</b></span>
          </div>
        </div>
      )}
      <div className="drives">
        {allDrives.map((d) => {
          const space = d.id.startsWith('space:');
          return (
            <button key={d.id} title={space ? 'space ' + d.id.slice(6) : undefined}
              className={'dtab' + (space ? ' space' : '') + (activeDrive === d.id ? ' on' : '')}
              onClick={() => onDrive(d)}>
              <span className="glyph">{space ? '◆' : '▸'}</span>{d.label}
            </button>
          );
        })}
        <span className="grow"></span>
        <span className="free">{items.length} items</span>
      </div>

      <div className="pathbar">
        <Crumbs path={state.path} onJump={onJump} />
        <button className="up" title="Up one level" onClick={() => onJump(state.path.length - 1 < 0 ? 0 : state.path.length - 1)}>
          <Icon name="up" size={15} />
        </button>
      </div>

      <ColHead sortKey={state.sortKey} sortDir={state.sortDir} onSort={onSort} />

      <div className="list" ref={listRef}>
        {rows.map((entry, i) => {
          const isCursor = i === state.cursor;
          const isSel = !entry.upDir && selNames.has(entry.name);
          return (
            <Row
              key={(entry.upDir ? '..' : entry.name) + i}
              entry={entry} isCursor={isCursor} isSel={isSel} icons={icons}
              rowRef={isCursor ? cursorRef : null}
              onClick={() => onSetCursor(i)}
              onDouble={() => onOpen(i)}
            />
          );
        })}
      </div>

      <div className="statusbar">
        {selItems.length > 0 ? (
          <span className="seg sel"><span className="v">{selItems.length}</span> selected · <span className="v">{fmtTotal(selBytes)}</span></span>
        ) : (
          <span className="seg">
            {curEntry ? (
              <span><span className="v">{curEntry.name}</span> · {curEntry.type === 'dir' ? curEntry.count + ' items' : fmtSize(curEntry.size)}</span>
            ) : <span>..</span>}
          </span>
        )}
        <span className="grow"></span>
        <span className="total">{dirCount} dir · {fileCount} file</span>
      </div>
    </div>
  );
}
