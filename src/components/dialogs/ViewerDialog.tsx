// file commander — file viewer with tiny syntax highlight (F3 / F4). Reads the
// real file bytes from the filesystem: text is decoded + highlighted, images
// are rendered from a Blob URL; other binary kinds show a short note.
import { useEffect, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';
import { readFileText, readFileBytes, imageMime, fmtSize } from '../../lib/fs';
import type { Entry } from '../../lib/fs';
import { highlight } from '../../lib/highlight';

interface Props {
  entry: Entry;
  path: string[];
  onClose: () => void;
}

export default function ViewerDialog({ entry, path, onClose }: Props) {
  const isImage = entry.kind === 'image';
  const isArchive = entry.kind === 'archive';
  const showText = !isImage && !isArchive;
  const [text, setText] = useState<string | null>(null);
  // Image render state, tagged with the file it belongs to so a stale result
  // (from a previous file) is treated as "still loading" until the new one
  // resolves — and so we never set state synchronously during the effect.
  const [img, setImg] = useState<{ name: string; url: string | null; error: boolean } | null>(null);
  const pathKey = path.join('/');

  useEffect(() => {
    if (!showText) return;
    let alive = true;
    void readFileText(path, entry.name).then((t) => { if (alive) setText(t); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.name, pathKey, showText]);

  // Load image bytes into a Blob URL; revoke it on unmount/change to avoid leaks.
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    let url: string | null = null;
    void readFileBytes(path, entry.name).then((bytes) => {
      if (!alive) return;
      if (!bytes) { setImg({ name: entry.name, url: null, error: true }); return; }
      url = URL.createObjectURL(new Blob([bytes], { type: imageMime(entry.name) ?? 'application/octet-stream' }));
      setImg({ name: entry.name, url, error: false });
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.name, pathKey, isImage]);

  // Only trust the image state if it matches the file currently shown.
  const curImg = img && img.name === entry.name ? img : null;

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
            {curImg?.error ? (
              <div className="vnote">could not load image</div>
            ) : curImg?.url ? (
              <img src={curImg.url} alt={entry.name} />
            ) : (
              <div className="vnote">loading…</div>
            )}
          </div>
        ) : (
          <pre dangerouslySetInnerHTML={{ __html: highlight(src, entry.name) }}></pre>
        )}
      </div>
    </Scrim>
  );
}
