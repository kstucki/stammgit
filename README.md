# stammgit

Lightweight, Git-native family trees.

Keep your family data, sources and stories in your own repository:
YAML for people, Markdown for the chronicle, ordinary files for documents
and photos. Git keeps the history; your archive can outlive the app.

Edit in the browser or work with an AI assistant and review its changes
as a Git diff. Built for Netlify, with a local server included.
(*Stammbaum* is German for family tree.)

## Demo

**[stammgit-demo.netlify.app](https://stammgit-demo.netlify.app)** —
password `admin` (editing) or `user` (read-only).
Demo edits stay in your browser; the repository is unchanged.

<p align="center">
<img src="docs/screenshots/overview-iphone.jpeg" width="290" alt="Overview with starting points and the direct line of Napoleon I – the Beauharnais double connection converging on Napoleon III">
&emsp;&emsp;
<img src="docs/screenshots/person-dialog-iphone.jpeg" width="290" alt="Person dialog: Napoleon III with the double parentage (Louis Bonaparte and Hortense de Beauharnais), sources and view actions">
</p>

## Features

- Direct line (hourglass), full family and descendant views.
  Combine multiple people's hourglass views into one.
- Edit people and relationships in the browser, including merge and delete.
  Changes stay on your device until **Sync**.
- Portraits, source documents and Markdown chronicle chapters linked to people.
- GEDCOM import/export, multiple datasets and YAML/JSON/GEDCOM/ZIP downloads.
- Admin and read-only roles, with server-side access checks; English and German UI.

## Get started

**Use a private repository for real family data.**
Create your own copy, then follow the [setup guide](docs/setup.md)
for local hosting or Netlify.

To try it locally:

```bash
git clone https://github.com/kstucki/stammgit.git
cd stammgit
npm install
cp .env.example .env    # set FAMILY_TREE_PASSWORD
npm start              # http://localhost:8888
```

## Documentation

- [Setup](docs/setup.md) — private copy, local server and Netlify
- [Configuration](docs/configuration.md) — datasets, default view and starting points
- [Data format](docs/data-format.md) — people, relationships, sources and GEDCOM
- [Chronicle](docs/chronicle.md) — writing and linking chapters
- [Architecture](docs/architecture.md) — design decisions and graph rules
- [Development](docs/development.md) — tests, layout metrics and editing workflow
- [Agent instructions](AGENTS.md) — concise rules to adapt to your own copy

## License

[MIT](LICENSE).
