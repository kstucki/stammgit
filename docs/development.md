# Development

[Back to README](../README.md)

Install dependencies with `npm install` and configure `.env` as described
in the [setup guide](setup.md). Then:

```bash
npm test         # dataset integrity, GEDCOM roundtrip, model ops, auth, layout
npm run build    # tests plus generated data
node server.mjs
```

## Changes and validation

The working rules — build after every change, tests for new behavior,
bilingual UI strings, consistent cache versions, data conventions — are in
[AGENTS.md](../AGENTS.md); they apply to humans and agents alike. Graph
behavior is specified in [architecture.md](architecture.md); change the
rules there before the code.

For graph changes, compare metrics before and after:

```bash
npm run metrics -- data/trees/napoleon.yaml
# For an instance with accepted layout limits:
npm run metrics -- data/trees/<tree>.yaml --check <checks.yaml>
```

Metrics are manual, not part of build or CI. See
[layout-checks.example.yaml](../scripts/layout-checks.example.yaml) for the format.

## Editing and sync

Drafts and pending uploads live in one browser profile until synced.
A sync based on an outdated central state is rejected rather than
overwriting newer changes. Git history keeps published states recoverable.
Locally, Sync can write to the working directory; `LOCAL_GIT=1` also creates
commits. See [local setup](setup.md#local).
