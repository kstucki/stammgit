# Sources and evidence

[Back to README](../README.md)

Original documents and individual evidence items share one catalogue. A document
has one canonical URL; citations can add `#page=12`. The catalogue joins citations
on people and parent relationships with document metadata and available local
files, so a page citation or translated PDF does not count as another source.

## Categories and browsing

| Stored key | Contents |
| --- | --- |
| `familie` | Memoirs and family narratives |
| `auskuenfte` | Correspondence, interviews and recollections |
| `forschung` | Independent research articles and studies |
| `register` | Family trees, genealogical registers and lists |
| `todesanzeigen` | Obituaries and death notices |
| `belege` | Individual extracts and summaries supporting recorded facts |
| `andere` | Other documents and sources awaiting classification |

The category sidebar becomes a selector on small screens. Search matches titles,
IDs, citations, tags and linked people. Lists show 25 items per page. Within
Evidence, an optional family filter uses `sourceDetails.tags`. Source details open
in a panel; long person lists are collapsed. Search, filters, pagination and
selection survive navigation and reload.

## Metadata and references

```yaml
sourceCategories:
  /sources/beleg-b000001.pdf: belege
sourceDetails:
  /sources/beleg-b000001.pdf:
    id: B000001
    title: Example register entry
    citation: Example parish register, volume 2, p. 34
    original: https://example.org/register/34
    archive: Example archive
    retrieved: "2026-10-06"
    kind: Summary
    scope: Parentage recorded in this entry
    tags: [Example family]
```

Store the category and metadata under the URL without query or page suffixes.
Link supporting facts from a person's `sources` or a parent's
`parentDetails.<id>.sources`, with a useful label and exact page. A personal
website/profile belongs in `person.links` unless cited as factual evidence.

Each evidence item gets a stable ID such as `B000001`. Family tags may overlap;
they organise the website and do not appear in the evidence PDF. Keep original
books, articles and scans as separate sources instead of absorbing their identity
into a family dossier. Do not delete a source just because no person cites it:
check chronicle chapters in every language and links from other documents too.

An optional `document.en.pdf` or `document.pt.pdf` is a translation of
`document.pdf`. Display uses the selected language when available and otherwise
the original. This does not require translating every source; translate only
documents whose use warrants it. Preserve canonical person references when
replacing a file or adding/removing a translation.

## Durable evidence PDFs

An evidence PDF should make sense without the website: identify the original,
its author/archive and access date; extract or summarise the relevant facts;
name the people concerned and precise locators; distinguish evidence from
interpretation. Keep it concise. Add scans or readings as appendices where useful,
with working internal links and page references. Keep the current supported
account; superseded speculation belongs in Git history.

Local tools in [source-editions](source-editions/README.md) can render evidence
records, verify links/text/attachments and sync metadata into a chosen dataset.
PDF rendering and thumbnail generation never run in the hosted build.

## Exports

| Download | Contents |
| --- | --- |
| YAML / JSON | Full dataset including catalogue metadata and family tags; no file binaries |
| Source ZIP | Saved files from `public/sources`; no injected family tags or catalogue JSON; pending uploads must be synced first |
| GEDCOM 5.5.1 | People/relationships in one language; sources and evidence intentionally omitted |
| GEDCOM 7 / GEDZIP | `gedcom.ged`, cited local documents and portraits; one selected language with fallback; source IDs and citations, no family tags |
| Chronicle book | Chapters in the active language, with numbered source endnotes |

GEDZIP contains the cited files for the exported people, not every uncited
document or chronicle chapter. Missing/unreadable files abort export. YAML/JSON
plus all content files, or the repository itself, remain the complete archive.
GEDCOM exports offer a separate choice to include living people's details;
without it, potentially living people remain anonymous relationship placeholders.
