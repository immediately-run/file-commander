// file commander — copy/move progress dialog (F5 / F6). The progress is
// simulated; finishCopy() in App.tsx does the real tree mutation on done.
import { useEffect, useState } from 'react';
import Scrim from './Scrim';
import Icon from '../Icon';
import { fmtTotal } from '../../lib/fs';
import type { Entry } from '../../lib/fs';

interface Props {
  items: Entry[];
  fromPath: string[];
  toPath: string[];
  move: boolean;
  onDone: () => void;
  onClose: () => void;
}

export default function CopyDialog({ items, fromPath, toPath, move, onDone }: Props) {
  const [pct, setPct] = useState(0);
  const [idx, setIdx] = useState(0);
  const total = items.length;
  useEffect(() => {
    let p = 0;
    const tick = setInterval(() => {
      p += Math.random() * 16 + 7;
      const newIdx = Math.min(total - 1, Math.floor((p / 100) * total));
      setIdx(newIdx);
      if (p >= 100) { p = 100; clearInterval(tick); setPct(100); setTimeout(onDone, 280); }
      setPct(Math.min(100, p));
    }, 130);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const totalBytes = items.reduce((s, e) => s + (e.size || 0), 0);
  return (
    <Scrim>
      <div className="modal">
        <div className="mhead">
          <span className="mi"><Icon name={move ? 'up' : 'folder'} size={18} /></span>
          <div>
            <h3>{move ? 'Moving' : 'Copying'} {total} {total === 1 ? 'item' : 'items'}</h3>
            <div className="sub">IR:/{fromPath.join('/')} → IR:/{toPath.join('/')}</div>
          </div>
        </div>
        <div className="mbody">
          <div className="prog">
            <div className="pbar"><i style={{ width: pct + '%' }}></i></div>
            <div className="prow">
              <span>{Math.round(pct)}%</span>
              <span>{idx + 1} / {total} · {fmtTotal(totalBytes)}</span>
            </div>
            <div className="cur">{pct < 100 ? '› ' + (items[idx] ? items[idx].name : '') : 'done'}</div>
          </div>
        </div>
      </div>
    </Scrim>
  );
}
