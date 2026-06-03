// file commander — quick-access "drive" tabs shown atop each pane.
// Plain data (no components) so the panel stays HMR-safe.

export interface Drive {
  id: string;
  label: string;
  path: string[];
  free: string;
}

export const DRIVES: Drive[] = [
  { id: 'ir', label: 'IR:', path: [], free: '612 mb free' },
  { id: 'apps', label: 'apps', path: ['apps'], free: '' },
  { id: 'docs', label: 'docs', path: ['docs'], free: '' },
  { id: 'tmp', label: '~', path: [], free: '' },
];
