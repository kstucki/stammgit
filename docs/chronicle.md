# Writing a chronicle

The chronicle is a set of ordered Markdown chapters per dataset — the
narrative layer on top of your data and sources. The Chronik tab opens
on the first chapter; the table of contents is one tap away.

## In the app (recommended)

As admin, the Chronik tab offers **New chapter** (on the table of
contents) and **Edit chapter** (on a chapter). The editor has a title, an
optional date (clearable), insert buttons for persons, sources and
photos (downscaled in the browser), and a preview. Saving validates the
chapter and keeps it on your device; **Sync** publishes it as Git
commits, like everything else.

## As files

Chapters are plain files — you can also add or edit them in your editor
or directly on GitHub:

```
public/chronicle/<tree>/index.yaml   # chapter order
public/chronicle/<tree>/my-chapter.md
```

```markdown
---
title: My chapter
date: 2026-08-31        # optional
---

Prose in Markdown. Link persons as [[p:person_id]] — rendered as the
person's name, opening their dialog. Cite sources as
[[s:/sources/file.pdf]] or [[s:https://…]]. Link other chapters or their
sections as [[c:other.md]] or [[c:other.md#section-slug]] — the slug is
the heading in lowercase with dashes. Every token accepts an optional
display label: [[p:friedrich_weber_1870|Fritz]]. A deliberately
source-free chapter (an epilogue, say) sets `unsourced: true` in its
frontmatter. Images are normal Markdown images
on /photos/… paths.
```

Reordering or deleting chapters is done by editing `index.yaml`.

## Rules (enforced at save and on every sync/build)

- Every `[[p:…]]` must be an existing person id, every internal
  `[[s:/sources/…]]` an existing file.
- Every chapter must cite at least one source — the chronicle is
  synthesis of evidence, not a second place for unsourced notes.
- Persons mentioned in a chapter cannot be deleted until the mention is
  removed.

When editing files by hand, run `npm run build` before pushing — a
chapter that breaks these rules fails the site build. The person dialog
shows "mentioned in the chronicle" automatically.
