# Header images

Penny, the gate, in the six header states, light and dark. The dashboard header points at these files at the exact release tag.

These are concept art: rough on purpose, good enough to build and test the header against. Final art may redraw every shape. It keeps the character and colours (record 0030), the states (0031) and the file rules (0033):

- `<header state>-<theme>.svg`, `viewBox="0 0 440 120"`, shown at width 440
- one self-contained SVG: no script, no font, no raster image, no external reference
- CSS or SMIL animation only, off under `prefers-reduced-motion`, nothing blinks faster than once a second
- `plain-*.svg` has no animation and no colour
- at most 10 KB per file

Known gap in the concept files: the wordmark is system font text. Final art draws it as paths.
