# Configuration

[Back to README](../README.md)

Instance settings live in `data/config.yaml`. The application reads this file;
it does not rewrite it. Dataset content is separate in `data/trees/*.yaml`.

```yaml
language: en                # fallback UI language: de | en | pt
title: "Family Tree"        # browser title
defaultTree: napoleon       # dataset filename without .yaml
overview:
  defaultPersons: [napoleon_i_bonaparte, josephine_de_beauharnais]
```

First-time visitors can choose an optional device-local “Me” person or continue
without one. The tree starts from that identity or the dataset’s
`meta.focusPersonId`, and restores graph state when applicable. This identity is
separate from the currently centered person. The menu changes or clears it. Use the mode controls for
ancestors, descendants, their combined hourglass view, and connections.

`overview.defaultPersons` supplies ordered hourglass roots when opening the
compatibility link `/?view=overview`; it applies only to `defaultTree`.
Without it, that dataset's focus is used. A link with `person=<id>&action=tree`
opens an hourglass around that person; `action=descendants` opens descendants.
Multiple roots combine their graphs without duplicate people.

The header/menu provides language selection, sources, Admin and logout. Language
selection is remembered; a URL `language` overrides it. The login page initially
uses the first supported browser language (otherwise German). The configured
language remains the application fallback when no saved choice exists. The header has no page heading. `title` remains the browser title. The old
`eyebrow`, `overview.heading`, `overview.intro`, `note`, `linesHeading` and
`extraLines` fields remain accepted for compatibility but are not rendered.
There is no full view. Old data/configuration need not be rewritten to migrate.

Admins can select or create a dataset in Admin, import GEDCOM, sync, then change
`defaultTree` in the configuration. Selection and drafts are local to the browser;
view state is scoped per dataset, while zoom is global across all of them.

Run `npm run build` after configuration edits. Configured roots and old
`extraLines` references must still identify existing people. For chapter content,
see [Writing a chronicle](chronicle.md).
