// file commander — thin React layer over the immediately.run spaces SDK.
//
// Spaces are Firestore-backed user filesystems the host mounts at /spaces/{id};
// once mounted they are read/written through the normal `fs` module like any
// other path. The SDK owns the create/sign-in/pick UX (the host renders it in
// production; @immediately-run/dev-fs renders a stand-in under `vite dev`).
//
// Lives in hooks/ (no component export) per the Fast Refresh rule.
import { useEffect, useState } from 'react';
import {
  onMountsChange, openAppSpace, createSpace, mountSpace, listSpaces,
} from '@immediately-run/sdk';
import type { SandboxMount, SpaceInfo, SpaceError } from '@immediately-run/sdk';

export type { SandboxMount, SpaceInfo };

// Subscribe to the mounted filesystems, narrowed to Firestore spaces. Robust to
// the SDK runtime global being absent (e.g. an unexpected non-hosted context):
// it simply reports no mounts rather than throwing during render.
export function useSpaceMounts(): SandboxMount[] {
  const [mounts, setMounts] = useState<SandboxMount[]>([]);
  useEffect(() => {
    try {
      // onMountsChange replays immediately, then fires on every change.
      return onMountsChange((all) => setMounts(all.filter((m) => m.type === 'firestore')));
    } catch {
      // SDK runtime global absent (unexpected non-hosted context): stay empty.
      return undefined;
    }
  }, []);
  return mounts;
}

// A space's stable id from its mount (the segment after /spaces/).
export function spaceIdOf(mount: SandboxMount): string {
  return mount.id ?? mount.path.replace(/^\/spaces\//, '');
}

// Normalize a thrown space error into a short, user-facing message.
export function spaceErrorMessage(err: unknown): string {
  const code = (err as SpaceError | undefined)?.code;
  switch (code) {
    case 'auth-required': return 'sign in (via the host) to use spaces';
    case 'cancelled': return 'cancelled';
    case 'forbidden': return 'you do not have access to that space';
    case 'not-found': return 'no such space';
    default: return (err as Error)?.message || 'space operation failed';
  }
}

// The host runtime may ship an SDK build that predates `listSpaces` (the spaces
// API is still unpublished, so the host can lag the local file:-linked SDK). In
// that case the import binding is `undefined` at runtime — guard it and report
// no spaces rather than throwing. Callers already treat an empty list as fine.
const safeListSpaces: typeof listSpaces = (opts) =>
  typeof listSpaces === 'function' ? listSpaces(opts) : Promise.resolve([]);

export const spaces = { openAppSpace, createSpace, mountSpace, listSpaces: safeListSpaces };
