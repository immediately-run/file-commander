// file commander — the §6 "Open with the app it belongs to" affordance state.
//
// Given the currently focused FOLDER, this hook resolves whether it lives in a
// mounted space, reads its opener marker (SPACES_UI_SPEC §6.1, D-OW-3), and — if
// a valid marker is present AND the mount is readable — exposes an "Open"
// affordance whose invoke() delegates the folder as a `capDir` to the contract
// the marker names (§6.2). The folder declares a TASK CONTRACT, not an app: the
// host's binding resolves the provider (R-SPACES-11), and `capDir` only narrows
// a grant we already hold — no new authority, no consent prompt.
//
// Availability re-evaluates whenever `mounts` changes (the caller feeds it from
// `useSpaceMounts`, which subscribes to `onMountsChange`), so a role downgrade
// to ro/none recomputes writability / hides the affordance (R-SPACES-10).
//
// Lives in hooks/ (no component export) per the Fast Refresh rule.
import { useEffect, useState } from 'react';
import { invokeTask, capDir, launch } from '@immediately-run/sdk';
import { locateInMount } from './useSpaces';
import type { SandboxMount } from './useSpaces';
import { readFolderMarker } from '../lib/openWith';
import type { OpensWithMarker } from '../lib/openWith';

// The resolved "Open" affordance for the focused folder, or null when there's
// nothing to open (no folder focused, not in a mount, or no valid marker).
export interface OpenWith {
  // A sentence-case label, e.g. "open project" / "open whiteboard project".
  label: string;
  // Invoke the declared contract with the folder delegated as a `capDir`.
  // Resolves the typed-error code (cancelled/forbidden/no-such-task/…) on
  // failure so the caller can toast it; never throws.
  invoke: () => Promise<{ ok: true } | { ok: false; code: string }>;
  // "Open in place" — RUN the folder's project TO-RUN in the STAGE region
  // (STANDING_APP_LIFECYCLE §7 into-stage), replacing the focal app, via `launch`
  // instead of the for-result `invokeTask`. Editing-session-initiated: this file
  // panel runs under an `editor.*` principal, so the host admits `region:'stage'`
  // (a stage-principal app would be refused). The delegated `capDir` defaults to
  // `ro` host-side (R-SAL-6). Resolves the typed refusal code on failure.
  openInPlace: () => Promise<{ ok: true } | { ok: false; code: string }>;
}

// The label shown on the affordance. The marker's `kind` is an untrusted
// display hint; fall back to a neutral "project" when it's absent.
function labelFor(marker: OpensWithMarker): string {
  const kind = marker.kind?.replace(/[-_]+/g, ' ').trim();
  return kind ? `open ${kind}` : 'open project';
}

// `folder` is the absolute path segments of the focused folder (the pane path +
// the cursor entry's name). Pass null when the cursor is not on a folder.
export function useOpenWith(folder: string[] | null, mounts: SandboxMount[]): OpenWith | null {
  // Cache the read keyed by what it was read for, so a stale result (the folder
  // or its mount changed mid-read) is ignored without a synchronous reset.
  const [resolved, setResolved] = useState<{ key: string; marker: OpensWithMarker | null }>({
    key: '',
    marker: null,
  });

  // Resolve the mount for this folder up front: no mount → no marker read, no
  // affordance (R-SPACES-10, and no existence oracle on unreadable paths).
  const loc = folder ? locateInMount(folder, mounts) : null;
  // A key over every input that affects the read or the delegation, so the read
  // re-runs (and the previous result goes stale) on a folder OR mount change —
  // including a writability/role downgrade (R-SPACES-10).
  const key = loc && folder ? `${folder.join('/')}|${loc.mountId}|${loc.relPath}|${loc.writable}` : '';

  useEffect(() => {
    if (!key || !folder) return; // no readable mount → nothing to read, stays stale
    let alive = true;
    void readFolderMarker('/' + folder.join('/')).then((m) => {
      if (alive) setResolved({ key, marker: m });
    });
    return () => { alive = false; };
    // `key` captures folder + mount; `folder` is derivable from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const marker = resolved.key === key ? resolved.marker : null;
  if (!loc || !key || !marker) return null;

  return {
    label: labelFor(marker),
    invoke: async () => {
      try {
        await invokeTask(marker.task, {
          dir: capDir(
            { mountId: loc.mountId, relPath: loc.relPath },
            { mode: loc.writable ? 'rw' : 'ro' },
          ),
        });
        return { ok: true };
      } catch (err) {
        const code = (err as { code?: string } | undefined)?.code ?? 'unknown';
        return { ok: false, code };
      }
    },
    openInPlace: async () => {
      // `launch` returns a handle on success, or `{ ok:false, code }` on refusal
      // (it never throws for an ordinary refusal). The delegated dir defaults to
      // `ro` host-side; the host runs the marker's bound provider in the stage.
      const res = await launch(
        { task: marker.task },
        {
          region: 'stage',
          input: {
            dir: capDir({ mountId: loc.mountId, relPath: loc.relPath }, { mode: 'ro' }),
          },
        },
      );
      if ('ok' in res && res.ok === false) return { ok: false, code: res.code };
      return { ok: true };
    },
  };
}
