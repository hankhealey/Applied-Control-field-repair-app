# TODOs

## AI Import Pipeline

- [ ] **Groq structured outputs for PDF extraction** (from /plan-design-review 2026-07-13)
  - **What:** Switch `/api/pdf-enhance` to Groq's `response_format: json_schema` so the model must return exactly the 31 extraction fields.
  - **Why:** Eliminates "AI returned unparseable/misshapen JSON" failures; usually improves per-field accuracy.
  - **Pros:** Fewer silent extraction failures; schema doubles as documentation.
  - **Cons:** Schema must stay in sync with `PDF_FIELDS` in `src/lib/imports/ollamaParser.ts`.
  - **Context:** Extraction currently trusts free-form JSON from the model and catches parse errors ad hoc. Effort: human ~2h / CC ~15 min.
  - **Depends on:** nothing.

- [ ] **Vision fallback for scanned PDFs** (from /plan-design-review 2026-07-13)
  - **What:** When a PDF's text layer is empty/thin, render pages to images (pdf.js canvas) and extract via a Groq-hosted vision model (Llama 4 multimodal).
  - **Why:** Scanned/photographed reports currently fail completely — no raw text means no extraction and Train AI is disabled.
  - **Pros:** Scans work like digital PDFs; biggest single expansion of what the importer can read.
  - **Cons:** Slower per file, larger payloads, a second prompt to tune and eval.
  - **Context:** Build when the first real scanned PDF shows up; needs a scanned test file to verify. Effort: human ~2 days / CC ~45 min.
  - **Depends on:** a sample scanned report PDF for testing.

- [ ] **Hand-written label→field table (replaces the learned mapper)** (from /plan-eng-review 2026-07-16)
  - **What:** A static table of ~31 entries mapping each IRIS field to its label + component section in the Applied Control report template, per asset type. Extraction reads the table; the AI covers only novel layouts and prose.
  - **Why:** The parser guesses layout by substring label match and X/Y position. That guessing caused every extraction bug this week: a Fisher 667 ACTUATOR filed as the valve model, a valve inheriting another component's serial, real model numbers deleted as "numeric". The reports are ONE fixed template, so the layout is knowable — it should be stated, not discovered.
  - **Why not the learned mapper** (built, reviewed, then pulled — kept locally in src/lib/imports/fieldMap.ts + its 30 tests):
    1. Inert in normal use: parsePdfFile applied the map, then enhanceWithAi overwrote every non-blank field (ollamaParser.ts:196). useAi defaults on, so the map only won when the AI was off or rate-limited.
    2. Silently bound to the wrong row when two components share a value. Fisher valve + Fisher actuator both read "FISHER", so learnMapping's first-anchor-wins picked the valve's section for actuatorMake. "Verify by reading" cannot catch it — both cells hold the same string. Next report with a Bettis actuator returns "FISHER", confidently, overwriting a parser line that was correct.
    3. Fixed `take` bled into the next column: rowRightOf has no gap cap (the parser's buildValue uses maxGap=22), so a take:2 learned from "EZ 1-1/2" read "8560 Class / Conn." elsewhere — the neighbouring column's label.
    4. Structurally: only learns a field AFTER it has been wrong, only from verbatim values, and produces a per-browser localStorage artifact nobody can review. Note the inversion — the deterministic map was private while the fuzzy LLM rules are server-shared.
  - **Pros:** Correct for every user on day one. In git, code-reviewed, testable against a real corpus. Zero tokens, no rate limit, no per-browser state.
  - **Cons:** Needs real PDFs (or their extracted text) to write — the labels cannot be guessed from screenshots. Needs a revision if the report template changes.
  - **Context:** pdfParser.ts already has ACTUATOR_OWNERS / POSITIONER_OWNERS / VALVE_OWNERS encoding the section constraint; the table formalises what those guard against. If a learning path is ever wanted, it belongs as a user override on top of the written table, gated on hits >= 2, with a delete affordance.
  - **Depends on:** real report PDFs from the user.

## /import design debt (from /plan-design-review 2026-07-19)

Six design decisions from this review live in the design doc, not here:
`~/.gstack/projects/hankhealey-Applied-Control-field-repair-app/hankhealey-main-design-20260719-142400.md`
→ section "UI design (from /plan-design-review, 2026-07-19)". The items below are the
fix-list residue — verified defects with obvious fixes that just need recording.

- [ ] **Accessibility fix list on /import** (A1-A7)
  - **What:** Accessible names on the per-file asset-type `<select>` (`page.tsx:901`) and both unlabeled `✕` buttons (`:584`, `:941`); `aria-label` on every table input (`:1076`) — 26 of them per row, 153 in full-column mode, currently labeled only by `placeholder="—"`; replace the hover-only `opacity-30/40/50` affordances (`:587`, `:702`, `:944`); 44px touch targets on the `px-2 py-0.5` action buttons (`:917`, `:1213`); `role="textbox" aria-multiline="true"` + a name on the contenteditable observations cell (`:1223`); a real `focus-visible` ring on table inputs, which today use `outline-none` plus a JS border-color change (`:1080`).
  - **Why:** `#6b7280` at 30% opacity on white is roughly **1.7:1** — WCAG wants 3:1 for UI components — and on touch there is no hover at all, so those controls are permanently faded. A screen-reader user tabbing a row hears "edit text, dash" 26 times with no column context.
  - **Pros:** Every fix is additive and local. The file already sets its own standard — three other `<select>`s on the page have `aria-label`; this makes the fourth consistent.
  - **Cons:** None material. The `aria-label` work touches the same render path as the D3 provenance change, so sequencing matters.
  - **Context:** Found by /plan-design-review 2026-07-19 (Pass 6, 4/10). Cheapest before the table grows to 153 unlabeled inputs. Effort: human ~4h / CC ~30min.
  - **Depends on:** nothing. Best landed with or just after D3 (provenance gutter), which rewrites the same cell render.

- [ ] **Responsive: file row overflow + let the table go wide**
  - **What:** R1 — add `flex-wrap` to the file row (`page.tsx:844`), which holds filename + status + an 11-option select + two buttons + `✕`, every one of them `whitespace-nowrap`. R2 — let the Extracted Data / Records sections break out of `max-w-5xl` (`:416`).
  - **Why:** At 375px the filename is crushed to nothing and the row overflows. At the other end, a 153-column table is boxed into 1024px on a 2560px monitor with dead space either side — this page specifically wants the width.
  - **Pros:** R1 is one class. R2 makes the full-column view genuinely usable instead of a scroll-in-a-box.
  - **Cons:** R2 needs the title/config sections to stay at `max-w-5xl` while only the tables widen, so it's a small layout restructure, not a one-liner.
  - **Context:** Found by /plan-design-review 2026-07-19 (Pass 6). Mobile is not the primary use case — a coordinator works at a desk — so R1 is about not looking broken, R2 is the one with real daily value. Effort: human ~2h / CC ~15min.
  - **Depends on:** nothing.

- [ ] **Failed-parse error recovery**
  - **What:** Map known pdf.js failures to plain sentences instead of rendering raw `String(err)` (`page.tsx:866`), and give the `error` status the same `↻` retry affordance the `done + _aiError` path already has (`:924`).
  - **Why:** The asymmetry is exactly backwards — a file that succeeded-but-was-rate-limited gets **Retry AI**; a file that genuinely failed to parse gets a red `✗`, an exception dump, and no action but `✕` remove. The worse outcome has fewer options.
  - **Pros:** Reuses the retry button that already exists. Turns a dead end into a recoverable state.
  - **Cons:** Needs a small error-message map, and unmapped errors still need a sane fallback string.
  - **Context:** Found by /plan-design-review 2026-07-19 (Pass 2, 6/10). Effort: human ~3h / CC ~20min.
  - **Depends on:** best done alongside D7 (typed `_notes` channel) since both touch how failures surface.

- [ ] **Sanitize AI-generated observations HTML**
  - **What:** Add DOMPurify (or equivalent) with an allowlist of `p/strong/em/br/ul/li` between `generateObservationsHtml` (`ollamaParser.ts:109`) and the `dangerouslySetInnerHTML` sink at `page.tsx:1235`.
  - **Why:** The function returns model output verbatim and there is **no sanitizer in `package.json`** — no DOMPurify, no sanitize-html. That HTML renders into the DOM and also flows into the CSV export.
  - **Pros:** One dependency, one call site. Removes an unsanitized-HTML sink entirely.
  - **Cons:** ~20KB dependency; the allowlist needs to match what the prose model actually emits or observations lose formatting.
  - **Context:** Found by /plan-design-review 2026-07-19 while checking a11y on the contenteditable. Low likelihood — the input is the user's own PDFs on an authenticated internal tool — but it is a genuine sink and worth closing cheaply. Effort: human ~1h / CC ~10min.
  - **Depends on:** nothing.

- [ ] **Make training examples discoverable at zero**
  - **What:** Render the training-examples toggle when the count is 0, matching the rules link beside it. `page.tsx:508` hides it behind `{examples.length > 0 && ...}`; `:506` renders the rules link at zero as `+ AI rules`.
  - **Why:** Same toolbar, opposite behavior. A new user never learns training examples exist, which is half the AI-training story.
  - **Pros:** One-line change, mirrors an existing pattern in the same JSX block.
  - **Cons:** Adds a control that does nothing until you save an example — so it needs the empty-state copy the rules panel already has.
  - **Context:** Found by /plan-design-review 2026-07-19 (Pass 2). Effort: human ~30min / CC ~5min.
  - **Depends on:** nothing.

## Extraction robustness (from /plan-eng-review 2026-07-19)

Deferred from the eng review of the accuracy work. The layout-miss WARNING shipped
(constructionMissWarning in pdfParser.ts); these are the rest.

- [ ] **Replace the fallback ladder with a declarative label→field table**
  - **What:** The construction extraction is a 12-rung fallback ladder (`asLeftNth([...], N)` at pdfParser.ts:746-947, each field trying prefixed → ordinal → guarded whole-page). The design doc's Approach A is a flat `{component, labels, occurrence, field}` table the extractor reads. Convert the ladder to that table.
  - **Why:** Every new report template adds rungs to the ladder (branching code); a table adds rows (data). It also kills the DRY finding (12 near-identical call sites) and makes the label sets reviewable in one place.
  - **Pros:** Flat, reviewable, testable per-row; new templates are data not code; DRY.
  - **Cons:** It's a rewrite of proven-correct code (currently 32/33). Real regression risk — must keep the scorecard green through the change. Do NOT do this right before a work deadline.
  - **Context:** Found by /plan-eng-review 2026-07-19 (Architecture A2, Code Quality C2). The scorecard test (scorecard.test.ts) is the safety net — the refactor is only safe because that locks the measured behavior. Effort: human ~1 day / CC ~2h.
  - **Depends on:** the scorecard staying green; ideally 1-2 more report fixtures first.

- [ ] **Add a fixture for a labels-left, two-value-column layout**
  - **What:** nthInAsLeft's fallback (pdfParser.ts:513) reads full-width when labels sit left of centre. On a hypothetical report with labels on the left AND both AS FOUND and AS LEFT value columns to the right, it would grab the AS FOUND value (leftmost), not AS LEFT. No such report exists in the 3 fixtures, so it's untested.
  - **Why:** It's the one construction-extraction path with zero coverage, and it's a silent-wrong path (returns a plausible-but-wrong value).
  - **Pros:** Closes the last coverage gap in the extraction ladder.
  - **Cons:** Needs a real report of that shape to build the fixture honestly — inventing one risks encoding a wrong assumption (the exact mistake that shipped a broken fix earlier this week).
  - **Context:** Found by /plan-eng-review 2026-07-19 (Test gap). The constructionMissWarning guard partially covers the total-miss case, but not the partial-wrong-column case. Effort: human ~1h / CC ~15min, once a matching report exists.
  - **Depends on:** a real report with that layout.
