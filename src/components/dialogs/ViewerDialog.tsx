// file commander — file viewer with tiny syntax highlight (F3 / F4). Reads the
// real file bytes from the filesystem; known-binary kinds are not decoded.
import { useEffect, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';
import { readFileText, fmtSize } from '../../lib/fs';
import type { Entry } from '../../lib/fs';
import { highlight } from '../../lib/highlight';

interface Props {
  entry: Entry;
  path: string[];
  onClose: () => void;
}

export default function ViewerDialog({ entry, path, onClose }: Props) {
  const binary = entry.kind === 'image' || entry.kind === 'archive';
  const [text, setText] = useState<string | null>(null);
  const pathKey = path.join('/');
  useEffect(() => {
    if (binary) return;
    let alive = true;
    void readFileText(path, entry.name).then((t) => { if (alive) setText(t); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.name, pathKey, binary]);
  const src = binary
    ? `// ${entry.name}\n// binary content (${fmtSize(entry.size)}) — not shown`
    : (text ?? 'loading…');
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F3' || e.key === 'F10') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <Scrim onClose={onClose}>
      <div className="modal viewer" style={{ width: 'min(720px,94vw)' }}>
        <div className="mhead">
          <span className="mi"><Icon name={entry.kind} size={18} /></span>
          <div>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: '16px', fontWeight: 700 }}>{entry.name}</h3>
            <div className="sub">IR:/{path.join('/')}/{entry.name}</div>
          </div>
          <span style={{ flex: 1 }}></span>
          <button className="btn ghost" onClick={onClose} style={{ padding: '6px 14px' }}>Close</button>
        </div>
        <div className="vmeta">
          <span>{fmtSize(entry.size)}</span>
          <span>·</span>
          <span className="v">{entry.kind}</span>
          <span>·</span>
          <span>{entry.date}</span>
          <span style={{ flex: 1 }}></span>
          <span>F3 / Esc to close</span>
        </div>
        <pre dangerouslySetInnerHTML={{ __html: highlight(src, entry.name) }}></pre>
      </div>
    </Scrim>
  );
}
