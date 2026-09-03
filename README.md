# stammgit

Lightweight, Git-native family trees.

Your data is plain YAML in your own repository. Every change is a Git
commit. The app is a static site plus a few serverless functions, built
for Netlify, with a standalone local server included. (*Stammbaum* is
German for family tree.)

## Why

stammgit is for people who want their family archive to survive the app.

- data is YAML you can read in any editor
- prose is Markdown
- sources and photos are normal files
- history is Git, not an opaque database
- exchange is GEDCOM
- the app is useful, but the files are the source of truth

## What it does

- Three views: direct line (hourglass), full family, descendants of one
  person. Custom layout engine with sibling blocks and crossing
  minimization.
- Browser editing: persons, relationships, notes, merge duplicates,
  delete with cleanup. Changes are drafts on your device until **Sync**
  publishes them as Git commits.
- Sources per person: file uploads (kept in the browser until sync) and
  external links (archives, Wikipedia).
- A chronicle per dataset: ordered Markdown chapters, linked to persons
  and sources.
- GEDCOM import/export, multiple datasets, downloads as YAML/JSON/GEDCOM/ZIP.
- Two roles (admin, read-only user), enforced server-side. UI in English
  and German.

## AI-ready

This is a core use case, not a bolt-on.

You can tell an AI assistant your family story in normal language. It can
edit the YAML, add Markdown chronicle chapters, connect people to
sources, then leave you a Git diff to review.

That works because the repository is boring on purpose:

- stable person ids
- plain YAML and Markdown
- source links as paths or URLs
- tests for broken relations, missing files and bad chronicle links
- Git commits for review, rollback and blame

Research -> sources -> YAML -> chronicle -> tests -> commit.

## Non-goals

Things stammgit deliberately does not do. If you need them, use
[Gramps](https://gramps-project.org) — it's excellent.

- No database, no application server. Static files plus a few
  serverless functions is the ceiling.
- No frontend build step, no framework, no layout library.
- No user accounts or per-person permissions. One admin; Git is the
  collaboration model.
- No WYSIWYG or rich text. Data is YAML, prose is Markdown.
- No social features: comments, feeds, notifications.
- No media management beyond portraits and plain image files.

## Demo

**[stammgit-demo.netlify.app](https://stammgit-demo.netlify.app)** –
sign in with password `admin` (full access) or `user` (read-only).
Editing is local-first, so every visitor plays in their own browser
sandbox and the repository stays untouched. Want to see it at scale?
Import [royal92.ged](https://github.com/D-Jeffrey/gedcom-samples/blob/main/royal/royal92.ged)
(3,010 persons of European royalty, public domain) as a new dataset in
the admin tab.

<p align="center">
<img src="docs/screenshots/overview-iphone.jpeg" width="290" alt="Overview with starting points and the direct line of Napoleon I – the Beauharnais double connection converging on Napoleon III">
&emsp;&emsp;
<img src="docs/screenshots/person-dialog-iphone.jpeg" width="290" alt="Person dialog: Napoleon III with the double parentage (Louis Bonaparte and Hortense de Beauharnais), sources and view actions">
</p>

## Quickstart

For real family data, use a private repository.

### Local

```bash
git clone https://github.com/kstucki/stammgit.git
cd stammgit
npm install
cp .env.example .env    # set FAMILY_TREE_PASSWORD
npm start               # build + serve on http://localhost:8888
```

Without GitHub credentials the server runs in **local write mode**: Sync
writes straight into the working directory and validates with the full
test suite. Invalid data is rejected and rolled back. Set `LOCAL_GIT=1`
to get a local Git commit per sync.

### Netlify

No local tools required – everything works in the browser:

1. Get your own **private** copy (it will hold your family data): click
   **Use this template** on GitHub and choose *Private*. If you want to
   merge future stammgit updates later, use
   [github.com/new/import](https://github.com/new/import) instead – the
   import keeps the shared Git history. (Don't fork: forks of public
   repos are always public.)
2. Import the repo in Netlify and set:

| Variable | Purpose |
| --- | --- |
| `FAMILY_TREE_PASSWORD` | admin password (required) |
| `FAMILY_TREE_USER_PASSWORD` | optional read-only password |
| `GITHUB_TOKEN` | fine-grained, Contents: Read/Write, this repo only |
| `GITHUB_REPO` | `owner/repository` |

For a **public demo**, set only the two passwords and never `GITHUB_*`:
everyone gets the admin experience, nothing can be written.

## Configuration

Napoleon is just the demo dataset. Everything instance-specific lives in
`data/config.yaml` — edit it in your editor or directly on GitHub, it is
never written by the app. How to add chronicle chapters:
[docs/chronicle.md](docs/chronicle.md).

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

Typical path: create a dataset in the app, import GEDCOM if you have
one, sync, then point `defaultTree` at it. The build validates the
config. Demo data can be deleted afterwards.

## Data format

```yaml
# data/trees/napoleon.yaml (excerpt)
people:
  napoleon_i_bonaparte:
    name: Napoleon I Bonaparte
    birth: "1769"
    death: "1821"
    parents: [charles_marie_bonaparte, maria_letizia_ramolino]
    partners: [josephine_de_beauharnais, marie_louise_of_austria]
    photo: /photos/napoleon_i_bonaparte-abc123.jpg   # optional portrait
    notes:
      - "Emperor of the French 1804-1814 and again 1815 (Hundred Days)."
    sources:
      - label: "Wikipedia summary: Napoleon I"
        url: /sources/wikipedia-napoleon-i.pdf
```

Full reference: `data/trees/napoleon.yaml`. GEDCOM covers exchange with
other software.

## Architecture

The rules of the tree graph — marriage boxes, ring links, descent anchors,
and the custom crossing rules of the layout — are documented in
[ARCHITECTURE.md](ARCHITECTURE.md).

```
Browser        local drafts, pending uploads
   │  Sync
   ▼
Functions      auth and writes: Netlify functions or server.mjs locally
   │
   ▼
Git repo       YAML commits; CI and build validate every state
   │
   ▼
Static site    rebuilt – everyone sees the new state
```

```
data/config.yaml          instance config
data/trees/*.yaml         datasets
public/chronicle/         Markdown chapters
public/sources/           source documents
public/photos/            portraits
public/assets/            browser app
scripts/                  build + tests
netlify/                  hosted auth + sync
server.mjs                local server
```

## Development

```bash
npm test         # dataset integrity, GEDCOM roundtrip, model ops, auth, layout
npm run build
node server.mjs
```

- Drafts (including uploaded files) live in one browser profile until synced.
- One admin at a time: a sync based on an outdated central state is
  rejected instead of overwriting it; every state stays recoverable via
  Git history.
- Static-only hosts are not supported – auth and sync need a server side.

MIT.
