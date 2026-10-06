# Agent instructions

- Read `README.md`, `docs/development.md` and `docs/architecture.md` before
  changes. Graph rules are specified in architecture; update them when behavior changes.
- Run `npm run build` after code/content changes. Add meaningful behavior tests.
  Run the affected browser/server checks where the environment supports them;
  report untested areas explicitly.
- Graph changes: compare `npm run metrics -- data/trees/<tree>.yaml` before/after,
  with `--check <file>` if the instance has limits. Compact metrics are not a
  substitute for Svelte layout tests.
- Preserve IDs, reciprocal links, partner order and documented parent families.
  Missing relationship types remain unknown. Never invent genealogical facts.
- Public stammgit contains only public demo content and synthetic fixtures.
  Never transfer private names, IDs, media, chronicle content, instance settings,
  Git history or case-specific test labels from private installations.
- Keep Svelte rendering, pure graph/domain logic, workspace state and backend
  persistence separate. No parallel legacy UI or second editable dataset.
- Use `src/tokens.css` for colours; terracotta is for selection/focus and the
  explicit uncertain-evidence badge, using contrast-checked dark text.
  Keep fonts local and run the contrast/token build check.
- Maintain German, English and Portuguese UI strings. Content translations are
  optional and explicit; never invent translations or duplicate source identities.
  Vite hashes assets; edit root `index.html`
  and `src/`, never generated `public/index.html` or `public/assets/ui/`.
- Writing tests use isolated synthetic data, a new local Git repository without
  remotes and no real GitHub credentials. Never write to deployed demo content.

## Sources

- The catalogue combines person/relationship citations, `sourceDetails` and local
  files. Zero linked people does not mean unused: check all chronicle languages
  and document-to-document references before deleting anything.
- Use the seven stable category keys: `familie` (family narratives), `auskuenfte`
  (recollections/correspondence), `forschung` (research), `register` (trees/registers),
  `todesanzeigen` (obituaries), `belege` (individual evidence) and `andere` (other).
- Give each evidence item a stable ID such as `B000001` and a self-contained local
  PDF. Update that document instead of adding superseded research notes. Preserve
  original documents as separate sources. Cite exact pages with `#page=N`.
- Store categories in `sourceCategories` and titles/bibliography in `sourceDetails`,
  keyed by the canonical URL without page/query suffixes. `.en.pdf`/`.pt.pdf` are
  optional versions of one document. Family `tags` organise the website only.
- Keep personal websites/profiles in `person.links`; factual citations belong in
  `sources` or `parentDetails.sources`. Explain evidence and its limitations in the
  document; do not use UI descriptions as the only surviving record.
- Preserve source search, 25-item pagination, category counts and the family filter
  within `belege`. Keep exported PDFs free of website tags. YAML/JSON backups keep
  all metadata; the source ZIP contains documents; GEDCOM 5.5.1 omits sources;
  GEDZIP contains cited sources/portraits in one language and omits family tags.
- PDF rendering and thumbnail generation are local editorial tools, never hosted
  build steps. See [docs/sources.md](docs/sources.md).

These rules apply to private copies too. Add instance-specific workflow and
content rules there; do not copy those additions back into this public repository.
