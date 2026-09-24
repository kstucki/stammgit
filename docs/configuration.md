# Configuration

[Back to README](../README.md)

Instance settings live in `data/config.yaml`. The application reads this file;
it does not rewrite it. Dataset content is separate in `data/trees/*.yaml`.

```yaml
language: en                # UI language: de | en
title: "Family Tree"        # browser title
defaultTree: napoleon       # dataset filename without .yaml
overview:
  heading: "Napoleon Bonaparte"
  defaultPersons: [napoleon_i_bonaparte, josephine_de_beauharnais]
```

The tree opens in family mode around the dataset's `meta.focusPersonId`, or
restores the browser's previous center and mode. Use the mode controls for
ancestors, descendants, their combined hourglass view, and connections.

`overview.defaultPersons` supplies ordered hourglass roots when opening the
compatibility link `/?view=overview`; it applies only to `defaultTree`.
Without it, that dataset's focus is used. A link with `person=<id>&action=tree`
opens an hourglass around that person; `action=descendants` opens descendants.
Multiple roots combine their graphs without duplicate people.

`overview.heading` supplies the page heading; `title` is the fallback. The old
`eyebrow`, `overview.intro`, `note`, `linesHeading` and `extraLines` fields remain
accepted for compatibility but are not rendered by the compact Svelte header.
There is no full view. Old data/configuration need not be rewritten to migrate.

Admins can select or create a dataset in Admin, import GEDCOM, sync, then change
`defaultTree` in the configuration. Selection and drafts are local to the browser;
view state is scoped per dataset, while zoom is global across all of them.

Run `npm run build` after configuration edits. Configured roots and old
`extraLines` references must still identify existing people. For chapter content,
see [Writing a chronicle](chronicle.md).
