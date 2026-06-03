// file commander — create-folder dialog (F7).
import { useEffect, useRef, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';

interface Props {
  path: string[];
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export default function MkDirDialog({ path, onConfirm, onClose }: Props) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  const submit = () => { const v = name.trim(); if (v) onConfirm(v); };
  return (
    <Scrim onClose={onClose}>
      <div className="modal" onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}>
        <div className="mhead">
          <span className="mi"><Icon name="newfolder" size={19} /></span>
          <div>
            <h3>Create folder</h3>
            <div className="sub">in IR:/{path.join('/')}</div>
          </div>
        </div>
        <div className="mbody">
          <input className="minput" ref={ref} placeholder="new-folder-name" value={name}
            onChange={(e) => setName(e.target.value)} spellCheck={false} />
        </div>
        <div className="mfoot">
          <span className="hint">Enter to create · Esc to cancel</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit}>Create</button>
        </div>
      </div>
    </Scrim>
  );
}
