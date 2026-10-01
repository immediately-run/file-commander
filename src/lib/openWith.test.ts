// R3-771 — the self marker form in file-commander's parser: recognized only from
// `immediately.run.json`, refused when mixed, and never yielded by the
// `package.json` fallback (§4c.1 review D4). Pure parser tests; the read-level
// D4 rule is pinned through `fromPackageJson`'s caller shape below.
import { describe, expect, it } from 'vitest';
import { parseOpensWith, readFolderMarker, DECLARED_TASKS, SELF_LAUNCH_TASK } from './openWith';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const TASK = { opensWith: { task: DECLARED_TASKS[0] } };

describe('R3-771 — parseOpensWith (self form)', () => {
  it('returns a { self: true } marker for a well-formed self declaration', () => {
    expect(parseOpensWith({ opensWith: { self: true }, kind: 'wiki' })).toEqual({ self: true, kind: 'wiki' });
    expect(parseOpensWith({ opensWith: { self: true } })).toEqual({ self: true });
  });

  it('refuses a mixed marker (self beside task)', () => {
    expect(parseOpensWith({ opensWith: { self: true, task: DECLARED_TASKS[0] } })).toBeNull();
  });

  it('refuses self beside app (the two-of-three rule, app included)', () => {
    expect(parseOpensWith({ opensWith: { self: true, app: 'immediately-run/x' } })).toBeNull();
  });

  it('refuses a whitespace-only task beside self (presence matches the host parser)', () => {
    expect(parseOpensWith({ opensWith: { self: true, task: ' ' } })).toBeNull();
  });

  it('refuses task+app (no self) — counted for the ambiguity the fix introduced', () => {
    expect(parseOpensWith({ opensWith: { task: DECLARED_TASKS[0], app: 'immediately-run/x' } })).toBeNull();
  });

  it('refuses the triple (task+app+self)', () => {
    expect(
      parseOpensWith({ opensWith: { task: DECLARED_TASKS[0], app: 'immediately-run/x', self: true } }),
    ).toBeNull();
  });

  it('refuses a non-true self value', () => {
    expect(parseOpensWith({ opensWith: { self: 'yes' } })).toBeNull();
    expect(parseOpensWith({ opensWith: { self: false } })).toBeNull();
  });

  it('the package.json fallback NEVER yields a self marker (review D4)', () => {
    // The fallback passes { fromPackageJson: true } — the standalone read does not.
    expect(parseOpensWith({ opensWith: { self: true } }, { fromPackageJson: true })).toBeNull();
    expect(parseOpensWith({ opensWith: { self: true } }, { fromPackageJson: false })).toEqual({ self: true });
  });

  it('a task marker still parses unchanged', () => {
    expect(parseOpensWith(TASK)).toEqual({ task: DECLARED_TASKS[0] });
  });
});

describe('R3-771 — readFolderMarker (the D4 rule, end to end)', () => {
  it('immediately.run.json yields the self marker; a package.json with the same stanza never does', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fc-ow-'));
    try {
      await writeFile(join(dir, 'immediately.run.json'), JSON.stringify({ opensWith: { self: true } }));
      await writeFile(join(dir, 'package.json'), JSON.stringify({ 'immediately.run': { opensWith: { self: true } } }));
      expect(await readFolderMarker(dir)).toEqual({ self: true });
      // Remove the standalone marker: the package.json fallback must now yield null.
      await rm(join(dir, 'immediately.run.json'));
      expect(await readFolderMarker(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// R3-775 — the affordances a marker yields: a task marker keeps both forms, a
// self marker offers ONLY run-in-place, and the declared-task list cannot drift
// from the real package.json manifest (the mirror the list's own comment
// demands, now enforced by a test that reads the real file).
import { affordancesFor } from './openWith';
import { readFile } from 'fs/promises';

describe('R3-775 — affordancesFor', () => {
  it('a task marker offers the overlay open AND open in place', () => {
    expect(affordancesFor({ task: 'open-project' })).toEqual({
      open: true,
      openInPlace: true,
      openInPlaceLabel: 'open in place',
      label: 'open project',
    });
    expect(affordancesFor({ task: 'open-wiki', kind: 'whiteboard' })).toMatchObject({ label: 'open whiteboard' });
  });

  it('a self marker offers ONLY run in place — no overlay open, no label', () => {
    expect(affordancesFor({ self: true })).toEqual({
      open: false,
      openInPlace: true,
      openInPlaceLabel: 'run in place',
      label: null,
    });
    // The `kind` hint never leaks into a self affordance's label (the host
    // draws identity; this app names nothing — §4c.2/§4c.5).
    expect(affordancesFor({ self: true, kind: 'wiki' }).label).toBeNull();
  });

  it('no marker offers nothing', () => {
    expect(affordancesFor(null)).toEqual({
      open: false,
      openInPlace: false,
      openInPlaceLabel: '',
      label: null,
    });
  });
});

describe('R3-775 — DECLARED_TASKS mirrors the real package.json manifest', () => {
  it('the list equals the declared contracts (launches ∪ invokes), contract for contract', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      'immediately.run'?: {
        launches?: Array<{ task?: unknown }>;
        invokes?: Array<{ task?: unknown }>;
      };
    };
    const ir = pkg['immediately.run'] ?? {};
    const declared = [...new Set([...(ir.launches ?? []), ...(ir.invokes ?? [])].map((l) => l.task))];
    expect(declared).toContain(SELF_LAUNCH_TASK);
    expect([...DECLARED_TASKS].sort()).toEqual([...declared].sort());
  });
});
