// file commander — async filesystem layer over the immediately.run `fs` module.
//
// Everything the panes show comes straight from `fs` (ZenFS in the hosted
// sandbox, your real disk via @immediately-run/dev-fs during `vite dev`). `fs`
// is ASYNC-ONLY, so listings/reads/mutations all return promises; the app loads
// them into state and re-reads after each mutation.
//
// Lives in lib/ (no components) so it stays HMR-safe per the Fast Refresh rule.
import fs from 'fs';

export type NodeType = 'dir' | 'file';

export type Kind =
  | 'dir'
  | 'code'
  | 'css'
  | 'doc'
  | 'image'
  | 'config'
  | 'data'
  | 'web'
  | 'archive'
  | 'file';

// A row produced by listDir() — one filesystem entry, flattened for rendering.
export interface Entry {
  name: string;
  type: NodeType;
  ext: string;
  kind: Kind;
  size: number | null;
  count: number | null;
  date: string;
}

// The app's own state dir (tweaks + seed marker). Hidden from the root listing
// so it doesn't clutter the view with the manager's bookkeeping.
const STATE_DIR = '.file-commander';

// path = array of segment names, rooted at the filesystem root.
function abs(path: string[]): string {
  return '/' + path.join('/');
}
function join(dir: string, name: string): string {
  return dir === '/' ? '/' + name : dir + '/' + name;
}

// ---- a little source-code corpus used to SEED the filesystem on first run ----
const SAMPLES: Record<string, string> = {
  'App.tsx': `import { useState } from "react";\nimport { Synth } from "./synth";\nimport "./index.css";\n\nexport default function App() {\n  const [wave, setWave] = useState("saw");\n  const synth = Synth.use(wave);\n\n  return (\n    <div className="pad">\n      <h1>Synth Pad</h1>\n      <Keys onNote={synth.play} />\n    </div>\n  );\n}`,
  'synth.ts': `// 3.1kb runtime, 0 dependencies\nexport const Synth = {\n  use(wave: string) {\n    const ctx = new AudioContext();\n    return {\n      play(freq: number) {\n        const osc = ctx.createOscillator();\n        osc.type = wave as OscillatorType;\n        osc.frequency.value = freq;\n        osc.connect(ctx.destination);\n        osc.start();\n        osc.stop(ctx.currentTime + 0.4);\n      },\n    };\n  },\n};`,
  'index.css': `.pad {\n  display: grid;\n  gap: 16px;\n  padding: 48px;\n  background: #0a0b11;\n  color: #ecebf4;\n  font-family: "Public Sans", system-ui;\n}\n.pad h1 { font-family: "Gabarito"; font-weight: 800; }`,
  'README.md': `# immediately.run\n\nApps you can take apart. One HTML file, no build step.\n\nOpen it, use it, then pop the hood and rewire it while it runs.\n\n- 142 example apps\n- 3.1kb runtime, gzipped\n- 0 dependencies`,
  'runtime.ts': `// in-browser transpile + run, client-side only\nexport async function run(src: string) {\n  const out = transpile(src);\n  const mod = await evalModule(out);\n  return mod.default;\n}`,
};

export function sampleFor(name: string): string {
  if (SAMPLES[name]) return SAMPLES[name];
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'md') return `# ${name}\n\nWalkthrough. Open the file and it runs. There is\nnothing else to wire up.`;
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return `import { run } from "../sandbox/runtime";\n\nexport default function ${name.split('.')[0]}() {\n  // ${name}\n  return run();\n}`;
  if (ext === 'css') return `:root {\n  --accent: oklch(0.74 0.17 350);\n}\n/* ${name} */`;
  if (ext === 'json') return `{\n  "name": "immediately.run",\n  "private": true,\n  "dependencies": {}\n}`;
  return `// ${name}\n// binary or unprinted content`;
}

export function extOf(name: string): string {
  if (name.startsWith('.')) return name.slice(1);
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1) : '';
}

export function kindOf(name: string, type: NodeType): Kind {
  if (type === 'dir') return 'dir';
  const e = extOf(name).toLowerCase();
  if (['tsx', 'ts', 'js', 'jsx'].includes(e)) return 'code';
  if (['css', 'scss'].includes(e)) return 'css';
  if (['md', 'txt'].includes(e)) return 'doc';
  if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(e)) return 'image';
  if (['json', 'lock', 'config', 'gitignore', 'toml', 'yml'].includes(e) || name.startsWith('.')) return 'config';
  if (['csv', 'tsv', 'dict'].includes(e)) return 'data';
  if (['html', 'htm'].includes(e)) return 'web';
  if (['zip', 'tar', 'gz'].includes(e)) return 'archive';
  if (e === '' && name === name.toUpperCase()) return 'doc'; // LICENSE
  return 'file';
}

// ---- date / size formatting ----
function pad2(n: number): string { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtSize(bytes: number | null): string {
  if (bytes == null) return '<DIR>';
  if (bytes < 1024) return bytes + ' b';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' k';
  return (bytes / 1048576).toFixed(1) + ' M';
}
export function fmtTotal(bytes: number): string {
  if (bytes < 1024) return bytes + ' b';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' kb';
  return (bytes / 1048576).toFixed(2) + ' mb';
}

// ---- sorting (shared by listDir) ----
function sortEntries(items: Entry[], sortKey: string, sortDir: string): Entry[] {
  const dir = sortDir === 'desc' ? -1 : 1;
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; // dirs always above files
    let av: string | number, bv: string | number;
    if (sortKey === 'size') { av = a.size || 0; bv = b.size || 0; }
    else if (sortKey === 'ext') { av = a.ext; bv = b.ext; }
    else if (sortKey === 'date') { av = a.date; bv = b.date; }
    else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.name.localeCompare(b.name);
  });
}

// ---- reads ----
// List a directory: one stat per entry for size/date, one readdir per subdir for
// its child count. Errors on individual entries degrade to sensible defaults
// rather than failing the whole listing.
export async function listDir(path: string[], sortKey: string, sortDir: string): Promise<Entry[]> {
  const dir = abs(path);
  let dirents;
  try {
    dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const entries: Entry[] = [];
  for (const de of dirents) {
    if (path.length === 0 && de.name === STATE_DIR) continue; // hide our own state
    const isDir = de.isDirectory();
    const full = join(dir, de.name);
    let size: number | null = null;
    let count: number | null = null;
    let date = '—';
    try {
      const st = await fs.promises.stat(full);
      date = fmtDate(st.mtime);
      if (isDir) {
        try { count = (await fs.promises.readdir(full)).length; } catch { count = 0; }
      } else {
        size = st.size;
      }
    } catch {
      if (isDir) count = 0;
    }
    entries.push({
      name: de.name,
      type: isDir ? 'dir' : 'file',
      ext: isDir ? '' : extOf(de.name),
      kind: kindOf(de.name, isDir ? 'dir' : 'file'),
      size,
      count,
      date,
    });
  }
  return sortEntries(entries, sortKey, sortDir);
}

// Read a file as text for the viewer. Binary content is the caller's concern
// (the viewer skips known-binary kinds); a read error returns a readable note.
export async function readFileText(path: string[], name: string): Promise<string> {
  try {
    return await fs.promises.readFile(abs([...path, name]), 'utf8');
  } catch (err) {
    return `// could not read ${name}\n// ${String(err)}`;
  }
}

// Image bytes are now read straight into an object URL by the SDK's `useObjectUrl`
// hook (see ViewerDialog) — the old readFileBytes/imageMime/Blob dance lived here.

// ---- mutations ----
async function exists(p: string): Promise<boolean> {
  try { await fs.promises.stat(p); return true; } catch { return false; }
}

// Turn a thrown fs error into a short, user-facing message. The point is that a
// write that fails — most importantly EROFS on a read-only mount (a space shared
// with you as a reader) — surfaces as a typed reason instead of failing mutely
// and the app then claiming "copied N items". (R3-70 finding F6.)
export function fsErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  switch (code) {
    case 'EROFS': return 'read-only space — writes are not allowed here';
    case 'EACCES':
    case 'EPERM': return 'permission denied';
    case 'ENOSPC': return 'no room left to write';
    case 'ENOENT': return 'path no longer exists';
    default: return (err as Error)?.message || 'file error';
  }
}

// Result of a multi-entry mutation: how many entries actually succeeded, plus
// the first failure's message (null when everything went through). Callers use
// `count` for the success toast and `error` to explain a (partial) failure.
export interface MutationResult {
  count: number;
  error: string | null;
}

// Result of a single-target mutation (mkdir / rename): whether it happened and,
// if not, why — `'name already exists'` for a collision, or a typed fs reason.
export interface SingleResult {
  ok: boolean;
  error: string | null;
}

export async function makeDir(path: string[], name: string): Promise<SingleResult> {
  const full = abs([...path, name]);
  if (await exists(full)) return { ok: false, error: 'name already exists' };
  try { await fs.promises.mkdir(full, { recursive: true }); return { ok: true, error: null }; }
  catch (err) { return { ok: false, error: fsErrorMessage(err) }; }
}

export async function removeEntries(path: string[], names: string[]): Promise<MutationResult> {
  let count = 0;
  let error: string | null = null;
  for (const nm of names) {
    try { await fs.promises.rm(abs([...path, nm]), { recursive: true, force: true }); count++; }
    catch (err) { if (!error) error = fsErrorMessage(err); }
  }
  return { count, error };
}

export async function renameEntry(path: string[], oldName: string, newName: string): Promise<SingleResult> {
  const from = abs([...path, oldName]);
  const to = abs([...path, newName]);
  if (await exists(to)) return { ok: false, error: 'name already exists' };
  try { await fs.promises.rename(from, to); return { ok: true, error: null }; }
  catch (err) { return { ok: false, error: fsErrorMessage(err) }; }
}

// Recursive copy — `fs` exposes only copyFile, so directories are walked by hand.
async function copyRec(from: string, to: string): Promise<void> {
  const st = await fs.promises.stat(from);
  if (st.isDirectory()) {
    await fs.promises.mkdir(to, { recursive: true });
    for (const k of await fs.promises.readdir(from)) await copyRec(join(from, k), join(to, k));
  } else {
    await fs.promises.copyFile(from, to);
  }
}

export async function copyEntries(fromPath: string[], toPath: string[], names: string[], move: boolean): Promise<MutationResult> {
  const sameDir = fromPath.join('/') === toPath.join('/');
  let count = 0;
  let error: string | null = null;
  for (const nm of names) {
    const from = abs([...fromPath, nm]);
    // de-dupe name within the same directory ("file copy", "file copy 2", …)
    let target = nm, i = 1;
    while (sameDir && (await exists(abs([...toPath, target])))) {
      target = nm.replace(/(\.[^.]+)?$/, ` copy${i > 1 ? ' ' + i : ''}$1`); i++;
    }
    const to = abs([...toPath, target]);
    try {
      if (move && !sameDir) {
        try { await fs.promises.rename(from, to); }
        catch { await copyRec(from, to); await fs.promises.rm(from, { recursive: true, force: true }); }
      } else {
        await copyRec(from, to);
      }
      count++;
    } catch (err) { if (!error) error = fsErrorMessage(err); }
  }
  return { count, error };
}

// ---- uploads (drag & drop) ----
// A single file to write, with its path relative to the drop directory. A plain
// multi-file drop yields one task per file (rel = [name]); a dropped folder is
// walked into one task per descendant file (rel = the nested segments).
export interface UploadTask {
  rel: string[];
  file: File;
}

// Walk a dropped FileSystemEntry into UploadTasks. Browsers expose dropped
// *folders* only through this (non-standard but universally supported) entry
// API; `prefix` is the entry's directory path under the drop target.
function readDropEntry(entry: FileSystemEntry, prefix: string[]): Promise<UploadTask[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (file) => resolve([{ rel: [...prefix, entry.name], file }]),
        () => resolve([]),
      );
    });
  }
  // Directory: readEntries yields children in batches and must be called again
  // until it returns an empty batch.
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const here = [...prefix, entry.name];
  const drain = (acc: UploadTask[]): Promise<UploadTask[]> =>
    new Promise((resolve) => {
      reader.readEntries(
        async (batch) => {
          if (batch.length === 0) { resolve(acc); return; }
          for (const child of batch) acc.push(...await readDropEntry(child, here));
          resolve(await drain(acc));
        },
        () => resolve(acc),
      );
    });
  return drain([]);
}

// Turn a flat File[] (e.g. from the shared file-explorer library's `upload`
// action, which hands over a plain file list rather than a live DataTransfer)
// into UploadTasks. Folder structure isn't available from a bare File[], so each
// file becomes one top-level task; `writeUploads` then de-dupes names as usual.
export function collectUploadsFromFiles(files: File[]): UploadTask[] {
  return files.map((file) => ({ rel: [file.name], file }));
}

// Read a drop's DataTransfer into a flat task list. MUST be handed the live
// DataTransfer from a drop handler: the FileSystemEntry handles are grabbed
// synchronously here (before any await) because the DataTransfer is emptied once
// the event returns; the async walk then runs off those captured handles.
export async function collectUploads(dt: DataTransfer): Promise<UploadTask[]> {
  const roots: FileSystemEntry[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  // Fall back to the flat file list when the entry API isn't available.
  const flat = roots.length === 0 ? Array.from(dt.files) : [];
  const tasks: UploadTask[] = flat.map((file) => ({ rel: [file.name], file }));
  for (const root of roots) tasks.push(...await readDropEntry(root, []));
  return tasks;
}

// Write collected upload tasks into `path`, creating nested directories as
// needed. Top-level names that already exist are de-duped ("photo copy.png",
// "src copy") so an upload never clobbers existing entries — matching copy's
// behavior. Returns how many files were written and the first top-level name
// (so the caller can place the cursor on it).
export async function writeUploads(
  path: string[],
  tasks: UploadTask[],
): Promise<{ count: number; firstName: string | null; error: string | null }> {
  // Resolve a non-colliding name for each distinct top-level entry once.
  const rootName = new Map<string, string>();
  for (const root of new Set(tasks.map((t) => t.rel[0]))) {
    let target = root, i = 1;
    while (await exists(abs([...path, target]))) {
      target = root.replace(/(\.[^.]+)?$/, ` copy${i > 1 ? ' ' + i : ''}$1`); i++;
    }
    rootName.set(root, target);
  }
  let count = 0;
  let firstName: string | null = null;
  let error: string | null = null;
  for (const task of tasks) {
    const rel = [rootName.get(task.rel[0]) ?? task.rel[0], ...task.rel.slice(1)];
    try {
      if (rel.length > 1) await fs.promises.mkdir(abs([...path, ...rel.slice(0, -1)]), { recursive: true });
      const bytes = new Uint8Array(await task.file.arrayBuffer());
      await fs.promises.writeFile(abs([...path, ...rel]), bytes);
      count++;
      if (firstName === null) firstName = rel[0];
    } catch (err) { if (!error) error = fsErrorMessage(err); }
  }
  return { count, firstName, error };
}

// ---- first-run seed ----
// A demo tree so the manager isn't empty on a fresh sandbox. Values: string =
// file contents, object = subdirectory.
type SeedNode = string | { [name: string]: SeedNode };
const f = (name: string) => sampleFor(name);
const pkg = (): SeedNode => ({ 'package.json': sampleFor('package.json'), 'index.js': '// bundled\nexport default {};' });

const SEED: { [name: string]: SeedNode } = {
  apps: {
    'synth-pad': { 'App.tsx': f('App.tsx'), 'synth.ts': f('synth.ts'), 'keyboard.tsx': f('keyboard.tsx'), 'voices.ts': f('voices.ts'), 'index.css': f('index.css'), 'README.md': f('README.md') },
    'csv-lens': { 'App.tsx': f('App.tsx'), 'parse.ts': f('parse.ts'), 'charts.tsx': f('charts.tsx'), 'sample.csv': 'year,sales\n2024,120\n2025,180\n2026,240\n', 'index.css': f('index.css') },
    'rhyme-finder': { 'App.tsx': f('App.tsx'), 'rhymes.ts': f('rhymes.ts'), 'dict.json': '{\n  "cat": ["bat", "hat", "mat"]\n}', 'index.css': f('index.css') },
    'markdown-deck': { 'App.tsx': f('App.tsx'), 'slides.md': f('slides.md'), 'theme.css': f('theme.css') },
    'pixel-paint': { 'App.tsx': f('App.tsx'), 'canvas.ts': f('canvas.ts'), 'palette.ts': f('palette.ts') },
  },
  sandbox: { 'runtime.ts': f('runtime.ts'), 'bundler.ts': f('bundler.ts'), 'transpile.ts': f('transpile.ts'), 'zenfs.ts': f('zenfs.ts'), 'hmr.ts': f('hmr.ts') },
  docs: { 'getting-started.md': f('getting-started.md'), 'deploy.md': f('deploy.md'), 'api.md': f('api.md'), 'faq.md': f('faq.md') },
  assets: { 'texture.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#c026d3"/></svg>', 'notes.txt': 'logo + hero live in the real repo; these are placeholders.' },
  node_modules: { react: pkg(), 'react-dom': pkg(), zenfs: pkg(), 'lucide-react': pkg() },
  '.config': { 'tsconfig.json': f('tsconfig.json'), 'package.json': sampleFor('package.json'), 'immediately.config.ts': '// config\nexport default {};', '.gitignore': 'node_modules\ndist\n' },
  'index.html': '<!doctype html>\n<html>\n  <body><div id="root"></div></body>\n</html>',
  'README.md': f('README.md'),
  LICENSE: 'MIT License\n\nCopyright (c) 2026 immediately.run',
};

async function writeSeed(dir: string, node: { [name: string]: SeedNode }): Promise<void> {
  for (const [name, val] of Object.entries(node)) {
    const full = join(dir, name);
    if (typeof val === 'string') {
      await fs.promises.writeFile(full, val, 'utf8');
    } else {
      await fs.promises.mkdir(full, { recursive: true });
      await writeSeed(full, val);
    }
  }
}

// Seed the demo tree once, and ONLY when the root has no real content. Both
// the sandbox and dev-fs now mount the repo at /app (so the root always lists
// at least `app` and this is normally a no-op); a truly empty root only occurs
// on runtimes predating that layout. A marker makes this run at most once.
export async function seedIfEmpty(): Promise<void> {
  const marker = `/${STATE_DIR}/seeded.json`;
  if (await exists(marker)) return;
  let names: string[] = [];
  try { names = await fs.promises.readdir('/'); } catch { /* unreadable root */ }
  const real = names.filter((n) => n !== STATE_DIR);
  try {
    if (real.length === 0) await writeSeed('/', SEED);
    await fs.promises.mkdir(`/${STATE_DIR}`, { recursive: true });
    await fs.promises.writeFile(marker, JSON.stringify({ seeded: real.length === 0 }), 'utf8');
  } catch (err) {
    console.warn('[file-commander] seed failed', err);
  }
}
