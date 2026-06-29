// file commander — builds the shared file-explorer library's `ExplorerRoot[]`
// from File Commander's data: the built-in IR: tree plus every mounted space.
//
// Each root's `path` is the ABSOLUTE path the `FsSource` understands. The roots
// MUST NOT overlap: the library attributes a row to a root by absolute-path
// prefix, so a `/apps` root nested under the `/` root would mis-attribute. We
// therefore expose the whole IR: tree as ONE root at `/` (apps/docs/etc. are
// reachable by browsing into it) and one non-overlapping root per space mount.
//
// Lives in lib/ (no component export) per the Fast Refresh rule.
import type { ExplorerRoot } from '@immediately-run/file-explorer-ui';
import type { SandboxMount } from '../hooks/useSpaces';
import { spaceIdOf, mountSegments, mountLabel, isWritable } from '../hooks/useSpaces';

// The single root for the in-memory IR: filesystem (the whole tree at `/`).
export const IR_ROOT: ExplorerRoot = {
  id: 'ir',
  path: '/',
  label: 'IR:',
  kind: 'other',
  writable: true,
};

// Build the full root list a panel renders: the IR: tree first, then each
// mounted space (rooted at its host-decided real path, e.g. /spaces/{id} or
// /mnt/{hash}). A read-only space is surfaced as a non-writable root, so the
// library hides its write affordances rather than showing them then EROFS-ing.
export function buildRoots(spaceMounts: SandboxMount[], spaceNames: Record<string, string>): ExplorerRoot[] {
  const spaceRoots: ExplorerRoot[] = spaceMounts.map((m) => {
    const id = spaceIdOf(m);
    const segs = mountSegments(m);
    return {
      id: 'space:' + id,
      path: '/' + segs.join('/'),
      label: mountLabel(m) || spaceNames[id] || id.slice(0, 8),
      kind: 'space' as const,
      writable: isWritable(m),
      spaceId: id,
    };
  });
  return [IR_ROOT, ...spaceRoots];
}
