# Setup

[Back to README](../README.md)

For real family data, use a private repository.

## Your own repository

Create a private copy with **Use this template** on GitHub.
To retain shared history for future stammgit updates, use
[GitHub's importer](https://github.com/new/import) instead.
Forks of public repositories are public, so use a private copy for family data.

## Local

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

Before pushing real family data, point your local checkout at your private
repository.

## Netlify

Connect your private repository to Netlify and set:

| Variable | Purpose |
| --- | --- |
| `FAMILY_TREE_PASSWORD` | admin password (required) |
| `FAMILY_TREE_USER_PASSWORD` | optional read-only password |
| `GITHUB_TOKEN` | fine-grained, Contents: Read/Write, this repo only |
| `GITHUB_REPO` | `owner/repository` |

For a **public demo**, set only the two passwords and never `GITHUB_*`:
everyone gets the admin experience, nothing can be written.

Static-only hosts are not supported: authentication and sync need the local
server or Netlify functions. Drafts, including uploads, live in one browser
profile until synced. A sync based on an outdated central state is rejected
instead of overwriting newer changes.

## Explore the demo

The [public demo](https://stammgit-demo.netlify.app) accepts `admin` or `user`.
Each visitor edits a local browser copy; the repository stays untouched.
To try a larger tree, import
[royal92.ged](https://github.com/D-Jeffrey/gedcom-samples/blob/main/royal/royal92.ged)
(3,010 persons of European royalty, public domain) as a new dataset in the
admin tab.

Next: [configure your instance](configuration.md).
