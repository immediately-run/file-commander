// file commander — the shared file-explorer library's `ExplorerActions`, backed
// by File Commander's async fs (`lib/fs.ts`). Each method is wired only when the
// matching fs operation exists, so the library renders an affordance ONLY when
// we provide its action (a missing action hides the button — never a disabled
// control that fails).
//
// The library passes MOUNT-RELATIVE paths (a leading-slash path within `root`,
// e.g. `/synth-pad/App.tsx`, or `/` for the root itself). `lib/fs.ts` works in
// absolute segment arrays rooted at the filesystem root, so we rejoin the root's
// absolute `path` with the relative path here.
//
// After any mutation we call `bump()` so App re-reads — but note the library's
// flat list layout also re-reads through its own `store.refresh()` after a write,
// so listings stay live without the App-level tick in the common case; `bump()`
// keeps the rest of File Commander's chrome (status counts, drive tabs) coherent.
//
// Lives in lib/ (no component export) per the Fast Refresh rule.
import type { ExplorerRoot, ExplorerActions } from '@immediately-run/file-explorer-ui';
import {
  makeDir, removeEntries, renameEntry, writeUploads, collectUploadsFromFiles,
} from './fs';

// "/a/b" (root.path) + "/c/d" (mount-relative) → ["a","b","c","d"] segments.
// A relPath of "/" (the root itself) contributes no extra segments.
function segmentsOf(root: ExplorerRoot, relPath: string): string[] {
  const rootSegs = root.path.split('/').filter(Boolean);
  const relSegs = relPath.split('/').filter(Boolean);
  return [...rootSegs, ...relSegs];
}

// The directory + final name of a mount-relative path, as absolute segments.
function splitParent(root: ExplorerRoot, relPath: string): { dir: string[]; name: string } {
  const segs = segmentsOf(root, relPath);
  const name = segs[segs.length - 1] ?? '';
  return { dir: segs.slice(0, -1), name };
}

// Build the action bundle. `onOpen` surfaces File Commander's ViewerDialog for a
// file the library asks to open; `bump` re-reads the App-level listings/chrome.
export function buildActions(
  onOpen: (root: ExplorerRoot, relPath: string) => void,
  bump: () => void,
): ExplorerActions {
  return {
    // F3/F4 analog: the library reports an opened file; we hand it to the viewer.
    open: (root, relPath) => onOpen(root, relPath),

    // F7 analog. `relPath` is the new folder's full mount-relative path.
    createFolder: async (root, relPath) => {
      const { dir, name } = splitParent(root, relPath);
      const { ok, error } = await makeDir(dir, name);
      bump();
      if (!ok) throw Object.assign(new Error(error ?? 'could not create folder'), { code: 'unknown' });
    },

    // F2 analog. Both paths are mount-relative; rename within the same parent dir.
    rename: async (root, fromRel, toRel) => {
      const from = splitParent(root, fromRel);
      const to = splitParent(root, toRel);
      const { ok, error } = await renameEntry(from.dir, from.name, to.name);
      bump();
      if (!ok) throw Object.assign(new Error(error ?? 'rename failed'), { code: 'unknown' });
    },

    // F8 analog (the library also runs its own window.confirm before calling this).
    delete: async (root, relPath) => {
      const { dir, name } = splitParent(root, relPath);
      const { count, error } = await removeEntries(dir, [name]);
      bump();
      if (count === 0) throw Object.assign(new Error(error ?? 'could not delete'), { code: 'unknown' });
    },

    // Drop / "Upload here…" — write dropped File[]s into the target directory.
    upload: async (root, dirRel, files) => {
      const dir = segmentsOf(root, dirRel);
      const tasks = collectUploadsFromFiles(files);
      const { count, error } = await writeUploads(dir, tasks);
      bump();
      if (count === 0) throw Object.assign(new Error(error ?? 'nothing uploaded'), { code: 'unknown' });
    },
  };
}
