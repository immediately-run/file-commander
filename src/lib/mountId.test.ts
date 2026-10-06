// R3-937 — the delegation mount-id seam: a space mount announces a BARE spaceId
// (SandboxMount.id), but capDir/content-refs name the universal `space:<id>`
// form the host keys on. Live evidence: the venue's run-in-place launch was
// refused `unsupported` (non-self-stage) until the delegation named the
// prefixed id — the host's grant lookup (`callerGrants.find(g.mountId === …)`)
// and `spaceIdFromSpaceMountId` both miss the bare form.
import { describe, expect, it } from 'vitest';
import { delegateMountId, locateInMount } from './mountId';

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

// R3-937 round 1 (R2): the regression this PR fixes is pinned at the seam it
// lived in — locateInMount must translate a bare-id firestore mount to the
// universal mount id, or the launch/invoke delegation is refused host-side.
describe('R3-937 — locateInMount delegates the universal mount id', () => {
  const spaceMount = { path: '/mnt/baf2e2015fe60b9d9ef74b3505dd8e98', id: 'SLzRdvtXfoVz06Nt3E44', type: 'firestore' };

  it('a folder in a bare-id space mount delegates `space:<id>` (the venue refusal)', () => {
    const loc = locateInMount(['mnt', 'baf2e2015fe60b9d9ef74b3505dd8e98', 'bundles', 'self-app'], [spaceMount]);
    expect(loc).toEqual({ mountId: 'space:SLzRdvtXfoVz06Nt3E44', relPath: 'bundles/self-app', writable: true });
  });

  it('the mount root itself delegates (relPath "")', () => {
    expect(locateInMount(['mnt', 'baf2e2015fe60b9d9ef74b3505dd8e98'], [spaceMount])?.mountId).toBe(
      'space:SLzRdvtXfoVz06Nt3E44',
    );
  });

  it('a folder outside every mount stays undelegatable', () => {
    expect(locateInMount(['app', 'src'], [spaceMount])).toBeNull();
  });

  it('the deepest mount wins (nested grants)', () => {
    const nested = { path: '/mnt/baf2e2015fe60b9d9ef74b3505dd8e98/bundles', id: 'other-space', type: 'firestore' };
    const loc = locateInMount(['mnt', 'baf2e2015fe60b9d9ef74b3505dd8e98', 'bundles', 'self-app'], [spaceMount, nested]);
    expect(loc?.mountId).toBe('space:other-space');
    expect(loc?.relPath).toBe('self-app');
  });

  it('a read-only space reports writable: false through the location', () => {
    const ro = { ...spaceMount, mode: 'ro' as const };
    expect(locateInMount(['mnt', 'baf2e2015fe60b9d9ef74b3505dd8e98'], [ro])?.writable).toBe(false);
  });
});
