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
changing graph behavior. UI strings stay bilingual in `public/assets/strings.js`.

```bash
npx playwright install --with-deps chromium webkit
npm run test:e2e       # desktop Chromium and mobile WebKit, production build
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
