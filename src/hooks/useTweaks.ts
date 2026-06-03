import { useCallback, useEffect, useRef, useState } from 'react';
import { load, save } from '../lib/store';

// Single source of truth for tweak values. Values persist across reloads via
// the `fs` module (ZenFS in the sandbox, the devfs bridge during local dev) —
// NOT localStorage, which the sandboxed iframe cannot access. setTweak also
// posts __edit_mode_set_keys so the immediately.run host can mirror edits into
// the EDITMODE block on disk. Lives in hooks/ (no component) per the Fast
// Refresh rule.
const STORE_KEY = 'tweaks';

export function useTweaks<T extends Record<string, unknown>>(defaults: T) {
  const [values, setValues] = useState<T>(defaults);
  // Guard so the initial hydrate doesn't echo back out as a "change" write.
  const hydrated = useRef(false);

  // Load persisted tweaks once on mount. `defaults` is a module-level constant
  // in practice, so this runs a single time.
  useEffect(() => {
    let alive = true;
    void load<T>(STORE_KEY, defaults).then((stored) => {
      if (alive) setValues(stored);
      hydrated.current = true;
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the
  // persisted JSON.
  const setTweak = useCallback(
    (keyOrEdits: keyof T | Partial<T>, val?: T[keyof T]) => {
      const edits =
        typeof keyOrEdits === 'object' && keyOrEdits !== null
          ? keyOrEdits
          : ({ [keyOrEdits as keyof T]: val } as Partial<T>);
      setValues((prev) => {
        const next = { ...prev, ...edits };
        void save(STORE_KEY, next); // best-effort persist to fs
        return next;
      });
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
      // Same-window signal so in-page listeners can react — the parent message
      // only reaches the host, not peers.
      window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
    },
    [],
  );

  return [values, setTweak] as const;
}
