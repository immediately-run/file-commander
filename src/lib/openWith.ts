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

/** R3-771 (BUNDLE_EMBEDDING §4c.1): a folder declaring that its own tree is the
 *  program that opens it. R3-775 gives this form its affordance — run in place
 *  ONLY, through the generic self-launch contract (see {@link affordancesFor}).
 *  The parser's two-of-three refusal (R3-771, below) already guards the form:
 *  a `task`+`self` declaration degrades to no marker (D-OW-3), never an error. */
export interface OpensWithSelfMarker {
  self: true;
  kind?: string;
}

/** Either marker shape; callers that only offer task affordances see a self marker
 *  as "nothing to offer" (not an error — SPACES_UI D-OW-3). */
export type OpensWith = OpensWithMarker | OpensWithSelfMarker;

/**
 * The task contracts this app declares it may launch or invoke — the MIRROR of
 * `immediately.run.launches` ∪ `invokes` in package.json, enforced by a test
 * that reads the real file so the two cannot drift.
 *
 * `SELF_LAUNCH_TASK` is declared in `launches` ONLY (no overlay use — §4c.4):
 * a stage launch through the generic dispatch row, so a self marker's folder
 * can run its own tree. It is deliberately NOT a task-MARKER affordance: a
 * marker naming it would offer an affordance the host always refuses (overlay:
 * undeclared; stage non-self: `unsupported`), the offered-then-refused shape
 * R3-267 removed — so the task-form parse filter below narrows to the
 * invoke-able contracts, DERIVED from this list rather than re-spelled.
 */
export const DECLARED_TASKS: readonly string[] = ['open-project', 'open-wiki', 'open-declared'];

/** The generic self-launch contract (§4c.4) — the one spelling (R6). */
export const SELF_LAUNCH_TASK = 'open-declared';

/** The contracts a folder's TASK marker may name and get an affordance for:
 *  every declared task except the self-launch row (see DECLARED_TASKS). */
const TASK_MARKER_TASKS: readonly string[] = DECLARED_TASKS.filter((t) => t !== SELF_LAUNCH_TASK);

/**
 * R3-775 (BUNDLE_EMBEDDING §4c.4 / STANDING_APP_LIFECYCLE §7b): the affordances
 * a marker yields. A TASK marker offers both the overlay "open" and the
 * into-stage "open in place"; a SELF marker offers ONLY "open in place" — the
 * bundle is its own program, there is no bound provider to invoke as a task
 * (§4c.5: a self-running bundle is never a for-result callee). The label names
 * what the button does, not the program (the host draws identity).
 */
export interface OpenWithAffordances {
  /** The overlay `invokeTask` open — task markers only. */
  open: boolean;
  /** The into-stage `launch` open — every marker form. */
  openInPlace: boolean;
  /** The sentence-case button label for the in-place action. */
  openInPlaceLabel: string;
}

/** The affordances for a parsed marker (or none, for `null`). Pure. */
export function affordancesFor(marker: OpensWith | null): OpenWithAffordances & { label: string | null } {
  if (marker === null) return { open: false, openInPlace: false, openInPlaceLabel: '', label: null };
  if (!('task' in marker)) {
    // §4c.4: run-in-place ONLY — never an overlay open for the self form.
    return { open: false, openInPlace: true, openInPlaceLabel: 'run in place', label: null };
  }
  return { open: true, openInPlace: true, openInPlaceLabel: 'open in place', label: labelFor(marker) };
}

// The label shown on the overlay-open affordance. The marker's `kind` is an
// untrusted display hint; fall back to a neutral "project" when it's absent.
function labelFor(marker: OpensWithMarker): string {
  const kind = marker.kind?.replace(/[-_]+/g, ' ').trim();
  return kind ? `open ${kind}` : 'open project';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Parse a marker out of already-decoded JSON. Accepts the shape
//   { opensWith: { task: string, version?: string }, kind?: string }
//   { opensWith: { self: true }, kind?: string }              ← §4c.1, R3-771
// from a standalone `immediately.run.json` OR a `package.json`'s `immediately.run`
// field (the field's VALUE is passed in). Returns null for absent/malformed input —
// `task` must be a non-empty string. Any TWO of `task`/`app`/`self` present
// together is refused (§4c.1's two-of-three rule; `app` is counted for the
// check though this panel offers no app form). A self marker is
// returned ONLY when `fromPackageJson` is false (review D4: the bundle's package.json
// stanza never yields the self form).
export function parseOpensWith(raw: unknown, opts: { fromPackageJson?: boolean } = {}): OpensWith | null {
  if (!isObject(raw)) return null;
  const ow = raw.opensWith;
  if (!isObject(ow)) return null;
  const task = ow.task;
  const app = ow.app;
  // Task-presence matches the HOST parser's untrimmed form (a whitespace-only
  // task beside self is an ambiguity there, not an absent task).
  const hasTask = typeof task === 'string' && task !== '';
  const hasApp = typeof app === 'string' && app !== '';
  const hasSelf = 'self' in ow;
  // §4c.1: any two of the three opener forms together is an ambiguity — refused.
  if ([hasTask, hasApp, hasSelf].filter(Boolean).length > 1) return null;
  if (hasSelf) {
    // Only `self: true`, and never from a package.json stanza (D4).
    if (ow.self !== true || opts.fromPackageJson) return null;
    const marker: OpensWithSelfMarker = { self: true };
    if (typeof raw.kind === 'string' && raw.kind !== '') marker.kind = raw.kind;
    return marker;
  }
  if (typeof task !== 'string' || task.trim() === '') return null;
  // A marker may ask for anything; we may only offer what we can actually open
  // (the invoke-able contracts — TASK_MARKER_TASKS, which excludes the
  // self-launch row). An undeclared contract is silently no marker — never an
  // error (D-OW-3), and never an offered-then-refused affordance.
  if (!TASK_MARKER_TASKS.includes(task.trim())) return null;
  const marker: OpensWithMarker = { task };
  if (typeof ow.version === 'string' && ow.version !== '') marker.version = ow.version;
  if (typeof raw.kind === 'string' && raw.kind !== '') marker.kind = raw.kind;
  return marker;
}

// Pull the marker out of a parsed package.json: it lives under the
// `immediately.run` field, whose value carries the same `{ opensWith, kind }`
// shape `parseOpensWith` expects. The package.json fallback NEVER yields a self
// marker (§4c.1 review D4) — `fromPackageJson` makes that a rule, not a hope.
function fromPackageJson(pkg: unknown): OpensWith | null {
  if (!isObject(pkg)) return null;
  return parseOpensWith(pkg['immediately.run'], { fromPackageJson: true });
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
export async function readFolderMarker(dir: string): Promise<OpensWith | null> {
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
