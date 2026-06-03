// file commander — inline icon set (Lucide-style, currentColor, 1.75 stroke).
// One component, looked up by name; the glyph table stays module-local so this
// file exports only a component (Fast Refresh rule).
import type { ReactNode } from 'react';

const GLYPHS: Record<string, ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  folderUp: (
    <g>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 16v-4M10 14l2-2 2 2" />
    </g>
  ),
  code: (
    <g>
      <path d="M7 4h7l4 4v12H6V4Z" />
      <path d="M14 4v4h4" />
      <path d="M10.5 12 9 13.5l1.5 1.5M13.5 12 15 13.5 13.5 15" />
    </g>
  ),
  doc: (
    <g>
      <path d="M7 4h7l4 4v12H6V4Z" />
      <path d="M14 4v4h4" />
      <path d="M9 13h6M9 16h4" />
    </g>
  ),
  image: (
    <g>
      <path d="M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <circle cx="9.5" cy="10" r="1.3" />
      <path d="M5 16l4-3 3 2 3-3 4 4" />
    </g>
  ),
  css: (
    <g>
      <path d="M7 4h7l4 4v12H6V4Z" />
      <path d="M14 4v4h4" />
      <path d="M9.5 12.5l1.5 1.5-1.5 1.5M13 15.5h1.6" />
    </g>
  ),
  config: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" />
    </g>
  ),
  data: (
    <g>
      <ellipse cx="12" cy="6.5" rx="6" ry="2.4" />
      <path d="M6 6.5v11c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4v-11" />
      <path d="M6 12c0 1.3 2.7 2.4 6 2.4s6-1.1 6-2.4" />
    </g>
  ),
  web: (
    <g>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16" />
    </g>
  ),
  archive: (
    <g>
      <path d="M5 7h14v12H5zM5 7l1.5-3h11L19 7" />
      <path d="M10 11h4" />
    </g>
  ),
  file: (
    <g>
      <path d="M7 4h7l4 4v12H6V4Z" />
      <path d="M14 4v4h4" />
    </g>
  ),
  // chrome
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  view: (
    <g>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </g>
  ),
  trash: <g><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M7 7l1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" /></g>,
  newfolder: (
    <g>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </g>
  ),
};

interface IconProps {
  name: string;
  size?: number;
}

// `name` is a file kind (folder/code/css/…) or a chrome glyph (up/trash/…).
// Unknown names fall back to the generic file glyph.
export default function Icon({ name, size = 15 }: IconProps) {
  const glyph = GLYPHS[name] || GLYPHS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
}
