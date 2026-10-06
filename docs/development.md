# Development

[Back to README](../README.md)

Use Node 24 LTS (supported versions are in `package.json`). Install with
`npm ci` and configure `.env` as described in [setup.md](setup.md).

```bash
npm run dev       # authenticated local server + Vite, localhost:8888
npm start         # production build + local server
npm run build     # data, tokens/contrast, Svelte/TS, unit tests, Vite
npm test          # data integrity, GEDCOM, model, auth, chronicle, compact layout
npm run test:unit # pure graph, state, relationship and data-access tests
npm run test:server # isolated local HTTP/save smoke checks
```

Frontend code lives in `src/`; edit `index.html`, not generated
`public/index.html`. Vite hashes browser assets. Keep `public/` content intact.
Read [AGENTS.md](../AGENTS.md) and [architecture.md](architecture.md) before
changing graph behavior. UI strings stay in German, English and Portuguese in `public/assets/strings.js`.

```bash
npx playwright install --with-deps chromium webkit
npm run test:e2e       # desktop Chromium, mobile and narrow WebKit, production build
npm run test:e2e:dev   # desktop Chromium, Vite mode
npm run metrics -- data/trees/napoleon.yaml
npm run thumbnails    # local PDF previews with Poppler; never in the hosted build
```

Writable tests must use `scripts/serve-test.mjs`: it copies only source and
synthetic fixtures into a temporary directory, clears GitHub credentials and
initializes a fresh Git repository without remotes on `fixture-save`. It never
copies `.env`, existing Git history or instance content. External browser requests
are blocked. Never aim writing tests at a personal running server or the demo.

The screenshot references mask card text and cover synthetic connection geometry
at a fixed viewport height; separate camera tests cover actual responsive sizing.
Refresh references only after reviewing the resulting geometry.

Metrics are manual, not part of CI. They measure the historical compact layout,
not Svelte cards. Use `--check <file>` for instance-specific limits; see
[scripts/layout-checks.example.yaml](../scripts/layout-checks.example.yaml).

Drafts and pending uploads remain in one browser profile until Sync. Stale-base
saves are rejected. Locally, Sync can write files; `LOCAL_GIT=1` also commits on
the checked-out branch. See [setup.md](setup.md#local).

## Typed layout checks

The active engine is `src/domain/graph/layout.ts`. Run
`npm run test:unit -- src/domain/graph` for typed-port parity and partner/sibling
regressions, and `npx playwright test tests/browser/graph-engines.spec.ts` for
default-engine and expansion checks. All public cases use demo or synthetic
content. The unchanged JS engine remains a test/metrics reference, not a second
user-selectable mode. Never relax geometry assertions to make a port pass.

## Ancestor fan checks

Run `npm run test:unit -- src/domain/ancestor-fan.test.ts` for fixed positions,
missing/ambiguous ancestry, repeated ancestors, cycles and semicircle geometry.
Run `npx playwright test tests/browser/ancestor-fan.spec.ts tests/browser/graph-views.spec.ts`
for both access roles, generation changes, person panels, search, reload, zoom
isolation and mode switching. Public tests use only synthetic people.

## Camera and person interaction checks

`start-zoom.spec.ts`, `graph-camera.spec.ts` and `person-info-camera.spec.ts`
cover first-fit persistence, all card modes, section changes, small saved scales
and panned graphs while person panels open, change person, resize and close.
`graph-expansion.spec.ts` checks that the clicked card stays fixed through local
and worker layouts. `ancestor-fan.spec.ts` exercises every depth from 1 to 10.
The display-name, life-places and search-keyboard browser cases cover the matching
editor, reader and keyboard behavior using only synthetic fixtures.

## Source and export checks

The source catalogue, language variants, editor tabs, dates, GEDCOM and GEDZIP
checks use synthetic fixtures. Run the matching `source-*`, `editor-layout`,
`gedcom-export` and language browser specs after changes. Source publishing tools
are optional local commands; see [source-editions](source-editions/README.md).
Use separate `STAMMGIT_TEST_PORT` values and Playwright `--output` directories
for concurrent runs. CI retains production, development, mobile and narrow checks.

## Known browser limitations

Four explicit expected-failure cases remain from the current application:

- Without a chosen “Me” person, the first connection selection may retain the
  center from page load instead of the person centered afterwards.
- Returning from Admin through the tree link can reset hourglass mode to family.
- Unequal ancestry paths with a shared child can align partners whose ancestor
  paths place them on different rows. Two cases cover local and worker layouts.

These tests execute their assertions and fail on an unexpected pass, so a fix
requires removing the expected-failure annotation. They do not mark the affected
behavior as verified. Other geometry, descendant ordering and camera checks
remain ordinary passing assertions.
