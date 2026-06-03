// file commander — delete-confirm dialog (F8).
import Scrim from './Scrim';
import Icon from '../Icon';
import { fmtSize } from '../../lib/fs';
import type { Entry } from '../../lib/fs';

interface Props {
  items: Entry[];
  path: string[];
  onConfirm: () => void;
  onClose: () => void;
}

export default function DeleteDialog({ items, path, onConfirm, onClose }: Props) {
  return (
    <Scrim onClose={onClose}>
      <div className="modal" onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onClose(); }}
        tabIndex={-1} ref={(el) => { if (el) el.focus(); }}>
        <div className="mhead">
          <span className="mi warn"><Icon name="trash" size={18} /></span>
          <div>
            <h3>Delete {items.length} {items.length === 1 ? 'item' : 'items'}?</h3>
            <div className="sub">from IR:/{path.join('/')}</div>
          </div>
        </div>
        <div className="mbody">
          This can’t be undone in this prototype.
          <div className="filelist">
            {items.map((it) => (
              <div className="fl" key={it.name}>
                <Icon name={it.type === 'dir' ? 'folder' : it.kind || 'file'} size={14} />
                <span>{it.name}</span>
                <span className="s">{it.type === 'dir' ? '<DIR>' : fmtSize(it.size)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mfoot">
          <span className="hint">Enter to delete · Esc to cancel</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </Scrim>
  );
}
