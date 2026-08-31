# Writing a chronicle

The chronicle is a set of ordered Markdown chapters per dataset — the
narrative layer on top of your data and sources. There is no editor yet:
you add chapters as files, in your editor or directly on GitHub.

## Setup

Create a folder for your dataset and an index with the chapter order:

```
public/chronicle/<tree>/index.yaml
public/chronicle/<tree>/my-first-chapter.md
```

```yaml
# index.yaml
chapters:
  - my-first-chapter.md
```

The Chronicle tab appears as soon as the index exists for the active
dataset.

## Chapter format

```markdown
---
title: My first chapter
date: 2026-08-31        # optional
---

Prose in Markdown. Link persons as [[p:person_id]] — rendered as the
person's name, opening their dialog. Cite sources as
[[s:/sources/file.pdf]] or [[s:https://…]] — rendered as the source's
label. Images work as normal Markdown images on /photos/… paths.
```

## Rules (enforced on every sync/build)

- Every `[[p:…]]` must be an existing person id, every internal
  `[[s:/sources/…]]` an existing file.
- Every chapter must cite at least one source — the chronicle is
  synthesis of evidence, not a second place for unsourced notes.
- Persons mentioned in a chapter cannot be deleted until the mention is
  removed.

Run `npm run build` locally to validate before pushing; the person
dialog shows "mentioned in the chronicle" automatically.
