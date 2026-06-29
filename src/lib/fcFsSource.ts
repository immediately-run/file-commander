// file commander — adapts the app's async filesystem layer (`lib/fs.ts`) to the
// shared `@immediately-run/file-explorer-ui` library's `FsSource` interface, so
// the bundled `FileExplorerView` reads listings/bytes through File Commander's
// own fs instead of the library's SDK ZenFS accessor.
//
// The library hands these methods ABSOLUTE string paths (a root's `path` joined
// with the browsed sub-path, e.g. `/`, `/apps`, `/apps/synth-pad`). `lib/fs.ts`
// works in segment arrays, so we split here. Lives in lib/ (no component export)
// per the Fast Refresh rule.
import type { DirEntry, FsSource } from '@immediately-run/file-explorer-ui';
import { listDir } from './fs';
import fs from 'fs';

// Absolute "/a/b" path → ["a", "b"] segments lib/fs.ts understands. "/" → [].
export function pathToSegments(absPath: string): string[] {
  return absPath.split('/').filter(Boolean);
}

// Read a directory and map File Commander's `Entry` rows onto the library's
// `DirEntry` shape. `listDir` already hides the app's own state dir and degrades
// a failed read to an empty listing; sort order here is irrelevant (the library
// re-sorts), so we read with a stable name-ascending order.
async function readdir(absPath: string): Promise<DirEntry[]> {
  const entries = await listDir(pathToSegments(absPath), 'name', 'asc');
  return entries.map((e) => ({
    name: e.name,
    isDir: e.type === 'dir',
    size: e.size,
    // `Entry.date` is a preformatted string, not an epoch; the library only uses
    // mtimeMs for an optional "modified" column, so omit it rather than reparse.
  }));
}

// Raw bytes for the library's drag-out / preview path (it never previews in
// File Commander — the ViewerDialog reads its own bytes — but the interface
// allows it, so we provide a faithful reader).
async function readFile(absPath: string): Promise<Uint8Array> {
  const data = await fs.promises.readFile(absPath);
  return data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBufferLike);
}

export const fcFsSource: FsSource = { readdir, readFile };
