// file commander — modal backdrop. Click outside the modal closes it.
import type { ReactNode } from 'react';

export default function Scrim({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      {children}
    </div>
  );
}
