# Svelte migration

[Back to README](../README.md)

The frontend is now Svelte 5 and TypeScript, built with Vite. The former DOM
application and CSS have been removed. Root `index.html` is the source entry;
`public/index.html` and hashed UI assets are generated. Old `/legacy.html` links
redirect with their query and fragment intact.

## Included

- Person cards/dialogs, editing, local drafts, sync, photos and sources.
- Dataset selection, create/merge/delete, import and export, admin/read-only roles.
- Markdown chronicle reader/editor, chapter links, images and captions.
- Family, ancestors, descendants, combined roots and multi-person connections.
- Ancestry-first generations, one card per person and persistent global zoom.
- Shared validation, relationship metadata and dataset-scoped pending files.
- Existing graph/model/GEDCOM/chronicle checks, Svelte/TS checks and synthetic
  unit, server and browser tests.

## Intentional changes

There is no full-tree mode. Connections is inside the tree tab and includes all
simple paths through person/family junctions, with one-attachment loops removed.
The header is compact; historical intro/extra-link configuration is retained but
not rendered. See [configuration.md](configuration.md) for compatibility details.

The backend, Netlify publish directory and durable file format remain. No data
migration rewrites demo people, IDs, sources or chapters. Public demo content
stays in the repository; installation-specific content and features are excluded.
There is one chronicle index per dataset, independent of the German/English UI.

## Review checklist

Run `npm run build`, `npm run test:server`, `npm run test:e2e` and
`npm run test:e2e:dev`. Compare the Napoleon compact metrics before/after; those
metrics are a historical reference, not a measurement of the card layout.
Browser checks write only to the isolated synthetic fixture checkout.

Before merging, review the Netlify branch preview with the public demo:
search/person dialogs, changing views/centers without changing zoom, connection
selection and removal, chronicle navigation, and admin draft/import/export flows.
Hosted writes require explicitly configured credentials; do not enable them for
the public demo. Screenshot examples of the former UI have been removed from the
README until current demo screenshots are reviewed.
