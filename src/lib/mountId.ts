// file commander — the delegation mount-id seam (R3-937).
//
// `capDir`/content references name the UNIVERSAL mount id (`space:<id>` — the
// SDK's own capDir example, and the form the host's grant lookup, marker read
// and qualifying-location checks key on: runLaunch.ts / runTaskInvoke.ts). But
// a space mount's announced `SandboxMount.id` is the BARE spaceId
// (spaceHandler.ts builds the descriptor with `id: spaceId`; the SDK documents
// "the spaceId, for spaces"). An app that forwards the bare id into a
// delegation is refused `unsupported` at launch/invoke. GitHub mounts already
// announce the universal id. Pure + structural (no SDK import) so the seam is
// unit-testable without the runtime.

/** The mount shape this derivation needs (satisfied by the SDK's SandboxMount). */
export interface MountLike {
  id?: string;
  type: string;
}

/**
 * The mount id to hand `capDir`/`makeContentRef` for a held mount: the
 * `space:`-prefixed universal id for a Firestore space mount announced with a
 * bare spaceId; everything else (github:…, content:…, already-prefixed ids)
 * passes through unchanged. Null when the mount carries no stable id — such a
 * mount cannot be delegated at all.
 */
export function delegateMountId(mount: MountLike): string | null {
  if (!mount.id) return null;
  return mount.type === 'firestore' && !mount.id.includes(':') ? `space:${mount.id}` : mount.id;
}
