# stammgit

**AI-ready, Git-native family trees.** Your family data lives in your own
repository: YAML for people, Markdown for the chronicle, plain files for
documents and photos. Git keeps the history; the archive outlives the app.

That makes the repository something an AI assistant can work with directly:
tell it a story, let it add people, sources and chapters, run the validator,
and review the diff before you merge. Everything can equally be edited in the
browser, on your phone as well as on a desktop.

## Demo

**[stammgit-demo.netlify.app](https://stammgit-demo.netlify.app)** —
password `admin` (editing) or `user` (read-only).
Edits stay in your browser; the repository is unchanged.

## Features

- Family, ancestors, descendants and combined ancestors & descendants views.
- Partner-aware layouts that keep couples together and avoid splitting unrelated
  sibling groups, without imposing a birth-date order.
- Connections between any number of people, including longer routes, partnerships
  and adoption; shared people appear once.
- Edit people and relationships in the browser, including merge and delete.
  Changes stay on your device until **Sync**.
- Compact person panels, relationship descriptions and source evidence.
- Markdown chronicles with subtitles, document cards and book printing.
- Responsive desktop/mobile navigation, local fonts and accessible colour tokens.
- GEDCOM import/export, multiple datasets, YAML/JSON/GEDCOM/ZIP downloads.
- Admin and read-only roles with server-side checks; English and German UI.

## Get started

Use a **private repository** for real family data — see the
[setup guide](docs/setup.md) for your own copy, local hosting and Netlify.

Try it locally with Node 24 LTS:

```bash
git clone https://github.com/kstucki/stammgit.git
cd stammgit
npm install
cp .env.example .env    # set FAMILY_TREE_PASSWORD
npm start               # http://localhost:8888
```

### With an AI assistant

Point the assistant at your private copy. [AGENTS.md](AGENTS.md) holds the
rules it needs: preserve IDs and reciprocal links, attach sources, never
invent facts, and run `npm run build` — it validates every person, source,
photo and chapter reference and fails on anything broken. What survives the
build becomes a commit you can read like any other diff.

## What it is not

Svelte + TypeScript, built with Vite. No database, individual accounts, WYSIWYG
or social features. Single admin; Git is the collaboration model. Details and the
graph rules in [architecture](docs/architecture.md). If you need a full
genealogy suite, [Gramps](https://gramps-project.org) is excellent.

## Documentation

- [Setup](docs/setup.md) — private copy, local server and Netlify
- [Configuration](docs/configuration.md) — datasets, default view and starting points
- [Data format](docs/data-format.md) — people, relationships, sources and GEDCOM
- [Chronicle](docs/chronicle.md) — writing and linking chapters
- [Architecture](docs/architecture.md) — non-goals, design decisions and graph rules
- [Development](docs/development.md) — tests, layout metrics and editing workflow
- [Changelog](docs/CHANGELOG.md)
- [Agent instructions](AGENTS.md)

## License

[MIT](LICENSE).
