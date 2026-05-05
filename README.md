# Polarity Extractor

Web app that extracts the polarity map from a fiber-optic cable
engineering drawing (PDF or image), lets a human verify and edit the
result, then injects the verified polarity into a test-plan template —
producing **one** downloadable test-plan file that covers every fiber
across every MPO/MMC connector pair in the assembly.

```
PDF / image → vision LLM → Verify UI → JSON injection → 1 combined .txt test plan
```

## Quick start

```bash
cp .env.example .env       # then add your provider API key (see below)
pnpm install
pnpm dev
```

- Web UI: http://localhost:5173
- API:    http://localhost:3000

## LLM provider

The app supports two vision LLMs, picked at startup via the unified
`AI_*` env vars:

| `AI_PROVIDER`         | SDK                  | Default model        | Default `AI_API_URL`                          |
| --------------------- | -------------------- | -------------------- | --------------------------------------------- |
| `anthropic` / `claude`| `@anthropic-ai/sdk`  | `claude-opus-4-7`    | `https://api.anthropic.com`                   |
| `google` / `gemini`   | `@google/genai`      | `gemini-2.5-pro`     | `https://generativelanguage.googleapis.com`   |

Set `AI_API_KEY` to your provider key. Override the model with
`AI_MODEL`. Override the endpoint (e.g. for a proxy or Vertex) with
`AI_API_URL`. The active provider + model are surfaced at `GET /health`
and shown next to the app title in the header.

Switching providers is a server restart away — both share the same
prompt (`apps/api/src/llm/prompts.ts`), the same JSON schema
(`packages/shared/src/types.ts`), and the same parse-and-retry-once
loop in `apps/api/src/llm/provider.ts`. Provider-specific transports
live in `apps/api/src/llm/{anthropic,google}.ts`.

The legacy env-var names (`LLM_PROVIDER`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`, `GOOGLE_API_KEY`, `GOOGLE_MODEL`) are still honoured
as fallbacks if the unified `AI_*` ones are not set.

## Repo layout

```
polarity-app/
├── apps/
│   ├── api/                       # Express + TypeScript backend
│   │   └── src/
│   │       ├── index.ts           # Server entry
│   │       ├── routes/            # /upload /sessions /verify /generate /download
│   │       ├── llm/               # Provider dispatcher + Anthropic/Google transports
│   │       ├── pdf/               # PDF → PNG rendering (pdf-to-img)
│   │       ├── polarity/          # §7 lookup + validation
│   │       ├── inject/            # Hex-prefix parse + combined-file build + output
│   │       └── templates/         # Reference test-plan files
│   └── web/                       # Vite + React + Tailwind frontend
│       └── src/
│           ├── pages/             # Upload, Verify, Download
│           ├── components/        # PdfViewer, PolarityGrid, PolarityDiagram
│           ├── store/             # zustand session store
│           └── lib/               # API client, colors, cn
└── packages/
    └── shared/                    # zod schemas + shared types
```

## How extraction works

1. The user drops a PDF on the home screen.
2. The API renders every page to a PNG at `PDF_RENDER_DPI` (default 200)
   using [`pdf-to-img`](https://www.npmjs.com/package/pdf-to-img). This
   is a pure-Node renderer (pdf.js + sharp) so no GraphicsMagick or
   Ghostscript install is required.
3. The PNGs are sent in one request to the configured LLM with a strict
   "return JSON only" system prompt:
   - `LLM_PROVIDER=anthropic` → Claude Messages API with image blocks.
   - `LLM_PROVIDER=google` → Gemini `models.generateContent` with
     `inlineData` parts and `responseMimeType: "application/json"`.
4. The response is validated against `ExtractedDrawing` (a zod schema).
   On a validation failure the call is retried once with the parser
   error fed back to the model. The retry replays the model's prior
   raw output as an assistant turn so it can "fix" what it said.

## Verification UI

Two-pane layout:
- **Left**: rendered PDF pages (the same PNGs sent to Claude — bundling
  PDF.js in the browser would duplicate work for no visual gain).
- **Right**: editable summary chips, a connector-pair selector with
  per-pair status (green tick / red cross from the validator), an
  editable per-fiber grid, and an SVG polarity diagram that updates
  live as cells are edited.

The "Approve & generate" button stays disabled until:
- every pair has the expected fiber count;
- every position is in `[1..shellSize]`;
- there are no duplicate End A or End B positions inside any pair;
- the user explicitly checks the "I have verified this extraction"
  acknowledgement.

## Polarity lookup (§7) — confirmation step required before production

`apps/api/src/polarity/lookup.ts` is the single source of truth for the
test platform's `polaritySequence` integers and the canonical mapping
arrays per polarity type.

**Only `polaritySequence: 3` ("Polarity A 12") is verified** — that one
matches the attached `12 Fiber SM M12 M12 Polarity A.txt` template
byte-for-byte. Every other row is marked `verified: false` and **must
be confirmed with the test-equipment team** before this app is used to
generate plans for those types.

To confirm a row, edit `lookup.ts`, set `verified: true`, and adjust
the integer / mapping if necessary. The lookup file is intentionally
the only source you need to touch — every code path consults it.

### Base-8 connectors in 12F shells

We treat the polarity `mapping` array as the **physical shell size**
(12 for an MPO-12 / Base-8 MPO, 16 for MPO-16 / MMC-16) with `0` as a
sentinel at every dark position. `darkChannels` lists those same
positions. `wizardData.fibersPerCable` reflects the **active** fiber
count per §5.3 (so 8 for an MPO-8). The IL/RL test block's `run` list
contains exactly `fibersPerCable` measurement entries; dark fibers are
skipped.

This shape was chosen based on the answer to the spec §13 confirmation
question. If the test platform actually expects a length-8 mapping for
Base-8 connectors instead, change the `mapping` arrays in `lookup.ts`
to length 8 and remove the dark sentinels.

## Templates

`apps/api/src/templates/sm_mpo12_mpo12_polarity_a.txt` is the only
shipped base template. The injection step deep-clones it and mutates
the §5.3 fields (polarity, connector strings, equipment array
lengths, test-block runs, IDs, timestamps) to fit any extracted
drawing — so this single template is enough for every supported case.

To add new base templates (e.g. for materially different test-block
shapes), drop the file in `apps/api/src/templates/` and add an entry to
`TEMPLATE_REGISTRY` in `apps/api/src/inject/templates.ts`.

### Hex prefix

Every test-plan file starts with the literal ASCII string `0085C29217`
(10 bytes), then a single-line JSON object. The bytes are preserved
byte-for-byte by `inject/parse.ts`, which splits the file at the first
`{` and treats everything before it as opaque header bytes.

## Combined-file generation

The build step produces **one** file that covers every fiber across
every connector pair in the drawing. The file is a deep clone of the
base template with every per-fiber structure resized to span all
`totalFibers` logical fibers:

1. **Per-pair polarity lookup.** Each pair is matched to the §7 lookup
   row by `(polarityType, fibersPerConnector)`. The human-readable
   polarity name and integer `polaritySequence` are pulled from that
   row when every pair shares the same canonical type; otherwise they
   fall back to the per-fiber mapping the human entered.
2. **Global fiber numbering.** Logical fibers are numbered 1..N in the
   order pairs appear in the drawing. Within each pair, fibers are
   sorted by ascending End A physical position, so global fibers
   `(p-1) * fibersPerConnector + 1 .. p * fibersPerConnector` belong
   to pair `p`.
3. **Combined polarity mapping.** For every global input fiber, the
   value at `mapping[i-1]` is the global End B fiber index. End B
   fiber indices are derived by sorting each pair's End B positions
   ascending and taking the index of the matching position. So a
   288F Type B Base-8 trunk produces the per-pair Type B reversal
   `[8,7,6,5,4,3,2,1]` repeated 36 times with the offsets
   `[+0, +8, +16, ...]` applied.
4. **Equipment switch arrays.** `switch0` carries the module index
   (1..pairCount), repeated `fibersPerConnector` times per module.
   `switch1` carries the **physical** shell position of each fiber as
   read from the drawing — so Base-8-in-12F shells use the addresses
   `{1,2,3,4,9,10,11,12}` cycling per module, matching how the test
   equipment physically connects.
5. **JSON mutations.** Beyond the per-fiber arrays the build step also
   resets `id`/`importDate` to `null`, generates a fresh top-level
   `uuid`, sets `createdAt`/`updatedAt` to the ISO timestamp at
   generation time, and rewrites `wizardData.assembly.{coreSize,
   connectorEndA/B, terminationTypeEndA/B, polaritySequence, polarity}`
   per §5.3.
6. **Test blocks rebuilt.** `testBlocks[].specification.procedures[].run`
   is rebuilt with one `{t:"m"}` + two `{t:"t"}` triples per logical
   fiber (so `1 + N*3` entries total), and the parallel `templateSpec`
   mirrors are kept consistent.
7. **Bytes re-emitted.** The JSON is serialised single-line (no
   pretty-printing, matching the reference templates) and the original
   hex prefix bytes are re-attached byte-for-byte.
8. **Structural validation.** The built file is re-parsed and asserted
   against: prefix bytes match the source, `polarity.mapping` length
   equals `totalFibers` with no duplicate live values,
   `equipment.fibers` length equals `mapping` length, and the IL/RL
   `run` measurement count equals `totalFibers`. Any failure aborts
   the write and surfaces a structured error to the UI.

## Filename

`{partNumber}__test-plan.txt` with any non-`[A-Za-z0-9._-]` character
in the part number replaced by `_`. Example:
`VP1A0288R6P05__test-plan.txt`.

## Choices made (vs. spec)

These are the spots where I picked one of several reasonable options;
each is contained to a single file and can be revisited.

- **Lookup table — code §7 verbatim, mark unverified.** Each row carries
  a `verified` flag (only Polarity A 12 is `true`). See above.
- **Base-8 mapping length = physical shell size, 0 sentinels for dark
  positions.** Per the §13 clarification.
- **`id` and `importDate` set to `null`; fresh UUIDs; current ISO
  timestamps.** Per the §13 clarification.
- **Browser PDF rendering uses server-side PNGs** (the same ones we
  send to Claude) instead of bundling pdf.js worker in the React app.
  Same visual output, simpler build.
- **A single base template.** The injection step rewrites every
  variable structure (test-block runs, fiber-map shapes, array
  lengths) so one base template covers every supported connector and
  polarity. New templates can be registered later if a fundamentally
  different test-block shape is needed.
- **One combined output file per drawing** (vs. one file per
  connector pair as originally specced). The combined file uses the
  global-fiber numbering described above and packs the entire test
  plan into a single `.txt` that the test platform consumes directly.
  See the "Combined-file generation" section.
- **Storage is in-memory + temp filesystem under `os.tmpdir()
  /polarity-app`.** A janitor drops sessions older than 6 hours.

## Scripts

```bash
pnpm dev          # API + web in parallel
pnpm build        # both packages
pnpm typecheck    # both packages
```

## Environment variables

| Var              | Default                                   | Notes                                                |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- |
| `AI_PROVIDER`    | `anthropic`                               | `anthropic` \| `claude` \| `google` \| `gemini`      |
| `AI_API_KEY`     | (required)                                | Provider API key                                     |
| `AI_API_URL`     | provider default (see above)              | Override only for proxies / regional / Vertex        |
| `AI_MODEL`       | `claude-opus-4-7` / `gemini-2.5-pro`      | Override only if needed                              |
| `PORT`           | `3000`                                    | API port                                             |
| `PDF_RENDER_DPI` | `200`                                     | Bump for very dense drawings                         |

Legacy fallbacks (still accepted): `LLM_PROVIDER`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`, `GOOGLE_API_KEY`, `GOOGLE_MODEL`.
