# dsh-card-export

Turn Markdown reports and DSH conversations into shareable images. A **DeepSeek Harness plugin** with two skills.

[![selftest](https://github.com/7starsseeker/dsh-card-export/actions/workflows/selftest.yml/badge.svg)](https://github.com/7starsseeker/dsh-card-export/actions/workflows/selftest.yml)
[![npm](https://img.shields.io/npm/v/dsh-card-export.svg)](https://www.npmjs.com/package/dsh-card-export)
[![npm downloads](https://img.shields.io/npm/dm/dsh-card-export.svg)](https://www.npmjs.com/package/dsh-card-export)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.15-brightgreen.svg)](package.json)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-1F3A8A.svg)](https://github.com/7starsseeker)

Zero npm dependencies. No bundled browser, no Chromium download: it drives the Chromium-family browser already on the machine (Edge → Chrome → Brave/Chromium/Vivaldi), degrades to PDF, then delivers HTML.

> 中文文档：[README.zh-CN.md](README.zh-CN.md)

---

## Contents

- [What it is](#what-it-is)
- [Two skills](#two-skills)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [Markdown support](#markdown-support)
- [HTML and math](#html-and-math)
- [Long images and cutting](#long-images-and-cutting)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Verify it yourself](#verify-it-yourself)
- [Limits](#limits)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [License](#license)

---

## What it is

Two things on one rendering base:

1. **Report → two images.** Any Markdown report rendered through the `report` preset (the default) produces **a summary card plus a full verbatim long image**.
2. **Conversation → one image.** A selected span of a DSH session becomes a message-flow image, with user turns and assistant replies; thinking blocks and tool calls are optional.

A single image only happens when you ask for it: `--preset generic`, meant for non-report documents (notes, explanations, checklists).

Rendering only, never rewriting: **what is not in the report does not appear in the image, and nothing in the conversation is invented.**

## Two skills

| Skill | What it does |
|---|---|
| `report-card` (RPC) | Any Markdown report → summary image + full verbatim long image |
| `transcript-card` (TSC) | DSH session excerpt → message-flow long image |

### report-card: why two images

The preset decides the output, not the content: `report` (the default) gives two images, `generic` (explicit) gives one.

- **Summary image** — as much information as possible in a small space. The conclusion is **written by the model after reading the report** (`--brief`); the renderer only lays it out. Without a brief it degrades to an explicitly labelled "extracted from source" card.
- **Full image** — the report's own structure, order and wording, section by section. No reordering, no omission, no rewriting, no summarising on the author's behalf.

Fact-check reports are a skin within the `report` preset: the summary card also carries the tier breakdown, the two rails (甲轨/乙轨), and the one-sentence takeaway — but **tiers and rails always come from the report itself**, never from a brief.

### transcript-card: faithful to what you saw

With [gen-ui](https://github.com/changfenhuang/dsh-genui) installed, ` ```dsh-ui ` blocks render as cards in the conversation. Fidelity therefore means *what you saw*, so cards are rendered by default:

| Level | Trigger | Result |
|---|---|---|
| ① Render as card | Parses, component supported | Card (callout / list / keyvalue / table / stat / badge / steps / …) |
| ② Per-item fallback | One component unrecognised | "Unrecognised component, kept verbatim" + its JSON; the rest still renders |
| ③ Whole-block fallback | JSON invalid, or no items | Falls back to a code block, character-for-character |

Pass `--no-render-ui` to always see raw JSON.

## Requirements

- **Node.js ≥ 22.15** (session logs are zstd-compressed; `node:zlib` gained zstd in 22.15)
- **One Chromium-family browser** for rasterisation: Edge / Chrome / Brave / Chromium / Vivaldi
- DSH (as a plugin), or call the CLIs under `tools/` directly

Without a browser it still works, but only PDF or HTML is produced.

## Install

As a DSH plugin:

```bash
dsh plugin --profile desktop add dsh-card-export
```

Local development (edits take effect on restart; the marketplace marks it "local dev"):

```bash
dsh plugin --profile desktop add T:\dsh-card-export
```

Restart DSH; `report-card` and `transcript-card` appear in the skill catalog.

Without the plugin:

```bash
git clone https://github.com/7starsseeker/dsh-card-export.git
cd dsh-card-export
node tools/doctor.mjs
```

## Usage

### Reports

```bash
# inspect the parse first (no image)
node tools/render-report.mjs report.md --out ./out --dump

# summary + full image
node tools/render-report.mjs report.md --out ./out --png --width 960

# with a model-written summary (recommended)
node tools/render-report.mjs report.md --out ./out --brief brief.json --png

# HTML only (no browser needed)
node tools/render-report.mjs report.md --out ./out
```

`brief.json`:

```json
{
  "conclusion": "One sentence: what this report actually says",
  "points": ["thing 1 worth knowing", "thing 2"],
  "numbers": [{ "label": "metric", "value": "61% → 84%" }],
  "caveat": "what this report does not cover"
}
```

### Conversations

```bash
# list turns and event counts first
node tools/render-transcript.mjs session.v4.jsonl.zstd --out ./out --dump

# last 3 turns
node tools/render-transcript.mjs <session> --out ./out --last 3 --png

# specific turns / event range
node tools/render-transcript.mjs <session> --out ./out --turns 2-5 --png
node tools/render-transcript.mjs <session> --out ./out --seq 120-260 --png

# quote-based anchors: from "this line" to "that line"
node tools/render-transcript.mjs <session> --out ./out --from "first line" --to "last line" --png
```

Session files live at `<DSH_HOME>/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`.

Display levels mirror the client's "work steps" setting (`settings.transcript.*`):

| `--level` | Exported |
|---|---|
| `compact` | last reply per turn + user instructions |
| `standard` (default) | all assistant replies + user instructions |
| `detailed` | + tool calls (name and argument summary) |
| `verbose` | + full thinking + tool results |

## Markdown support

Supported: headings `#`–`#####` and Setext `===`; paragraphs; ordered/unordered lists (continuation lines, nesting, and tables inside a list item after a blank line + indent — the GFM rule); tables (`\|` escapes, optional leading/trailing pipes, alignment); blockquotes; fenced code; thematic breaks; footnotes (`[^1]` with a notes section at the end); inline bold / italic / strikethrough / code / links / autolinks / image references / `[n]` citation superscripts.

**Code blocks are always literal** — LaTeX, HTML and Markdown inside a fence are shown as written, never rendered.

Not supported: footnotes inside tables, math via `$…$` (see below), raw-HTML-only constructs (forms, iframes).

## HTML and math

### HTML: asked before rendering, never assumed

Raw HTML in a document can really execute in the headless browser that takes the screenshot. So the tool **does not decide for you**:

1. Run the export. If the document contains raw HTML, the command **exits with code 4 and writes no files**, returning a question:

```json
"htmlAsk": {
  "detected": 304,
  "breakdown": ["MathML 304 tags", "style tags 3 (<br> <mark> <span>)"],
  "hasActive": false,
  "question": "This document contains raw HTML (…). Should it take effect? …",
  "options": [
    { "flag": "--html on",  "meaning": "take effect (colours, <br>, <mark>, MathML)" },
    { "flag": "--html off", "meaning": "show everything literally (untrusted sources)" }
  ]
}
```

2. The skill relays that question to the user.
3. Re-run with the answer:

```bash
node tools/render-report.mjs report.md --out ./out --png --html on
node tools/render-report.mjs report.md --out ./out --png --html off
```

Detection is reported by category: `math` (MathML), `style` (span/br/mark/div/table/…), `active` (`script`/`iframe`/`img`/`link`/`form`/… — these additionally raise a "prefer literal" warning), `other`.

`--preflight` detects without rendering. Plain-text documents never trigger the question. Transcript `dsh-ui` cards are **always escaped**, regardless of `--html`.

### Math: MathML, zero dependency

Chromium ships a MathML layout engine, so formulas written as MathML are typeset **with no KaTeX, no network, no extra dependency**.

| Want | Write |
|---|---|
| sum/product limits above and below | `<math displaystyle="true">` (otherwise limits sit to the right) |
| brackets that grow with content | `<mo stretchy="true">(</mo> … <mo stretchy="true">)</mo>` |

Measured on 8 common formula shapes plus a long nested one (weighted cross-entropy): semantics preserved in every case; `displaystyle` and `stretchy` fix the two layout gaps versus LaTeX.

`$…$` / `$$…$$` are **not** interpreted — a model that wants typeset math should emit MathML. With `--html off`, formulas show as literal source.

## Long images and cutting

**The output is always one image.** Rendering never splits.

When the image is long (> 12000 px) the result carries a `tooLong` block (height + every divider position + a question). The skill asks whether to cut; only after a yes may `crop-image` run:

```bash
node tools/crop-image.mjs image.png --lines                        # list divider positions
node tools/crop-image.mjs image.png --at 7,11 --confirmed           # cut at lines 7 and 11
node tools/crop-image.mjs image.png --max 5000 --confirmed          # keep each part ≤ 5000 px
```

`--confirmed` is a hard gate: without it the tool exits 3 and writes nothing. Cuts land on the drawn dividers — a full-bleed hairline between `##` sections in reports and between turns in conversations — and the line itself is dropped from the seam, so no grey edge and no half sentence survives.

## Configuration

Optional, outside the package (survives upgrades):

```
Windows  %LOCALAPPDATA%\dsh-card-export\config.json
Other    $XDG_CONFIG_HOME/dsh-card-export/config.json
```

```json
{ "skills": { "report-card": true, "transcript-card": true } }
```

Set a skill to `false` and it stops being registered (saves context). `node tools/config.mjs --list | --disable <id> | --init`.

The first-run probe result is written to `readiness.json` in the same directory.

## How it works

```
Markdown report ──┐
                  ├─► parse ─► HTML (skin) ─► headless browser ─► PNG
DSH session ──────┘                            │
                                               └─► fallback ─► PDF ─► HTML
```

Container note: Linux paths are probed too; if the first attempt fails with sandbox symptoms (`No usable sandbox`, `/dev/shm`), `--no-sandbox --disable-dev-shm-usage` is appended for a single retry. Those flags weaken isolation, so they are never defaults.

## Verify it yourself

```bash
npm run smoke     # eleven suites, 364 assertions
npm run doctor    # render-capability diagnosis (renders once for real)
```

The eleven suites cover: browser probe and container retry rules; first-run probe and advice matrix; report presets and brief sources; transcript parsing and four levels; dsh-ui cards and three-level fallback; fact-check detection and the no-promotion rule; plugin contract and per-skill toggles; divider detection and cropping; **content coverage** (every source line must appear in the output); **Markdown conformance** (30 constructs + explicit known limits + HTML detector); **math** (MathML structure, `displaystyle`/`stretchy`, long nesting, fenced LaTeX stays literal).

## Limits

- **Render only.** Typos and wrong figures in the source appear unchanged in the image.
- **Summary quality equals brief quality.** The renderer never summarises.
- **Missing sections are not filled in.** They are listed at the end of the full image.
- **No bundling.** No fonts, no browser, no dependencies.
- **Never split.** One image; cut along the dividers if you need segments.
- **DSH-specific.** Conversation export depends on `session.v4.jsonl.zstd` fields; field changes fail loudly.
- **Markdown subset.** Footnotes inside tables, `$…$` math, and raw-HTML-only constructs are out of scope.
- **HTML passthrough executes.** Only render documents you wrote or the model produced; use `--html off` otherwise.

Operational hints (what was excluded, which flag includes it) are printed to stderr, never baked into the image.

## Project layout

```
lib/
  index.js              plugin: mount + skill registration + background first-run probe
  first-run.mjs         idempotent first-run probe (readiness.json)
  user-config.mjs       per-skill toggles outside the package
  render/
    rasterize.mjs       browser probe → PNG / PDF / HTML
    check.mjs           real capability probe + advice matrix
    png.mjs             zero-dependency PNG read/write + row cropping
    blank-height.mjs    read-only blank measurement, used to correct screenshot height
  modes/
    markdown.mjs        block/inline Markdown subset, HTML passthrough switch, footnotes
    skin-report.mjs     shared report skin
    report.mjs          report entry: preset detection, brief, dividers
    verdict.mjs         fact-check report: cover / detail
    transcript.mjs      conversation: session parsing, range selection, flow rendering
    dsh-ui.mjs          mini card renderer (three-level fallback)
skills/
  report-card/SKILL.md
  transcript-card/SKILL.md
tools/                  doctor / config / render-* / crop-image / smoke-*
cases/                  samples: report, generic, conversation, conformance, math
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security notes in [SECURITY.md](SECURITY.md), release flow in [RELEASING.md](RELEASING.md).

## License

[Apache License 2.0](LICENSE). Third-party notice in [NOTICE](NOTICE).

Templates and CSS are original to this repository.
