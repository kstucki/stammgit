# Writing a chronicle

[Back to README](../README.md)

Each dataset has one `public/chronicle/<tree>/index.yaml` listing its Markdown
chapters in reading order. The title page shows author/year and numbered chapter
titles with optional subtitles. Images stay in their chapters.

## Editing

Admins can create and edit chapters in the browser. Title, subtitle and optional
date have dedicated fields. Other frontmatter is preserved. Save stages a local
draft; Sync publishes it together with the index and uploaded files.

```markdown
---
title: A chapter
subtitle: Places and people
author: The author
year: 2026
cover: /photos/chapter.jpg
---

Text with [[p:person_id]], [[s:/sources/document.pdf|Source]] and
[[c:other.md#section|Another chapter]].
```

Only `title` is required here. Use simple single-line frontmatter values, without
inline YAML comments. Deliberately unsourced personal writing can set
`unsourced: true`; other chapters must cite a source. The public app has one
chapter set per dataset. UI language (German/English) does not translate content.

## Typography, images and quotations

Body text is Source Serif 4, 18px (17px on mobile), line height 1.6, at most
640px/65ch. Person and source links gain a dotted underline on hover/focus.
Normal web links retain ordinary styling.

An image on its own line and the following paragraph form a figure and caption.
A blank line before the caption is optional. A heading or another image ends the
figure without a caption. Images can extend to 860px, or full width on mobile.
The sole image variant `![Portrait](/photos/person.jpg "schmal")` keeps the image
within the text column. Captions can contain normal tokens.

```markdown
> A remembered sentence.
> — [[p:person_id]] · [[s:/sources/document.pdf|Source]]
```

The last quotation line beginning with `— ` becomes a small attribution.
No custom components or raw HTML are needed or permitted.

## Document cards

A paragraph consisting only of a source token, optionally followed by
` – Description`, becomes a document card. Separate cards with blank lines.

```markdown
[[s:/sources/document.pdf|A document]] – A short description.
```

Run `npm run thumbnails` locally with Poppler's `pdftoppm` installed to generate
small JPEG previews of the first PDF page. Commit the images under
`public/sources/thumbnails/` and `public/assets/source-thumbnails.json`.
This is never a Netlify build step. Missing previews use a document icon.

## Navigation and printing

Previous and next chapter cards share a row, style and size on mobile and desktop.
Person links open the person panel. Jumping from a chapter into the tree and
using browser Back restores the chapter's scroll position.

**Admin → Exports → Print as a book** loads all chapters, including local drafts,
waits for images/fonts and opens the browser print dialog. The book has its own
title page using the introduction's cover or first photo. Each chapter starts on
a new page. Navigation and controls disappear; person links become plain text,
source URLs become numbered endnotes at the end of each chapter. Figures stay
together. Ordinary browser printing still prints the current chapter.

## Validation

Run `npm run build` after file changes. Person IDs, chapter targets and local
source files must exist. Raw HTML and unsafe link schemes are rejected. A person
mentioned in a chapter cannot be deleted until those references are removed.
