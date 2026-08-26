# stammgit

**Git-native family trees.** Your family as YAML files in your own
repository — every change is a Git commit, the app is a static site with a
handful of serverless functions. No server, no database, no platform
lock-in. (*Stammbaum* is German for family tree.)

stammgit sits in the gap between heavyweight self-hosted genealogy suites
(webtrees, Gramps Web — PHP/Python servers with databases) and read-only
GEDCOM viewers: a real, editable web app whose entire state lives as
readable text files under version control.

## Highlights

- **Data you own:** one YAML file per dataset, Git history as the change
  log, GEDCOM import/export for the way in and the way out.
- **Draft → commit:** everything you do in the browser — edits, dataset
  creation, GEDCOM imports, even source file uploads — first lives locally
  in your browser. One **Sync** button publishes it all as Git commits. CI
  validates every dataset — a broken edit can't deploy.
- **Custom layout engine:** generation layers with indivisible sibling
  blocks, crossing minimization, couple-adjacent ancestor lines, hourglass
  view around any person.
- **Sources as files:** upload PDFs/images, linked to persons; stored in
  your browser until Sync commits them to the repo as versioned files.
- **Multiple datasets:** ships with a 70-person Napoleon Bonaparte demo;
  create your own dataset in the app or import a GEDCOM as a new one.
- **Two roles:** admin (full access) and optional read-only user, enforced
  server-side via signed cookies.
- **Two languages:** English and German UI (`language` in
  `data/config.yaml`); adding a language is one block in
  `public/assets/strings.js`.

## Quick start (local, no accounts needed)

```bash
git clone https://github.com/kstucki/stammgit.git
cd stammgit
npm install
cp .env.example .env        # set FAMILY_TREE_PASSWORD
npm start                   # build + http://localhost:8888
```

Sign in with your password and explore the Napoleon demo. Create your own
dataset via **Admin → New dataset**, or import a GEDCOM file. Everything
you edit is a local draft in your browser.

Running locally without GitHub credentials, the server is in **local write
mode**: Sync writes your changes straight into the working directory,
validates them with the full test suite (invalid data is rejected and the
previous state restored), and with `LOCAL_GIT=1` also creates a local Git
commit per sync — a complete CI pipeline on your machine, no accounts
involved. To publish via the GitHub API instead (the mode used on Netlify),
set `GITHUB_TOKEN` (fine-grained, Contents: Read/Write, this repo only) and
`GITHUB_REPO` in `.env`. On hosted deployments without a token, the write
endpoints simply report that saving is not configured — nothing is ever
written on the host.

## Deploy to Netlify

1. Use this repository as a template (keep your copy **private** — it will
   contain your family data), or push your local clone to a private repo.
2. Import the repo in Netlify. Build command and publish directory come
   from `netlify.toml`.
3. Set environment variables:

| Variable | Purpose |
| --- | --- |
| `FAMILY_TREE_PASSWORD` | admin password (required) |
| `FAMILY_TREE_USER_PASSWORD` | optional read-only user password |
| `GITHUB_TOKEN` | fine-grained token, Contents: Read/Write, this repo only |
| `GITHUB_REPO` | `owner/repository` |
| `GITHUB_BRANCH` | optional, default `main` |

Every push deploys automatically; after changing environment variables,
trigger one deploy manually.

## How it works

```
data/config.yaml          instance configuration incl. defaultTree (read-only for the app)
data/trees/*.yaml         canonical datasets
scripts/build-data.mjs    YAML -> public/data/ (validated)
scripts/test.mjs          test suite (runs in every build)
server.mjs                standalone server (local / Docker / VPS)
public/assets/app.js      UI (views, dialogs, draft/sync)
public/assets/graph.js    visibility, generations, layout engine
public/assets/model.js    pure data operations (delete, merge, import)
public/assets/gedcom.js   GEDCOM export and parser
public/assets/strings.js  UI strings (en, de)
public/assets/pending.js  local store for not-yet-synced source files (IndexedDB)
netlify/shared/token.mjs  session tokens (WebCrypto, shared by all runtimes)
netlify/edge-functions/   auth gate for the Netlify deployment
netlify/functions/        login, logout, save-family,
                          upload-source, delete-source, download-sources
```

Editing model: all changes stay on your device first — dataset edits as a
draft in localStorage, uploaded source files as blobs in IndexedDB, file
deletions as a queue. **Sync** (admin tab) then publishes everything in one
batch via the GitHub API: pending uploads, queued deletions, and the
dataset's YAML — each a Git commit; the build validates and republishes.
Every destructive action is therefore a revertible Git commit, and until
you sync, nothing leaves your browser. Note the flip side: unsynced work
lives only in this one browser profile — clearing site data discards it.

## Data schema

```yaml
meta:
  title: "Napoleon Bonaparte"
  focusPersonId: napoleon_i_bonaparte
people:
  person_id:
    name: "First Last"
    birth: "1769"            # free-form: year or ISO date
    death: "1821"
    occupation: "…"
    parents: [id, id]        # up to 4 (adoption)
    partners: [id]
    children: [id]
    partnerDetails: { id: { status: geschieden } }
    notes: ["…"]
    sources: [{ label: "…", url: "/sources/file.pdf" }]
```

`data/config.yaml` holds title, language and the overview texts — edit it
in GitHub or locally; the app never writes it.

## Development

```bash
npm test          # integrity of all datasets, GEDCOM roundtrip,
                  # model operations, auth tokens, config, layout
npm run build
node server.mjs
```

## Public demo deployments

Because all editing is local-first, you can run a **public demo** where
everyone gets the admin experience without any write access: deploy with
only `FAMILY_TREE_PASSWORD` set (published openly, e.g. `napoleon`) and
**never set `GITHUB_TOKEN`/`GITHUB_REPO` on a demo site** — every visitor
then plays in their own browser sandbox; Sync reports "not configured" and
the repository stays untouched.

## Notes and limits

- The content is password-protected but on the public internet when
  deployed: don't record highly sensitive data.
- Static-only hosts (GitHub Pages) are not supported — the password
  protection and sync need a server side. Netlify is the documented path;
  `server.mjs` covers localhost, Docker and any VPS; Cloudflare/Vercel
  adapters are welcome as PRs.
- Browser UI flows are tested manually; the data logic is covered by the
  automated suite. PRs for UI tests, languages and adapters are welcome.

## License

MIT
