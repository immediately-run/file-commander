// file commander — the "Open with the app it belongs to" manifest reader
// (SPACES_UI_SPEC §6, D-OW-3). A folder can declare a TASK CONTRACT it wants
// opened with, the same way an immediately.run app declares itself: the
// `immediately.run` field of a `package.json`, or — for non-npm folders — a
// small `immediately.run.json` marker at the folder root. The marker names a
// CONTRACT (not an app), so the host's binding chooses the provider; it grants
// nothing on its own and is UNTRUSTED (R-SPACES-11) — we validate it before
// acting and tolerate absent/malformed markers SILENTLY (no error UX).
//
// Pure functions + one fs read; lives in lib/ (no component export) per the
// Fast Refresh rule.
import fs from 'fs';

// The validated marker: which task contract opens this folder, with an optional
// display/sort hint. `version` rides along for the host's contract resolution.
export interface OpensWithMarker {
  task: string;
  version?: string;
  kind?: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Parse a marker out of already-decoded JSON. Accepts the shape
//   { opensWith: { task: string, version?: string }, kind?: string }
// from either a standalone `immediately.run.json` OR a `package.json`'s
// `immediately.run` field (the field's VALUE is passed in). Returns null for
// absent/malformed input — `task` must be a non-empty string; unknown extra
// fields are ignored.
export function parseOpensWith(raw: unknown): OpensWithMarker | null {
  if (!isObject(raw)) return null;
  const ow = raw.opensWith;
  if (!isObject(ow)) return null;
  const task = ow.task;
  if (typeof task !== 'string' || task.trim() === '') return null;
  const marker: OpensWithMarker = { task };
  if (typeof ow.version === 'string' && ow.version !== '') marker.version = ow.version;
  if (typeof raw.kind === 'string' && raw.kind !== '') marker.kind = raw.kind;
  return marker;
}

// Pull the marker out of a parsed package.json: it lives under the
// `immediately.run` field, whose value carries the same `{ opensWith, kind }`
// shape `parseOpensWith` expects.
function fromPackageJson(pkg: unknown): OpensWithMarker | null {
  if (!isObject(pkg)) return null;
  return parseOpensWith(pkg['immediately.run']);
}

async function readJson(absPath: string): Promise<unknown> {
  const text = await fs.promises.readFile(absPath, 'utf8');
  return JSON.parse(text) as unknown;
}

// Read a folder's opener marker, if any. Tries `<folder>/immediately.run.json`
// first, then `<folder>/package.json` (the `immediately.run` field). `dir` is
// the folder's absolute path (e.g. `/mnt/<hash>/project`). Read/parse errors —
// a missing marker, unreadable file, bad JSON — degrade to null SILENTLY: the
// marker is an optional, untrusted hint, never an error surface (R-SPACES-11).
export async function readFolderMarker(dir: string): Promise<OpensWithMarker | null> {
  const base = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  try {
    return parseOpensWith(await readJson(`${base}/immediately.run.json`));
  } catch {
    // no standalone marker (or it was malformed) — fall through to package.json
  }
  try {
    return fromPackageJson(await readJson(`${base}/package.json`));
  } catch {
    return null;
  }
}
