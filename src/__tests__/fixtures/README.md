# Test fixtures

## `fv4101-items.json`

Real pdf.js text runs from an Applied Control repair report (FV-4101), captured
exactly as `extractTextItems` produces them: `{ str, x, y, w, page }` with `y`
already flipped to top-down.

**Customer-identifying strings are redacted.** Coordinates, widths, ordering and
every structural property are untouched — only the values changed:

| Real | Fixture |
|---|---|
| customer name | `ACME REFINING` |
| report technician | `PAT MORGAN` |
| calibration technician | `SAM RIVERA` |
| test witness | `LEE OKAFOR` |
| site | `Riverside` |
| RO / job / ref / PO numbers | generic |
| body + actuator serial | `1234567` |
| positioner serial | `FA00099999` |

The body and actuator deliberately keep the **same** serial, because that shared
value is what hides wrong-row binding — a lookup bound to the wrong component
still returns the right string, so a fixture with unique per-row values would
pass while the code was broken.

### Why this exists

`component-generic-labels.test.ts` originally used a hand-built fixture that
assumed a stacked single-column layout with component headings above their rows.
It passed. It was wrong on both counts, and a fix written to satisfy it shipped
and did nothing on real documents.

The real structure, visible in this fixture:

- `CONSTRUCTION (AS FOUND)` and `(AS LEFT)` are **side by side** — identical `y`
  values, different `x`. AS FOUND occupies roughly x 56-280, AS LEFT x 341-565.
- Each column runs Body → Actuator → Positioner using **bare** labels
  (`Make`, `S/N`, `Model / Size`), so ownership is positional, not textual.
- In the AS LEFT column `Make` occurs at y = 209.4 / 289.6 / 358.6 and `S/N` at
  y = 220.7 / 300.9 / 369.9 — occurrence order is component order.
- The rotated component heading sits near the **bottom** of its block
  (`Actuator` at y=332.7 while its rows run 289-345), and the positioner's
  heading reads `Position.` — not "Positioner".
- Two-cell values (`Model / Size` → `U` + `3"`) sit 25-47px apart, past
  `buildValue`'s default 22px gap.

### Regenerating

There is no committed script — regeneration needs a real PDF, which does not
belong in the repo. To rebuild from another report, write a throwaway test that
loads it with `pdfjs-dist/legacy/build/pdf.mjs` (the default build needs
`DOMMatrix` and fails under the `node` test environment), mirror the item
mapping in `pdfParser.ts` `extractTextItems`, apply a redaction pass, and write
the JSON here. Delete the throwaway afterwards — it would point at a path that
only exists on one machine.
