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
