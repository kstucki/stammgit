# Architecture

[Back to README](../README.md)

## Application structure

Svelte owns the UI and reactive workspace state. Pure modules select and lay
out the graph. YAML, Markdown and files remain the durable archive; the local
server and Netlify functions retain authentication and persistence.

| Path | Responsibility |
| --- | --- |
| `src/components/`, `src/views/` | Svelte rendering and interactions |
| `src/state/workspace.svelte.ts` | One editable workspace, drafts and pending files |
| `src/state/` | View selection, center and camera persistence |
| `src/data/` | Loading, explicit model commands, upload/sync/download |
| `src/domain/` | Pure projections, family layout, relationship presentation |
| `public/assets/model.js`, `relationships.js`, `dataset-validation.js` | Shared model commands, relationship rules and validation |
| `src/domain/graph/` | Typed selection, layout and partner adjacency |
| `public/assets/graph.js` | Unchanged JS test reference and historical compact projection |
| `public/assets/chronicle.js`, `gedcom.js` | Markdown processing and GEDCOM exchange |
| `data/`, `public/chronicle/`, `public/photos/`, `public/sources/` | Instance content |
| `scripts/`, `tests/` | Builds, data checks and isolated tests |
| `server.mjs`, `netlify/` | Local and hosted authentication and writes |

`index.html` is the source entry. Vite builds to `dist/`; the build copies its
hashed assets and entry into `public/`, without emptying content directories.
Generated `public/index.html` and `public/assets/ui/` are ignored. `/legacy.html`
only redirects, preserving query and fragment. There is no second UI or iframe.

No database, SvelteKit, external graph layout library, individual accounts,
WYSIWYG editor or social features. Git remains the collaboration model.

## Graph rules

These rules are the specification. Update them before changing behavior.

- One card per person, including people with multiple partnerships.
- Family shows the center, parents, siblings, partners and children.
- Ancestors & descendants (hourglass) combines any number of roots, their
  ancestor lines, descendants and included partners without duplicating people.
- Ancestors and descendants also have their own modes. There is no full view;
  old stored `full` selections fall back to family.
- Children connect to their documented parent family. Explicit `parentGroups`
  distinguish families; missing relationship types are unknown, never inferred
  as marriage or biological parenthood merely for display.
- Partnerships and parent families are junctions. One child line leaves the
  family junction; with one known parent it leaves that parent's card.
- Documented marriage/biological relationships are solid; unmarried/divorced
  partnerships and adoption use distinct patterns. Multiple partners alone do
  not change a marriage's style. Mixed parent types are labelled per parent.

### Generations and layout

Ancestry takes precedence over partnership. Consistent parent chains place
children exactly one level below their parents, independently of the center.
If path lengths conflict, longest-parent-chain ordering keeps parents above
children and may introduce gaps. Cyclic invalid ancestry terminates safely.
Explicit adoption, guardianship and other parent types remain visible but do
not constrain generation levels; missing/unknown types use ordinary ancestry.
Partners with visible ancestry are not forced onto the same level. A partner
without ancestry may align with the other partner when this is conflict-free.

`family.ts` creates the projection; `family-layout.ts` sets generations and uses
`graph/layout.ts` for ordering. Svelte renders its coordinates. Large layouts can run
in `family-layout.worker.ts`; the worker uses the same algorithm. No generation
or relationship decisions are made by DOM event handlers.

The historical compact marriage-box projection remains only as a reference
adapter for domain tests and metrics. Its mutual-first-partner pairing does not
control the Svelte cards or define a primary marriage. Do not change partner
order when migrating data.

### Active layout engine

All five views use the TypeScript engine for both admin and read-only roles,
including worker layouts. There is no engine comparison control or stored/URL
engine preference. Selection, generation rules, camera and relationship styles
remain independent of ordering.

The typed port preserves the established crossing optimizer and its effort
thresholds. Without the optional partner repair it matches the JS reference
coordinates exactly. The active path adds a repair after ordering:

- Join same-generation recorded partners into adjacent chains, preferring pairs
  already close in the established order; stable IDs break ties.
- Merge compatible chain endpoints only, without duplicating people or breaking
  accepted partner neighbors. Multiple partnerships may prevent full adjacency.
- Move an intrusive partner chain to a boundary of a foreign sibling group when
  this reduces interruptions without worsening another sibling group or reversing
  sibling-bearing chains. A sibling's own partner may remain between siblings.
- Keep adjacent partners at a 28px card gap. Do not sort siblings by birth date
  or YAML rank; the established optimizer still determines their order.

The repair uses documented parent-family child membership and runs outside the
optimizer's candidate loop. It does not guarantee globally minimal crossings.
Unit tests cover partner chains, foreign siblings, generation preservation and
JS/TypeScript parity; browser tests cover the default engine for both roles.

### Connections

Connections is a mode in the tree tab. It starts with the center and accepts
any number of selected people. **Connection with …** in a person dialog searches
for a second person and replaces the previous selection with that pair. Cancel
keeps the previous selection; people can also be removed from the selection.
An intermediate person may remain visible after being deselected.

Show the union of all simple paths between selected pairs in the **person / family
junction graph**, including partnership and adoption. Neither a person nor a
junction can repeat within one path. There is no shortest-path or depth cutoff.
A cycle with only one attachment and no selected person inside disappears;
alternative paths between multiple attachments remain. Unselected leaf children
are omitted. Adult cards of retained junctions remain as context, without
expanding their other families. Filtered child lines are not restored.

This is a strict subgraph of the complete family projection: no invented sibling
shortcuts, duplicate lines or duplicated cards. Empty selection shows search;
one selected person shows only that card. Disconnected selections remain visible.
The iterative block-cut algorithm is tested against exhaustive simple-path
enumeration and a 12,000-person chain.

### Relationship descriptions

Descriptions are independent of the displayed union of paths. The relationship
engine chooses by station count, then edges, then stable IDs. A blood segment
with upward steps followed by downward steps forms one station; partnership and
social-care steps remain separate. A shared-child detour costs more than a
recorded partnership. Paths never repeat a person.

The formatter expresses direct ancestors/descendants, siblings, uncle/aunt,
nephew/niece and cousin degrees. Unequal generations use named intermediate
ancestors rather than ambiguous compound kinship terms. Half-sibling wording
requires two recorded parents on each side and exactly one shared parent.
Unknown/diverse gender uses neutral wording. The first selected person is the
perspective, with one description per additional selection. Short routes form
sentences; longer routes form chains, with the underlying path available as evidence.

### Camera and navigation

One `localStorage.graphZoom` value applies to every mode and dataset. Changing
the center or mode preserves it; **Fit** explicitly changes it. The first family
view without a saved zoom fits both width and height. Explicit family Fit uses
height; other modes use both dimensions. Center, mode, roots and connection
selection are stored per dataset. One-hop arrows add documented direct relatives
without changing the camera. Card clicks center; the separate info action opens
the person panel. Dragging does neither.

Below 900px, navigation is fixed at the bottom; at or above 900px, tabs, search
and logout share one header. Every view button has an icon and label. The tree
fills the viewport with no page scroll; other tabs scroll normally. The person
search belongs only to the tree, with a source search in Sources. Logout asks
for confirmation for both roles. On mobile, pinch zoom replaces zoom buttons;
Fit remains a word. View explanations open from the graph's upper-right info button.

Person information uses a full-height mobile sheet or desktop sidebar: portrait,
life dates/occupation, relationship to center, actions, stories and family names.
Show full names without collapsing relatives. Internal person navigation has its
own Back stack; sources and chapter mentions are disclosures. Editing is admin-only.
Connections use a three-height mobile sheet, initially collapsed, or an open
sidebar on desktop. Selected-person chips live inside the panel.

A jump from chronicle/sources to the tree creates a browser history entry and
preserves scroll/filter state. Center, mode and expansion within the tree do not.

## Editing and persistence

Model commands update one workspace. Local drafts use dataset-scoped storage;
pending uploads/deletions are scoped by dataset too. Navigating between views
does not introduce another editable copy. Sync uploads files, saves YAML with
an optimistic content hash, then performs queued deletions. Conflicts retain the
local draft. This existing multi-request sequence is not atomic across files.

The browser and backend share dataset validation. Local saves also run content
checks and roll back invalid YAML. Optional local Git commits use the checked-out
branch. Hosted writes require explicit repository credentials; the public demo
without those credentials cannot write to GitHub.

## Chronicle

Each dataset has one ordered `public/chronicle/<tree>/index.yaml` and Markdown
chapters. `[[p:id]]`, `[[s:url]]` and `[[c:file#section]]` tokens link people,
sources and chapters. Generated JSON is an index, not another editable source.
The editor stages Markdown and the index through the same pending-file store.

Content is untrusted: raw HTML is rejected/escaped and links allow only safe
schemes. Builds validate references, source files and citations (unless explicitly
`unsourced: true`). People mentioned in chapters cannot be deleted. Figures,
captions and chapter navigation share the same reader and editor-preview renderer.
The reader and preview support optional subtitles/covers, attributed blockquotes,
document cards and local PDF thumbnails. Admin exports include book printing.
See [chronicle.md](chronicle.md).

## Design tokens

`src/tokens.css` owns all UI colours. Warm neutral surfaces and green controls
are shared across devices. Terracotta denotes center, connection selection and
keyboard focus only. Source Serif 4 (400/600) and Inter (400/500/600) are hosted
locally with swap loading and their licenses. The build rejects colour literals
outside tokens and checks text contrast of at least 4.5:1.

## Verification

`npm run build` runs existing integrity/GEDCOM/model/chronicle checks, Svelte and
TypeScript checks, unit tests and the production build. Browser tests use synthetic
content in a fresh temporary Git repository without remotes or real credentials.

Before/after graph changes, run `npm run metrics -- data/trees/napoleon.yaml`.
These manual metrics measure the historical compact reference, not the Svelte
card layout; card geometry has separate unit and browser checks. Instance-specific
limits can use `--check`; never publish private datasets or their thresholds.
