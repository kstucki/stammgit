# Changelog

## 2026-09-26

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
