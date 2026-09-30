// Pull in the `fs` module types as immediately.run exposes them to apps, so app
// code can `import fs from 'fs'` and type-check against the async-only surface.
// The declaration's home is the SDK (R3-276b moved it there from dev-fs; the
// dev-fs path is a deprecation-window alias that fails to resolve through the
// `file:../dev-fs` sibling symlink — the SDK reference is the direct form).
/// <reference types="@immediately-run/sdk/ambient" />
