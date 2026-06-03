// file commander — virtual filesystem (immediately.run themed) + helpers.
// The tree is a single mutable object; the app bumps a tick after mutating it.
// Lives in lib/ (no components) so it stays HMR-safe per the Fast Refresh rule.

export type NodeType = 'dir' | 'file';

export interface FileNode {
  type: 'file';
  size: number;
  date: string;
}
export interface DirNode {
  type: 'dir';
  children: Record<string, FsNode>;
  date?: string;
}
export type FsNode = FileNode | DirNode;

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

// A row produced by listing() — one filesystem entry, flattened for rendering.
export interface Entry {
  name: string;
  type: NodeType;
  ext: string;
  kind: Kind;
  size: number | null;
  count: number | null;
  date: string;
}

// node builders
function D(children?: Record<string, FsNode>): DirNode {
  return { type: 'dir', children: children || {} };
}
function F(size: number, date?: string): FileNode {
  return { type: 'file', size, date: date || '2026-05-21 14:02' };
}

// ---- a little source-code corpus so F3 (View) shows real-looking content ----
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

// ---- the tree ----
function packages(): Record<string, FsNode> {
  const names = ['react', 'react-dom', '@babel', '@codesandbox', 'zenfs', 'esbuild-wasm', 'lucide-react', 'comlink'];
  const out: Record<string, FsNode> = {};
  for (const n of names) out[n] = D({ 'package.json': F(820, '2026-04-02 11:10'), 'index.js': F(14200, '2026-04-02 11:10') });
  return out;
}

export const ROOT: DirNode = D({
  apps: D({
    'synth-pad': D({
      'App.tsx': F(612, '2026-05-18 09:21'),
      'synth.ts': F(1340, '2026-05-18 09:21'),
      'keyboard.tsx': F(2210, '2026-05-17 16:44'),
      'voices.ts': F(980, '2026-05-12 08:03'),
      'index.css': F(420, '2026-05-18 09:21'),
      'README.md': F(310, '2026-05-10 12:00'),
    }),
    'csv-lens': D({
      'App.tsx': F(1880, '2026-05-20 10:32'),
      'parse.ts': F(2440, '2026-05-20 10:32'),
      'charts.tsx': F(5120, '2026-05-19 18:10'),
      'sample.csv': F(48200, '2026-05-14 14:32'),
      'index.css': F(690, '2026-05-19 18:10'),
    }),
    'rhyme-finder': D({
      'App.tsx': F(1520, '2026-05-21 14:02'),
      'rhymes.ts': F(7800, '2026-05-21 14:02'),
      'dict.json': F(184320, '2026-05-09 07:45'),
      'index.css': F(540, '2026-05-21 14:02'),
    }),
    'markdown-deck': D({
      'App.tsx': F(2030, '2026-05-15 11:20'),
      'slides.md': F(3400, '2026-05-15 11:20'),
      'theme.css': F(1180, '2026-05-15 11:20'),
    }),
    'pixel-paint': D({
      'App.tsx': F(3120, '2026-05-08 13:55'),
      'canvas.ts': F(2680, '2026-05-08 13:55'),
      'palette.ts': F(740, '2026-05-08 13:55'),
    }),
  }),
  sandbox: D({
    'runtime.ts': F(3160, '2026-05-22 09:00'),
    'bundler.ts': F(8420, '2026-05-22 09:00'),
    'transpile.ts': F(4900, '2026-05-21 17:30'),
    'zenfs.ts': F(2210, '2026-05-20 12:12'),
    'hmr.ts': F(1760, '2026-05-20 12:12'),
  }),
  docs: D({
    'getting-started.md': F(2400, '2026-05-19 08:00'),
    'deploy.md': F(1980, '2026-05-19 08:00'),
    'api.md': F(5600, '2026-05-18 15:45'),
    'faq.md': F(1230, '2026-05-12 10:10'),
  }),
  assets: D({
    'logo-mark.png': F(18400, '2026-04-30 09:00'),
    'hero.png': F(220500, '2026-04-30 09:00'),
    'texture.svg': F(2100, '2026-04-30 09:00'),
    'og-card.png': F(96400, '2026-05-02 14:20'),
  }),
  node_modules: D(packages()),
  '.config': D({
    'tsconfig.json': F(640, '2026-04-01 10:00'),
    'package.json': F(1120, '2026-04-01 10:00'),
    'immediately.config.ts': F(880, '2026-04-01 10:00'),
    '.gitignore': F(120, '2026-04-01 10:00'),
  }),
  'index.html': F(2400, '2026-05-22 09:00'),
  'README.md': F(1680, '2026-05-10 12:00'),
  LICENSE: F(1100, '2026-01-04 00:00'),
});

// ---- path helpers (path = array of segment names) ----
export function nodeAt(root: DirNode, path: string[]): FsNode | null {
  let n: FsNode = root;
  for (const seg of path) {
    if (!n || n.type !== 'dir' || !n.children[seg]) return null;
    n = n.children[seg];
  }
  return n;
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

// produce a sorted listing array for a directory node
export function listing(node: FsNode | null, sortKey: string, sortDir: string): Entry[] {
  if (!node || node.type !== 'dir') return [];
  const items: Entry[] = Object.entries(node.children).map(([name, n]) => ({
    name,
    type: n.type,
    ext: n.type === 'dir' ? '' : extOf(name),
    kind: kindOf(name, n.type),
    size: n.type === 'dir' ? null : n.size,
    count: n.type === 'dir' ? Object.keys(n.children).length : null,
    date: n.date || (n.type === 'dir' ? '2026-05-21 14:02' : '—'),
  }));
  const dir = sortDir === 'desc' ? -1 : 1;
  items.sort((a, b) => {
    // dirs always above files
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    let av: string | number, bv: string | number;
    if (sortKey === 'size') { av = a.size || 0; bv = b.size || 0; }
    else if (sortKey === 'ext') { av = a.ext; bv = b.ext; }
    else if (sortKey === 'date') { av = a.date; bv = b.date; }
    else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.name.localeCompare(b.name);
  });
  return items;
}

// formatting
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

function nowStamp(): string { return '2026-06-02 11:45'; }

// mutations (operate on the live root object)
export function mkdir(root: DirNode, path: string[], name: string): boolean {
  const n = nodeAt(root, path);
  if (!n || n.type !== 'dir' || n.children[name]) return false;
  const fresh = D({});
  fresh.date = nowStamp();
  n.children[name] = fresh;
  return true;
}

export function removeEntries(root: DirNode, path: string[], names: string[]): number {
  const n = nodeAt(root, path);
  if (!n || n.type !== 'dir') return 0;
  let c = 0;
  for (const nm of names) { if (n.children[nm]) { delete n.children[nm]; c++; } }
  return c;
}

export function deepClone(n: FsNode): FsNode {
  if (n.type === 'file') return { type: 'file', size: n.size, date: n.date };
  const ch: Record<string, FsNode> = {};
  for (const [k, v] of Object.entries(n.children)) ch[k] = deepClone(v);
  return { type: 'dir', children: ch, date: n.date };
}

export function copyEntries(root: DirNode, fromPath: string[], toPath: string[], names: string[], move: boolean): number {
  const src = nodeAt(root, fromPath);
  const dst = nodeAt(root, toPath);
  if (!src || src.type !== 'dir' || !dst || dst.type !== 'dir') return 0;
  let c = 0;
  for (const nm of names) {
    if (!src.children[nm]) continue;
    let target = nm, i = 1;
    while (dst.children[target] && fromPath.join('/') === toPath.join('/')) {
      target = nm.replace(/(\.[^.]+)?$/, ` copy${i > 1 ? ' ' + i : ''}$1`); i++;
    }
    const clone = deepClone(src.children[nm]);
    clone.date = nowStamp();
    dst.children[target] = clone;
    if (move && fromPath.join('/') !== toPath.join('/')) delete src.children[nm];
    c++;
  }
  return c;
}

export function renameEntry(root: DirNode, path: string[], oldName: string, newName: string): boolean {
  const n = nodeAt(root, path);
  if (!n || n.type !== 'dir' || !n.children[oldName] || n.children[newName]) return false;
  // rebuild children object preserving order
  const next: Record<string, FsNode> = {};
  for (const [k, v] of Object.entries(n.children)) next[k === oldName ? newName : k] = v;
  n.children = next;
  return true;
}

// total size of a node (recursive) for status bars
export function nodeSize(n: FsNode | null): number {
  if (!n) return 0;
  if (n.type === 'file') return n.size;
  return Object.values(n.children).reduce((s, c) => s + nodeSize(c), 0);
}
