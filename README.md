# stammgit

Git-native family trees. The data is plain YAML in your own repository,
every change is a Git commit, the app is a static site plus a few
serverless functions. No database, no lock-in. (*Stammbaum* is German for
family tree.)

## Demo

**[stammgit-demo.netlify.app](https://stammgit-demo.netlify.app)** –
sign in with password `admin` (full access) or `user` (read-only).
Editing is local-first, so every visitor plays in their own browser
sandbox and the repository stays untouched.

## Run it locally

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

## What it does

- Three views: direct line (hourglass), full family, descendants of one
  person. Custom layout engine with sibling blocks and crossing
  minimization.
- Browser editing: persons, relationships, notes, merge duplicates,
  delete with cleanup. Changes are drafts on your device until **Sync**
  publishes them as Git commits.
- Sources per person: file uploads (kept in the browser until sync) and
  external links (archives, Wikipedia).
- GEDCOM import/export, multiple datasets, downloads as YAML/JSON/GEDCOM/ZIP.
- Two roles (admin, read-only user), enforced server-side. UI in English
  and German (`language` in `data/config.yaml`).

## Deploy to Netlify

Push to a **private** repo (it will hold your family data), import it in
Netlify, set:

| Variable | Purpose |
| --- | --- |
| `FAMILY_TREE_PASSWORD` | admin password (required) |
| `FAMILY_TREE_USER_PASSWORD` | optional read-only password |
| `GITHUB_TOKEN` | fine-grained, Contents: Read/Write, this repo only |
| `GITHUB_REPO` | `owner/repository` |

For a **public demo**, set only the two passwords and never `GITHUB_*`:
everyone gets the admin experience, nothing can be written.

## Layout

```
data/config.yaml          instance config incl. defaultTree (app only reads it)
data/trees/*.yaml         datasets
scripts/                  build + test suite (runs on every deploy and sync)
server.mjs                standalone server (local / VPS)
public/assets/            app, layout engine, model, GEDCOM, strings, pending store
netlify/                  auth edge function + functions (login, save, upload, …)
```

## Data schema

```yaml
meta:
  title: "Napoleon Bonaparte"
  focusPersonId: napoleon_i_bonaparte
people:
  person_id:
    name: "First Last"
    birth: "1769"            # year or ISO date
    death: "1821"
    occupation: "…"
    parents: [id, id]        # up to 4 (adoption)
    partners: [id]
    children: [id]
    partnerDetails: { id: { status: geschieden } }
    notes: ["…"]
    sources: [{ label: "…", url: "/sources/file.pdf" }]
```

## Development

```bash
npm test         # dataset integrity, GEDCOM roundtrip, model ops, auth, layout
npm run build
node server.mjs
```

Unsynced work lives in one browser profile; clearing site data discards
it. Static-only hosts (GitHub Pages) are not supported, since auth and
sync need a server side.

MIT.
