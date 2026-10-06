// file commander — the mount-id seam (R3-937): the pure derivations over a
// mount's identity, extracted from hooks/useSpaces.ts so they are unit-testable
// without the SDK runtime (a hooks test would drag the SDK value imports into
// node). useSpaces re-exports these; no import site changes.

/** The mount shape the IDENTITY derivations need (satisfied by SandboxMount). */
export interface MountIdSource {
  id?: string;
  type: string;
}

/** …plus the mount's real path, which only the location derivations read. */
export interface MountLike extends MountIdSource {
  path: string;
}

// The host ships a mount's read-only `mode` ahead of the published SDK types
// declaring it, so read it through this shape rather than off the mount
// directly — the app compiles against the older published types and still uses
// the field when present.
type MountExtras = { mode?: 'ro' | 'rw' };

/** The universal mount id of a space, `space:<spaceId>` — the one spelling
 *  (R6: three hand-spelled copies preceded this; the defect R3-937 fixed was
 *  itself a missing prefix, i.e. drift in exactly this literal). */
export const spaceMountId = (spaceId: string): string => `space:${spaceId}`;

/**
 * The mount id to hand `capDir`/`makeContentRef` for a held mount: the
 * `space:`-prefixed universal id for a Firestore space mount announced with a
 * bare spaceId; everything else (github:…, content:…, already-prefixed ids)
 * passes through unchanged. Null when the mount carries no stable id — such a
 * mount cannot be delegated at all.
 *
 * R3-937: `capDir`/content-refs name the UNIVERSAL mount id (the SDK's own
 * capDir example, and the form the host's grant lookup, marker read and
 * qualifying-location checks key on: runLaunch.ts / runTaskInvoke.ts), but a
 * space mount's announced `SandboxMount.id` is the BARE spaceId
 * (spaceHandler.ts builds the descriptor with `id: spaceId`; the SDK documents
 * "the spaceId, for spaces"). An app that forwards the bare id into a
 * delegation is refused `unsupported` at launch/invoke.
 */
export function delegateMountId(mount: MountIdSource): string | null {
  if (!mount.id) return null;
  return mount.type === 'firestore' && !mount.id.includes(':') ? spaceMountId(mount.id) : mount.id;
}

// The pane path (array of segments) that actually reaches a mount. The host
// decides where a space lives — `/spaces/{id}` locally, but `/mnt/{hash}` (or
// anything else) in production — so navigate by the mount's real `path` rather
// than reconstructing `/spaces/{id}`, which would land on an empty/non-existent
// directory and make writes fail mutely. (R3-70 findings F6/F8.)
export function mountSegments(mount: MountLike): string[] {
  return mount.path.split('/').filter(Boolean);
}

// Whether a mount is writable. Spaces shared as a reader come back `mode: 'ro'`;
// absent mode is treated as read-write (matches the primary repo mount).
export function isWritable(mount: MountLike): boolean {
  return (mount as MountLike & MountExtras).mode !== 'ro';
}

// A folder located inside a mounted space: which mount holds it (the UNIVERSAL
// mount id, delegation-ready — see delegateMountId), the path relative to the
// mount root, and whether that mount is writable. Used to mint a `capDir` for
// the §6 "Open" affordance — a delegation only makes sense for a folder that
// lives in a real, host-granted mount (the local IR: tree has no mount id to
// delegate).
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
export function locateInMount(path: string[], mounts: MountLike[]): MountLocation | null {
  let best: MountLocation | null = null;
  let bestDepth = -1;
  for (const m of mounts) {
    const mountId = delegateMountId(m);
    if (!mountId) continue;
    const seg = mountSegments(m);
    if (path.length < seg.length) continue;
    if (!seg.every((s, i) => path[i] === s)) continue;
    if (seg.length > bestDepth) {
      bestDepth = seg.length;
      best = { mountId, relPath: path.slice(seg.length).join('/'), writable: isWritable(m) };
    }
  }
  return best;
}
