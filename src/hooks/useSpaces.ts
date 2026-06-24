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
  onMountsChange, createSpace, mountSpace, listSpaces,
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

// The pane path (array of segments) that actually reaches a mount. The host
// decides where a space lives — `/spaces/{id}` locally, but `/mnt/{hash}` (or
// anything else) in production — so navigate by the mount's real `path` rather
// than reconstructing `/spaces/{id}`, which would land on an empty/non-existent
// directory and make writes fail mutely. (R3-70 findings F6/F8.)
export function mountSegments(mount: SandboxMount): string[] {
  return mount.path.split('/').filter(Boolean);
}

// The host ships a mount's display name (R3-69) and a read-only `mode` at
// runtime ahead of the published SDK types declaring them, so read them through
// this shape rather than off `SandboxMount` directly — the app then compiles
// against the older published types and still uses the fields when present.
type MountExtras = { name?: string; mode?: 'ro' | 'rw' };

// The host-provided display name for a mount, when known.
export function mountName(mount: SandboxMount): string | undefined {
  return (mount as SandboxMount & MountExtras).name;
}

// A best-effort human label for a mount: its name, else a short id. Used on the
// drive tab and in toasts.
export function mountLabel(mount: SandboxMount): string {
  return mountName(mount) || spaceIdOf(mount).slice(0, 8);
}

// Whether a mount is writable. Spaces shared as a reader come back `mode: 'ro'`;
// absent mode is treated as read-write (matches the primary repo mount).
export function isWritable(mount: SandboxMount): boolean {
  return (mount as SandboxMount & MountExtras).mode !== 'ro';
}

// A folder located inside a mounted space: which mount holds it, the path
// relative to the mount root, and whether that mount is writable. Used to mint
// a `capDir` for the §6 "Open" affordance — a delegation only makes sense for a
// folder that lives in a real, host-granted mount (the local IR: tree has no
// mount id to delegate).
export interface MountLocation {
  mountId: string;
  relPath: string;
  writable: boolean;
}

// Resolve a folder's absolute path segments to the space mount that contains it,
// if any. A mount contains the folder when the folder path is the mount's path
// or sits beneath it; the deepest such mount wins (nested grants). Mounts
// without a stable `id` can't be delegated (no `mountId`), so they're skipped.
// Returns null when no mounted space contains the folder (e.g. the local IR:
// tree) — the caller then offers no "Open" affordance (R-SPACES-10).
export function locateInMount(path: string[], mounts: SandboxMount[]): MountLocation | null {
  let best: MountLocation | null = null;
  let bestDepth = -1;
  for (const m of mounts) {
    if (!m.id) continue;
    const seg = mountSegments(m);
    if (path.length < seg.length) continue;
    if (!seg.every((s, i) => path[i] === s)) continue;
    if (seg.length > bestDepth) {
      bestDepth = seg.length;
      best = { mountId: m.id, relPath: path.slice(seg.length).join('/'), writable: isWritable(m) };
    }
  }
  return best;
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

// The host runtime may ship an SDK build that predates the spaces write API (it
// is still unpublished, so the host can lag the local file:-linked SDK). In that
// case the imported bindings are `undefined` at runtime. `listSpaces` degrades
// to an empty list (callers treat that as fine); the write ops can't be faked,
// so wrap each to reject with a SpaceError the dialog surfaces as a toast rather
// than crashing with "… is not a function".
const safeListSpaces: typeof listSpaces = (opts) =>
  typeof listSpaces === 'function' ? listSpaces(opts) : Promise.resolve([]);

// Reject with a recognizable SpaceError when `fn` is absent from the host SDK.
function requireSpaceFn<A extends unknown[], R>(
  fn: ((...args: A) => Promise<R>) | undefined,
): (...args: A) => Promise<R> {
  return (...args: A) => {
    if (typeof fn !== 'function') {
      const err = new Error('spaces are not available in this runtime yet') as SpaceError;
      err.code = 'unknown';
      return Promise.reject(err);
    }
    return fn(...args);
  };
}

export const spaces = {
  createSpace: requireSpaceFn(createSpace),
  mountSpace: requireSpaceFn(mountSpace),
  listSpaces: safeListSpaces,
};
