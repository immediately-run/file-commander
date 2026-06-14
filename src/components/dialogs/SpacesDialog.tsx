// file commander — Spaces manager (F9). Create or mount Firestore-backed user
// filesystems; the host (or @immediately-run/dev-fs locally) owns the sign-in /
// create-or-pick UX. Once mounted, a space lives at the mount's own path and is
// browsed and edited like any other path, so opening one just navigates the
// active pane there.
import { useEffect, useRef, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';
import { spaces, spaceErrorMessage } from '../../hooks/useSpaces';
import type { SandboxMount, SpaceInfo } from '../../hooks/useSpaces';

interface Props {
  mountedIds: Set<string>;
  onOpenSpace: (mount: SandboxMount) => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

export default function SpacesDialog({ mountedIds, onOpenSpace, onToast, onClose }: Props) {
  const [list, setList] = useState<SpaceInfo[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => { if (nameRef.current) nameRef.current.focus(); }, []);
  useEffect(() => {
    let alive = true;
    spaces.listSpaces()
      .then((s) => { if (alive) setList(s); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, []);

  // Run a space action, surface errors as a toast, and navigate on success. A
  // watchdog guards the case the host accepts the request but never confirms the
  // mount (createSpace doesn't auto-mount everywhere): rather than leaving the
  // button stuck forever (R3-70 finding F8), we time out, tell the user, and
  // close so they can re-open Spaces and mount the space once it's ready.
  const run = async (action: () => Promise<SandboxMount>) => {
    if (busy) return;
    setBusy(true);
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      onToast('the host hasn’t confirmed yet — re-open Spaces to mount it');
      if (aliveRef.current) setBusy(false);
      onClose();
    }, 8000);
    try {
      const mount = await action();
      if (settled) return; // watchdog already closed the dialog
      settled = true;
      clearTimeout(guard);
      onOpenSpace(mount);
      onClose();
    } catch (err) {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      onToast(spaceErrorMessage(err));
      if (aliveRef.current) setBusy(false);
    }
  };

  const create = () => run(() => spaces.createSpace({ name: name.trim() || undefined }));

  return (
    <Scrim onClose={onClose}>
      <div className="modal" style={{ width: 'min(520px,94vw)' }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="mhead">
          <span className="mi"><Icon name="folder" size={19} /></span>
          <div>
            <h3>Spaces</h3>
            <div className="sub">Firestore-backed user filesystems · mounted by the host</div>
          </div>
        </div>

        <div className="mbody" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="minput" ref={nameRef} placeholder="new space name" value={name} spellCheck={false}
              style={{ flex: 1 }}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
            <button className="btn primary" onClick={create} disabled={busy}>
              {busy ? 'Working…' : 'Create'}
            </button>
          </div>

          <div className="spaces-list">
            {list === null && <div className="sub">loading spaces…</div>}
            {list !== null && list.length === 0 && (
              <div className="sub">no spaces yet — create one above.</div>
            )}
            {list?.map((s) => (
              <button key={s.spaceId} className="space-row" disabled={busy}
                onClick={() => run(() => spaces.mountSpace({ spaceId: s.spaceId }))}>
                <span className="space-ic"><Icon name="folder" size={15} /></span>
                <span className="space-name">{s.name || s.spaceId}</span>
                <span className="space-id">{s.spaceId}</span>
                {s.role && <span className="space-role">{s.role}</span>}
                <span className="space-go">{mountedIds.has(s.spaceId) ? 'open' : 'mount'} →</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mfoot">
          <span className="hint">Create or mount a space, then browse it in either pane · Esc to close</span>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Scrim>
  );
}
