// file commander — file viewer with tiny syntax highlight (F3 / F4). Reads the
// real file bytes from the filesystem: text is decoded + highlighted, images
// are rendered via the SDK's object-URL bridge; other binary kinds show a note.
import { useEffect, useState } from 'react';
import { useObjectUrl } from '@immediately-run/sdk';
import type { SandboxMount } from '@immediately-run/sdk';
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

// The whole sandbox fs, `/`-rooted. File paths here are absolute, so anchor at
// root and pass the path as mount-relative (leading slash stripped).
const ROOT_MOUNT: SandboxMount = { path: '/', type: 'file' };

export default function ViewerDialog({ entry, path, onClose }: Props) {
  const isImage = entry.kind === 'image';
  const isArchive = entry.kind === 'archive';
  const showText = !isImage && !isArchive;
  const [text, setText] = useState<string | null>(null);
  const pathKey = path.join('/');

  // The SDK hook reads the file into an object URL and owns the create/revoke +
  // stale-result handling that this component used to do by hand. It's idle
  // (no read) for non-image entries.
  const { url: imgUrl, loading: imgLoading, error: imgError } = useObjectUrl(
    isImage ? ROOT_MOUNT : null,
    isImage ? [...path, entry.name].join('/') : null,
  );

  useEffect(() => {
    if (!showText) return;
    let alive = true;
    void readFileText(path, entry.name).then((t) => { if (alive) setText(t); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.name, pathKey, showText]);

  const src = isArchive
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
        {isImage ? (
          <div className="vimg">
            {imgError ? (
              <div className="vnote">could not load image</div>
            ) : imgUrl ? (
              <img src={imgUrl} alt={entry.name} />
            ) : (
              <div className="vnote">{imgLoading ? 'loading…' : 'could not load image'}</div>
            )}
          </div>
        ) : (
          <pre dangerouslySetInnerHTML={{ __html: highlight(src, entry.name) }}></pre>
        )}
      </div>
    </Scrim>
  );
}
