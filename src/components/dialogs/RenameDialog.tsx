// file commander — rename dialog (F2).
import { useEffect, useRef, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';
import type { Entry } from '../../lib/fs';

interface Props {
  entry: Entry;
  path: string[];
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export default function RenameDialog({ entry, path, onConfirm, onClose }: Props) {
  const [name, setName] = useState(entry.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.focus();
    const dot = entry.type === 'dir'
      ? entry.name.length
      : entry.name.lastIndexOf('.') > 0 ? entry.name.lastIndexOf('.') : entry.name.length;
    el.setSelectionRange(0, dot);
  }, [entry]);
  const submit = () => { const v = name.trim(); if (v && v !== entry.name) onConfirm(v); else onClose(); };
  return (
    <Scrim onClose={onClose}>
      <div className="modal" onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}>
        <div className="mhead">
          <span className="mi"><Icon name={entry.type === 'dir' ? 'folder' : entry.kind} size={18} /></span>
          <div>
            <h3>Rename</h3>
            <div className="sub">IR:/{path.join('/')}/{entry.name}</div>
          </div>
        </div>
        <div className="mbody">
          <input className="minput" ref={ref} value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </div>
        <div className="mfoot">
          <span className="hint">Enter to rename · Esc to cancel</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Rename</button>
        </div>
      </div>
    </Scrim>
  );
}
