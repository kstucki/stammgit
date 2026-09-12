# Agent instructions

- Read [README.md](README.md) for setup and [ARCHITECTURE.md](ARCHITECTURE.md)
  before changing graph behavior; update the latter when its rules change.
- Run `npm run build` after code or content changes. Add tests for new behavior.
- For graph changes, compare `npm run metrics -- data/trees/<tree>.yaml`
  before and after; use `--check <file>` when the instance has layout checks.
- Preserve person IDs, reciprocal family links and partner order when editing
  data. Attach sources to supported facts; do not invent missing details.
- Keep UI strings in both German and English. When browser assets change,
  update cache versions consistently in `public/index.html` and module imports.

These rules also apply to private copies with real family data. Add any
instance-specific workflow or translation rules here.
