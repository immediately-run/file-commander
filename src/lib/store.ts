// file commander — tiny persistence layer over the immediately.run `fs` module.
//
// The sandbox iframe has NO access to localStorage/sessionStorage (it lacks the
// `allow-same-origin` flag, so even reading window.localStorage throws a
// SecurityError). Persist app state through `fs` instead: in the hosted sandbox
// it is backed by ZenFS persisted in the browser, and during local `vite dev`
// the @immediately-run/dev-fs plugin bridges the same async surface to disk.
//
// Async only (no *Sync methods), matching what immediately.run exposes. Lives
// in lib/ (no components) per the Fast Refresh rule.
import fs from 'fs';

const DIR = '/.file-commander';

function pathFor(key: string): string {
  return `${DIR}/${key}.json`;
}

// Read persisted JSON, merged over `defaults`. Missing file / parse errors fall
// back to the defaults so a fresh sandbox (or a corrupt write) never crashes.
export async function load<T extends Record<string, unknown>>(key: string, defaults: T): Promise<T> {
  try {
    const text = await fs.promises.readFile(pathFor(key), 'utf8');
    const parsed = JSON.parse(text) as Partial<T>;
    if (parsed && typeof parsed === 'object') return { ...defaults, ...parsed };
  } catch {
    // file absent on first run, or unreadable — use defaults.
  }
  return defaults;
}

// Persist JSON under /.file-commander/<key>.json. Best-effort: a write failure
// is logged, never thrown, so the UI keeps working even if persistence is down.
export async function save(key: string, value: Record<string, unknown>): Promise<void> {
  try {
    await fs.promises.mkdir(DIR, { recursive: true });
    await fs.promises.writeFile(pathFor(key), JSON.stringify(value, null, 2), 'utf8');
  } catch (err) {
    console.warn('[file-commander] could not persist', key, err);
  }
}
