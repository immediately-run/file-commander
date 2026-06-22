# REFACTOR / FINDINGS — file-commander

Recorded by the 2026-06 code-verification pass (R3-124; plan `08-system-apps.md`).
**Record only — nothing here is actioned, no manifest edited, no code refactored.**

## Classification (Phase 1)

**Determination: example / demo app, not a bound system app.** Evidence:
- `package.json` `"immediately.run"` is **`{}`** (empty) — no `requireLatest`, no
  `provides`/`invokes`, despite the app using spaces + the filesystem
  (`src/lib/fs.ts`, `src/hooks/useSpaces.ts`).
- `CLAUDE.md` omits the "Loading & caching on immediately.run" and "Platform
  security model" sections that every bound app's CLAUDE.md carries.

This reads as a richer **dual-pane file-manager showcase** (a demo), not a slot-
bound system app. The empty manifest + trimmed CLAUDE.md are therefore
*intentional-for-a-demo*, not a gap to fix in this pass.

### If it is in fact a bound app (open question for the owner)
Then the empty manifest is a real gap: a spaces/fs-using app should declare
`requireLatest` and any `pick-file`/task `provides`/`invokes`. **Do not edit the
manifest blind** — file a roadmap item to confirm classification and, if bound,
populate the manifest + restore the two CLAUDE.md sections.

## Spec-refs (Phase 1)

No `<SPEC> §` citations (0, as expected for a spec-less demo). The comments do
cite roadmap findings — `R3-70` (F6/F8), `R3-69` — in `useSpaces.ts`,
`SpacesDialog.tsx`, `lib/fs.ts`. These are real artifacts (verify on execution);
they are roadmap-finding pointers, not spec §, and are fine as-is for a demo.

## Vocabulary (Phase 2)

No `kernel` / `principal`-as-grantee in `src/` (grepped: no `.principal` reads —
the `Member.principal` RENAME-SM-1 target does **not** appear here). `role` used
for rw/ro share roles — correct per core_concepts §11, leave intact.

## SDK-version skew (Phase 1 step 7 / Phase 3 — record only)

Pins `@immediately-run/sdk` at **`0.2.8`** — the oldest tier in the fleet
(others `0.8.1` / `0.11.0` / `^0.12.0`). Fleet maintenance debt; a coordinated
bump is its own gated change. Do **not** bump here.

## Build state (pre-existing, record only)

`npm run build` is **red on origin/main**: `vite.config.ts:4` imports
`@immediately-run/dev-fs`, a dev-fs package not installed/published in this
environment → `TS2307 Cannot find module`. **Not introduced by this pass**
(record-only `.md` added; `npm run lint` green). A missing dev dependency, not a
source bug — flagged for the owner; not fixed in this verify/record pass.

## dev smoke-test (Phase 3)

`dev/fsSmokeTest.ts` is a dev-only smoke test — confirm at execution it is **not**
imported by the rendered tree (`src/App.tsx` and its imports). If orphaned, it is
a dead-candidate; if dev-tooling-only, it is fine. Not removed in this pass.
