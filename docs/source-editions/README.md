# Local evidence publishing

These optional editorial tools run locally, outside the website build. The public
repository ships empty manifests; add records and source material in your own
private archive. Generated PDFs go in `public/sources/`.

1. Add `belege/B000001.json` with `id`, `title`, `citation`, `original`, `archive`,
   `retrieved`, `kind`, `scope` and a `text` array. `## ` introduces a heading.
   Do not put family tags in the record; they belong in dataset `sourceDetails`.
2. Optionally add `references` (text), `locators` (named one-based PDF pages),
   `localReferences` (`file`, `page`, `label`) and an `attachment` (`file`, `sha256`,
   optional `title`/`label`). Attachment paths are relative to this directory;
   local reference filenames resolve beside the exported PDF. Keep original
   material with the archive. Optional `author` sets the PDF author.
3. Install PyMuPDF in a local Python environment and render. Document labels are
   German; this does not translate the original or the supplied text.
4. List unchanged original PDFs separately in `originale.json` with the same
   metadata, a stable `id`, `file` and `sha256`. They retain their own category.
5. Sync metadata to the explicitly selected dataset, then validate the result.

```bash
python3 -m venv .venv
.venv/bin/pip install PyMuPDF
.venv/bin/python docs/source-editions/render_evidence.py B000001
node scripts/sync-evidence.mjs --tree my-family
node scripts/sync-evidence.mjs --tree my-family --check
npm run build:data
.venv/bin/python docs/source-editions/verify_evidence.py
npm run thumbnails
```

Without IDs, rendering processes every `belege/B*.json`. Verification checks text,
attachment hashes/images, PDF links and recorded page citations. It does not
check historical accuracy or the continued availability of external URLs.
Metadata sync preserves website family tags and stable IDs; it neither attaches
sources to people nor removes obsolete sources. Review the YAML diff before
committing. Commit records, original material, PDFs and previews together.
