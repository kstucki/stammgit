# Configuration

[Back to README](../README.md)

Napoleon is just the demo dataset. Everything instance-specific lives in
`data/config.yaml` — edit it in your editor or directly on GitHub, it is
never written by the app. How to add chronicle chapters:
[Writing a chronicle](chronicle.md).

```yaml
language: en                # UI language: de | en
title: "Family Tree"        # browser tab
defaultTree: napoleon       # what visitors see: data/trees/<name>.yaml

overview:
  heading: "Napoleon Bonaparte"
  intro: "One or two sentences shown above the tree."
  note: "Supports <b>HTML</b>; explain the views or your data here."
  linesHeading: "Starting points"
  extraLines:               # optional jump links into the tree
    - label: "Napoleon I"
      person: napoleon_i_bonaparte
      text: "Description shown next to the link."
```

For a combined direct view, replace `person: id` with `persons: [id_a, id_b]`.
The view is the union of each person's direct view, including both ancestor
lines and the usual descendants/partners, without duplicate people. The first
person sets the generation origin and initial highlight. Starting-point links
always open the direct view. Use exactly one of `person` or `persons`; lists
must be non-empty and contain distinct IDs from the default dataset.

Typical path: create a dataset in the app, import GEDCOM if you have
one, sync, then point `defaultTree` at it. The build validates the
config. Demo data can be deleted afterwards.

Set `overview.defaultPersons: [id_a, id_b]` to use a union of multiple hourglass views as the default view; the first person is the focus.

## Combined starting points

```yaml
overview:
  defaultPersons: [napoleon_i_bonaparte, josephine_de_beauharnais]
  extraLines:
    - label: "Napoleon and Joséphine"
      persons: [napoleon_i_bonaparte, josephine_de_beauharnais]
      text: "Their combined direct lines."
```

Both settings preserve the order of IDs. The first person is the reference
for generations; shared people appear only once. The union retains each
individual view's ancestors, descendants and included partners.

`defaultPersons` applies only to `defaultTree`. Without it, the dataset's
`meta.focusPersonId` remains the starting point. Other datasets use their own
focus. Returning from full view to direct view restores the configured defaults.

## Main fields

| Field | Purpose |
| --- | --- |
| `language` | UI language: `de` or `en` |
| `title` | Browser title |
| `eyebrow` | Short label above the app title |
| `defaultTree` | Dataset filename without `.yaml` |
| `overview.heading` | Overview heading |
| `overview.intro` | Introductory text |
| `overview.note` | Explanatory text; supports HTML |
| `overview.defaultPersons` | Optional ordered roots for the default direct view |
| `overview.linesHeading` | Heading above additional starting points |
| `overview.extraLines` | Entries with `label`, `text` and either `person` or `persons` |

Run `npm run build` after editing; invalid or unknown roots fail validation.
