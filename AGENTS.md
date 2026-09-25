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
- Use `src/tokens.css` for colours; terracotta is only for selection/focus.
  Keep fonts local and run the contrast/token build check.
- Maintain German and English strings. Vite hashes assets; edit root `index.html`
  and `src/`, never generated `public/index.html` or `public/assets/ui/`.
- Writing tests use isolated synthetic data, a new local Git repository without
  remotes and no real GitHub credentials. Never write to deployed demo content.

These rules apply to private copies too. Add instance-specific workflow and
content rules there; do not copy those additions back into this public repository.
