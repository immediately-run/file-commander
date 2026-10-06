// R3-937 — the delegation mount-id seam: a space mount announces a BARE spaceId
// (SandboxMount.id), but capDir/content-refs name the universal `space:<id>`
// form the host keys on. Live evidence: the venue's run-in-place launch was
// refused `unsupported` (non-self-stage) until the delegation named the
// prefixed id — the host's grant lookup (`callerGrants.find(g.mountId === …)`)
// and `spaceIdFromSpaceMountId` both miss the bare form.
import { describe, expect, it } from 'vitest';
import { delegateMountId } from './mountId';

describe('R3-937 — delegateMountId', () => {
  it('prefixes a bare firestore space id (the announced shape)', () => {
    expect(delegateMountId({ id: 'SLzRdvtXfoVz06Nt3E44', type: 'firestore' })).toBe(
      'space:SLzRdvtXfoVz06Nt3E44',
    );
  });

  it('passes a github mount id through unchanged (already the universal form)', () => {
    expect(delegateMountId({ id: 'github:immediately-run/file-commander@main', type: 'github' })).toBe(
      'github:immediately-run/file-commander@main',
    );
  });

  it('never double-prefixes a firestore mount whose id already carries a scheme', () => {
    expect(delegateMountId({ id: 'space:abc', type: 'firestore' })).toBe('space:abc');
  });

  it('a mount with no stable id cannot be delegated (null, not a guess)', () => {
    expect(delegateMountId({ type: 'firestore' })).toBeNull();
    expect(delegateMountId({ id: undefined, type: 'github' })).toBeNull();
  });
});
