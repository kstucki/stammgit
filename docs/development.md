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

Add tests for new behavior in `scripts/test.mjs`. Run `npm run build`
after code or content changes. Graph behavior is specified in
[architecture.md](architecture.md); update the rules when behavior changes.

For graph changes, compare metrics before and after:

```bash
npm run metrics -- data/trees/napoleon.yaml
# For an instance with accepted layout limits:
npm run metrics -- data/trees/<tree>.yaml --check <checks.yaml>
```

Metrics are manual, not part of build or CI. See
[layout-checks.example.yaml](../scripts/layout-checks.example.yaml) for the format.

Keep UI strings in both German and English. Update browser asset cache
versions consistently in `public/index.html` and module imports.

## Editing and sync

Drafts and pending uploads live in one browser profile until synced.
A sync based on an outdated central state is rejected rather than
overwriting newer changes. Git history keeps published states recoverable.
Locally, Sync can write to the working directory; `LOCAL_GIT=1` also creates
commits. See [local setup](setup.md#local).

## Working with AI agents

Tell an assistant the family story, let it edit YAML and Markdown and
attach source links, then review the Git diff. Stable person IDs, ordinary
files and validation keep the work inspectable.

Research → sources → YAML → chronicle → tests → commit.

[AGENTS.md](../AGENTS.md) contains the working rules. In your own copy,
add any instance-specific workflow and translation requirements.
