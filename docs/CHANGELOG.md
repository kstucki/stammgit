# Changelog

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
