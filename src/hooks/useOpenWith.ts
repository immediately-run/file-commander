// file commander — the §6 "Open with the app it belongs to" affordance state.
//
// Given the folder the user is looking at (R3-937: the focused directory cursor
// when one is reported, else the pane's cwd — the list layout never reports a
// folder AS the cursor, so App.tsx derives the subject via focusedFolderSegs),
// this hook resolves whether it lives in a
// mounted space, reads its opener marker (SPACES_UI_SPEC §6.1, D-OW-3), and — if
// a valid marker is present AND the mount is readable — exposes the affordances
// the marker yields (R3-775: a task marker offers the overlay "open" AND the
// into-stage "open in place"; a SELF marker offers ONLY "run in place" —
// the folder's own tree is the program, launched through `open-declared`).
// The folder declares a TASK CONTRACT or ITSELF, never an app: the host's
// binding/admission resolves everything (R-SPACES-11), and `capDir` only
// narrows a grant we already hold — no new authority, no consent prompt.
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
import { readFolderMarker, affordancesFor, SELF_LAUNCH_TASK } from '../lib/openWith';
import type { OpensWith } from '../lib/openWith';

// The resolved affordances for the focused folder, or null when there's nothing
// to open (no folder focused, not in a mount, or no valid marker).
export interface OpenWith {
  // The overlay-open label (e.g. "open project"), or null for a self marker —
  // a self folder has no overlay "open" (§4c.5: never a for-result callee).
  label: string | null;
  // The into-stage button's label: "open in place" (task) or "run in place" (self).
  openInPlaceLabel: string;
  // Invoke the declared contract with the folder delegated as a `capDir`.
  // Present for task markers ONLY. Resolves the typed-error code
  // (cancelled/forbidden/no-such-task/…) on failure so the caller can toast
  // it; never throws.
  invoke?: () => Promise<{ ok: true } | { ok: false; code: string }>;
  // "Open in place" — RUN the folder's project TO-RUN in the STAGE region
  // (STANDING_APP_LIFECYCLE §7 into-stage / §7b R-SAL-14), replacing the focal
  // app, via `launch` instead of the for-result `invokeTask`.
  // Editing-session-initiated: this file panel runs under an `editor.*`
  // principal, so the host admits `region:'stage'` (a stage-principal app
  // would be refused). The delegated `capDir` is `ro` — §4c.4 gives a
  // self-run program an ro data dir, and a task launch's dir defaults to `ro`
  // host-side (R-SAL-6). Resolves the typed refusal code on failure.
  openInPlace: () => Promise<{ ok: true } | { ok: false; code: string }>;
}

// `folder` is the absolute path segments of the subject folder (App.tsx's
// focusedFolderSegs: the reported directory cursor, else the pane's cwd).
// Pass null only when there is no subject at all.
export function useOpenWith(folder: string[] | null, mounts: SandboxMount[]): OpenWith | null {
  // Cache the read keyed by what it was read for, so a stale result (the folder
  // or its mount changed mid-read) is ignored without a synchronous reset.
  const [resolved, setResolved] = useState<{ key: string; marker: OpensWith | null }>({
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
  // R3-775: the affordances come from the one pure derivation — no marker
  // branching in the hook or the components.
  const affordances = affordancesFor(marker);

  return {
    label: affordances.label,
    openInPlaceLabel: affordances.openInPlaceLabel,
    // The overlay open exists only where the pure derivation says it does.
    ...(affordances.open && 'task' in marker
      ? {
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
        }
      : {}),
    openInPlace: async () => {
      // `launch` returns a handle on success, or `{ ok:false, code }` on refusal
      // (it never throws for an ordinary refusal). A SELF folder launches
      // through the generic `open-declared` contract — the host reads the same
      // marker itself, derives the program identity, and draws the §4c.3 offer
      // (§4c.2: the identity is host-minted only; this app names nothing).
      const res = await launch(
        { task: 'task' in marker ? marker.task : SELF_LAUNCH_TASK },
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
