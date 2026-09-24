# Data format

[Back to README](../README.md)

Datasets live in `data/trees/<name>.yaml`. Person IDs are stable keys used
by relationships, configuration and chronicle links.

```yaml
# data/trees/napoleon.yaml (excerpt)
people:
  napoleon_i_bonaparte:
    name: Napoleon I Bonaparte
    birth: "1769"
    death: "1821"
    parents: [charles_marie_bonaparte, maria_letizia_ramolino]
    partners: [josephine_de_beauharnais, marie_louise_of_austria]
    photo: /photos/napoleon_i_bonaparte-abc123.jpg   # optional portrait
    notes:
      - "Emperor of the French 1804-1814 and again 1815 (Hundred Days)."
    sources:
      - label: "Wikipedia summary: Napoleon I"
        url: /sources/wikipedia-napoleon-i.pdf
```

See the [complete demo dataset](../data/trees/napoleon.yaml) for examples.

## Relationships

Keep parent/child and partner references reciprocal and preserve partner order.
Every person has one card, with all documented partnerships and parent families.
See the [graph rules](architecture.md#graph-rules).

Optional `parentDetails` records each parent edge (`type`, `label`, `sources`);
`parentGroups` explicitly groups parent IDs into families. Supported parent types
are `biological`, `adoptive`, `guardian`, `other` and `unknown`. Optional
`partnerDetails` records `kind` (`marriage`, `partnership`, `unknown`), `status`,
`start` and `end` per partner. Missing types stay unknown; editing another field
does not fill them in. GEDCOM roundtrips preserve supported relationship metadata.

Keep existing IDs when correcting a name. Notes are lists of text entries.
Attach sources to the people whose facts they support; leave unknown details
unknown rather than guessing.

## Sources and photos

Source documents live in `public/sources/`; reference them with a
`label` and a URL such as `/sources/document.pdf`. External source URLs
are also supported. Portraits live in `public/photos/` and are referenced
by the person's `photo` field. Preserve the referenced files when moving data.

The browser can upload sources and portraits. Uploads remain on your device
until **Sync**. Chronicle chapters can link to people, sources and photos;
see [Writing a chronicle](chronicle.md).

## Exchange and validation

Use GEDCOM to exchange trees with other genealogy tools. The app also
exports YAML, JSON and ZIP files. Keep the repository as the complete archive,
including sources, photos and chronicle chapters.

Run `npm run build` after manual edits to validate relationships and references.
