# Changelog

## 2026-10-06 — Source catalogue, multilingual archive and GEDZIP

- Organise source documents into seven categories, with stable evidence IDs,
  bibliography, family filters, search, 25-item pages and compact detail panels.
  Page citations and translated PDFs share one source identity; personal web
  links remain separate from evidence. Add optional local PDF publishing,
  verification and dataset-specific metadata sync tools with empty manifests.
- Add GEDCOM 7/GEDZIP with cited documents and portraits, language selection,
  conservative living-person protection and media-conflict checks on import.
  GEDCOM 5.5.1 intentionally omits sources. Add birth surnames, explicit living
  status and broader date grammar; older datasets may still omit living flags.
- Support German, English and Portuguese UI and optional person/chronicle/PDF
  language variants. Book printing follows the active language. Add a welcome
  screen, optional device-local identity, archive menu and browser navigation
  through centers, views and person panels.
- Share the centred close control between panels. Group person editing into
  Person, Family, Sources and Photo tabs, retaining language drafts and photo
  crops, with persistent actions and validation across hidden panels.
- Add configurable hourglass depth and focus-relative generation handling for
  unequal ancestry paths. Add individually revocable reader access alongside
  the existing admin and legacy reader passwords.
- Preserve public demo content, configuration, Netlify Node 24 and isolated
  server/CI coverage. Extend CI with narrow WebKit. Transfer only generic code,
  documentation and synthetic tests; no private data, media, map or Git history.

Validation: build with 331 unit tests, Svelte/TypeScript and design checks passed.
Desktop production and development each cover 153 browser cases after focused
reruns: 149 pass and four execute as documented expected failures. Mobile/narrow
WebKit has 98 passes and two explicit Chromium-only gesture skips. The geometry
reference was visually reviewed and updated for the current layout; assertions
still check every connection fits, and the test now waits for settled geometry.
Local production/development/read-only HTTP and save checks passed. Synthetic
evidence rendering verified text, appendix images, five links and a page citation.
Public content/configuration hashes and compact metrics are unchanged (0 crossings,
maximum hole 622px, width 7463px). No hosted or physical-device test was run.

The four expected failures represent three known limitations, described in
[development](development.md#known-browser-limitations); they are not fixed by
this sync and are not counted as verified behavior.

## 2026-09-29 — Camera, person details and search

- Save the first fitted family zoom immediately and reuse it across card views,
  center changes, sections, reloads and datasets. Fit uses both axes; small saved
  scales enlarge smoothly. The ancestor fan stays independent, fits whenever
  opened or its depth changes, supports 1–10 generations and has name/year tooltips.
- Keep the panned graph fixed when person information opens, changes person,
  resizes or closes. Expansion arrows keep their source card fixed, including
  worker layouts and subsequent card measurements.
- Add optional display names and birth/death places with editor, validation,
  merge protection and GEDCOM roundtrips. Cards show separate birth/death years;
  person information retains full names, dates, places and occupation with a
  larger portrait. Closing dismisses the whole person panel.
- Share keyboard navigation between person search and relation pickers. Improve
  documented in-law descriptions and English cousin ordinals. Preserve document
  fragments when resolving pending chronicle assets.
- Keep public demo data, configuration, generation ordering and dependencies
  unchanged. No instance-specific content, language extensions or history copied.

Validation: full build and 210 unit tests passed. All 80 focused browser cases
passed across desktop and mobile Chromium emulation, including reruns after
correcting asynchronous test waits and explicit graph-entry URLs. Isolated
production, development and read-only server checks passed. Compact demo metrics
are unchanged: 0 crossings, maximum hole 622px, width 7463px. No full browser-suite,
WebKit or physical-device run.

## 2026-09-27 — Semicircular fan and view help

- Restore the semicircular ancestor fan and matching icon, without a shape switch.
- Family help explains centering a person's family, expansion arrows and person
  information. Connections gains help for search, paths and removing selections.
  The brief hourglass text stays unchanged; German and English remain aligned.
- Full build and 177 unit tests passed. Four focused browser cases passed on
  desktop and mobile Chromium emulation, including opening both help panels.
  No full browser-suite, WebKit or physical-device run. No data changes.

## 2026-09-27

- Full-circle ancestor fan replaces the ancestor card view, with 1–8 generations,
  visible gaps, repeated ancestor positions, person panels and center search.
- Explicit adoption/guardianship is excluded; unknown parent types remain marked.
  Ambiguous ancestry and cycles are reported rather than silently resolved.
- Independent pan/zoom/Fit, session-persisted depth, reload-safe links and
  readable label orientation. No shape switch or new dependency.
- Architecture, bilingual strings and synthetic interaction/domain tests updated.

Validation: full build, 177 unit tests and 16 targeted browser cases passed
(desktop and mobile Chromium emulation). Compact demo metrics are unchanged:
0 crossings, maximum hole 622px, width 7463px. No full browser-suite, WebKit or
physical-device run. No private data, identifiers, preview cases or history copied.

## 2026-09-26

- Optional combined evidence status (`unsicher`, `gut`, `gesichert`): admin
  editing/clearing, shared validation, lossless application GEDCOM roundtrip
  and conflict-aware merging. Only uncertain ratings appear in person information,
  with a contrast-checked terracotta badge; notes no longer imply a rating.
  Demo data remains unassessed. Tests use only synthetic people.
  Verified with the full build, 171 unit tests and four targeted desktop/mobile
  Chromium browser cases. WebKit and the full browser suite were not rerun.
- TypeScript selection and layout modules preserve the established optimizer;
  the JS implementation remains a parity-test and compact-metrics reference.
- Recorded partners form adjacent chains where possible. Whole partner chains
  can move outside unrelated sibling groups without reversing sibling-bearing
  chains or worsening another group. No additional age/YAML sibling sorting.
- All five views and both access roles use this layout by default, including
  worker layouts. There is no temporary engine comparison control.
- Generic regression tests cover partner chains, sibling groups, generations,
  immutable inputs, legacy parity, role defaults, reload and expansion.

Validation: build, type checks and 169 unit tests passed. Six focused browser
cases passed on desktop and mobile Chromium emulation, with the expanded-parent
case rerun after adding its assertion. No full browser-suite, WebKit or physical-device run is claimed. Public-demo compact metrics are unchanged: 0 crossings,
maximum hole 622px, width 7463px. No instance data or private history transferred.

## 2026-09-25

- Responsive archive navigation: fixed viewport tree, mobile bottom navigation,
  desktop header, five labelled graph modes and contextual search.
- Shared zoom with an initial two-axis family fit, explicit Fit, one-hop expansion
  and separate person information actions.
- Relationship engine and formatter with station-based route costs, cousin degrees,
  conservative half-sibling detection and first-selection perspective.
- Compact person information, full family names, internal person history,
  mobile full-height sheets and desktop sidebars.
- Warm semantic colour tokens, local Source Serif 4/Inter fonts, build-time colour
  and contrast checks. Selection/focus uses terracotta; controls remain green.
- Chronicle subtitles/covers, document cards, quote attributions, local PDF
  thumbnail generation, equal chapter navigation cards and admin book printing.
- Optional gender validation/editor and preservation through merge and GEDCOM.

The public template retains its public demo content and a single chapter set per
archive. Instance maps, private content, language variants and private Git history
are not part of this update.

Validation: build and 146 unit tests; production/development server checks and
read-only hosted-demo checks; desktop browser suite with focused reruns of updated
UI assertions; mobile Chromium at iPhone 13 and 360 × 740 sizes. WebKit and physical
devices were not tested in this environment. Updated visual references were
reviewed using Chromium. Compact metrics on the public demo
are unchanged (0 crossings, maximum hole 622px, width 7463px).
