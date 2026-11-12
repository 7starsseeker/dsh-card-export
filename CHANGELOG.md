# Changelog

> 中文版：[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)

Important changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] — 2026-11-12

Follow-up to 0.1.3, driven by a real fact-check report: a section written as prose disappeared, the framing block was cramped, and neither image showed the question being answered.

### Fixed

- **`## 国内外视角` prose was dropped silently**: `parseViews` kept only `- 国内渠道：…`-style bullets, so a report that wrote the section as ordinary paragraphs produced an empty `data.views`, and `add()` returned without rendering the section. The detail renderer now detects prose (any non-bullet, non-heading, non-table, non-quote line) and falls back to rendering the section verbatim.
- **The framing block was a single dense paragraph**: the preamble now gets its own bordered block with a label divider and paragraph/list rhythm, instead of one blockquote pressed against the rule above it.

### Added

- **The original question now appears in both images**: a report line `> **原始提问**：…` (English: `> **Original question**: …`) is parsed into `data.question` and rendered at the top of the summary card and the long image. It is removed from the preamble so it is not duplicated.
- **The long image renders `## 一句话结论`**: previously only the summary card carried the judgment text; the long image opened with a tier badge and no explanation. It now gets a `一句话结论` block under the title.
- **The summary card's judgment paragraphs get spacing**: the multi-question `问一 / 问二 / 合起来` lines no longer run together.

### Tests

- `smoke-fc200` 77/77 (adds: 03 prose not dropped; question parsed once; question rendered in both images; English question); `smoke-report` 145/145; `npm run smoke` twelve suites exit 0.

## [0.1.3] — 2026-11-11

Alignment with fact-check 2.0.0, whose report templates multiplied from one to six. The verdict template itself did not move by a single character, so the existing skin is unchanged; what 2.0.0 introduced is *documents that hold more than one skeleton*, and those used to lose content.

### Fixed

- **A document with more than one skeleton lost whole sections, silently**: fact-check 2.0.0 lets one deliverable carry several skeletons (Step 4c multi-product reports: merge when the evidence overlaps, split with a `## 总览` when the shapes are mutually exclusive). `parseReport` sent every unrecognised `##` down a `cur = null` path, so such a document matched the verdict anchors and then dropped everything else — the project's own `_audit-coverage` scored a `总览 + 裁决 + 地图` document at 2/12 lines (exit 1), with six sections at 0%. Unrecognised sections are now collected in `data.extra` and appended verbatim at the end of the long image (`附 1`, `附 2`, …) in source order; the summary card states how many there are. A pure verdict report's output is unchanged.
- **The report's own preamble never reached the image**: 2.0.0 asks for a `【定型】` framing card at the top of the report whenever the skill cannot ask the user a follow-up question (batch / sub-agent / scheduled run), plus a `定型：A → B（原因）` re-typing note when the skeleton changes mid-collection. Both sit before the first `##`, where the parser discarded everything. They are now kept in `data.preamble` and drawn verbatim under a "定型与前置声明" label — but only when one of those markers is present, so an ordinary opening sentence is still not painted onto a report.
- **Every compliant verdict report was accused of a missing section**: `## 为什么会这样` is explicitly optional in the template ("不适用则整节省略"), yet the missing-section list counted every absent section key and printed the internal key (`why`) at the bottom of the long image. Optional sections are now excluded and the note uses the section's real name.
- **A section's first paragraph could vanish in the plain-document preset**: `skipDek` skips the first paragraph block *anywhere*, not specifically the dek, so when an H1 is immediately followed by an `##` — exactly the shape of fact-check's 4-E definition skeleton (`# 标题` → `## 一句话定义` → 正文) — the one-line definition was eaten as if it were the dek. The dek is only skipped when one was actually found.

### Added

- **The five non-verdict skeletons get a summary card, without a sixth skin**: fact-check 2.0.0's other skeletons (definition / causal / comparison / map / metric) still have no export anchors and must not be given any, so this is not a parser per skeleton. `lib/modes/skeletons.mjs` is one declarative table: detection needs **two of that skeleton's own headings** (shared ones — `## 定界`, `## 来源`, `## 缺口`, `## 可比性检验` — never count), and the card then lifts the section the skeleton itself designates as its conclusion (`## 一句话定义`, `## 核心发现`, `## 数值`, `## 主因` with `## 落地概率` / `## 因果链` as fallbacks, `## 分场景结论`), labelled `<skeleton> · <section>`. No tiers, no rails — those stay verdict-only. Anything it cannot identify falls back to exactly the previous plain document, byte for byte. An optional second block (certainty tiers, basis differences) is listed under the lead when the skeleton declares one.
- **The long image's enhancement slots now map to each skeleton too**: metric's `## 数值` becomes number cards, map's `## 确定性分层` becomes tier rows, and causal's ruled-out causes / comparison's `## 不可比` / definition's `## 常见误解` become grey blocks (the same "do not treat these as conclusions" treatment the verdict skin gives unconfirmed claims). Only the layout changes: the text is the report's own, in source order, and the coverage suite proves nothing is lost.
- **`proposals/fact-check-2.0-skeleton-anchors.md`**: a draft proposal (not shipped in the package) asking dsh-fact-check to publish the same table as machine-readable data — `reference/skeleton-anchors.json` — **inside the existing 2.0.0 file set, with no version bump and no heading changes**, so the detection stops being a table this repo copied by hand and starts being a declaration the producing side owns.
- **The skeleton table now comes from upstream instead of being a copy**: dsh-fact-check publishes `reference/skeleton-anchors.json` (no heading changes, guarded by its own `lint-skill`), so `lib/modes/skeletons.mjs` reads that file first, falls back to a built-in copy of the same content when it is absent (older install, package without `reference/`), and falls back to the plain document when neither identifies the report. Matching was rewritten to upstream's `matchRule` — strip the trailing parenthetical, then compare for **equality** — replacing the local regex prefixes; the shared headings (`来源` for the verdict only, `定界` / `缺口` / `可比性检验` for nobody) are now excluded from the table's own `sharedHeadings` rather than by convention, which is the trap where a definition report would otherwise be claimed as a verdict. `FACT_CHECK_ANCHORS=<path>` overrides the lookup.
- **`tools/smoke-fc200.mjs` (67 assertions) pins the fact-check 2.0.0 contract**: the three verdict anchors stay byte-identical; two of three still triggers the card; rewriting two of them still degrades silently to a plain document (the failure mode fact-check warns about); an optional section is not reported missing; the preamble and every line of an appended section reach the long image; each of the three non-verdict skeletons gets its lead card and its enhanced block without losing a line; a single fingerprint heading is not enough to claim a skeleton; the built-in table is field-for-field identical to the upstream one (so the fallback behaves the same); an unknown `matchRule` or an empty skeleton list is rejected; and the three rejection traps (a shared heading plus one real fingerprint, only shared headings, one fingerprint plus `来源`) claim nothing. Fixtures: `cases/fc-2.0.0-{verdict,preamble,merged,definition,map,metric}.md`, built on the verbatim 2.0.0 templates.

### Changed

- Documented the boundary in both READMEs and `skills/report-card/SKILL.md`: only the verdict skeleton has export anchors, the other five deliberately fall back to a plain document, and no anchors should be invented for them. The self-test count is now stated from a measured run (twelve suites, 484 assertions).

## [0.1.2] — 2026-11-10

### Added

- **English reports now get the same skin, in English**: the anchors, the tier vocabulary and the UI chrome were Chinese-only, so an English report was classified as a plain document (`looksLikeFactCheck = false`) — the summary card degraded to an "excerpt", the tier badge, the two rails and the per-claim tiering all disappeared, and the chrome stayed Chinese. Now the anchors exist in both languages (`One-line verdict` / `What is true, what is false` / `Sources`, still two-of-three to match), the tier vocabulary accepts the English equivalents (Confirmed / Likely true / Unconfirmed / False / Unverifiable) and maps them back onto the same five internal verdicts (colours and icons unchanged), and the UI strings live in a label pack in `lib/modes/i18n.mjs`. The language is **detected from the report's own headings** (count Chinese and English anchors, more wins; fall back to a CJK ratio) and can be overridden with `--lang zh|en`. Summary card, long image, footers, the "must not be cited" warning, section titles and the tier-count badge all follow the language; so does the size line — Chinese counts characters ("N 字"), English counts words ("About N words"), where an English report used to report 12,585 characters as "12,585 字".
- **The document skin follows the report's language too**: the `report` and `generic` presets take their chrome (kicker, lead/conclusion, contents, footers, the "excerpt" disclaimer) from the same label pack, so an English plain report is no longer an English body in a Chinese shell.

### Fixed

- **English reports opened on a bogus Chinese title**: with no H1, the document preset treats the first `##` as the document title, so English fact-check reports came out titled "One-line verdict". With the English anchors in place those reports take the verdict skin and fall back to `Fact Check Report`; `deriveTitle` also strips inline markup before truncating (a cut inside `**…**` used to leave half a `**` printed on the image) and breaks English sentences on "period followed by whitespace" (so `V4.1` no longer ends the sentence).

- **With several verdicts, the long image's header kept only the first one and the summary card pointed at nothing**: when a report gives more than one tier (`已证实` for platform data, `很可能属实` for a third-party estimate, `已证伪` for a claim nobody ever made), the summary card's neutral `分档结论` badge was right, but each image was wrong in its own way. The long image pinned the first parsed tier to its top — a three-tier report opened on `✓ 已证实` with no place anywhere for the other two (`定档` only ever rendered into the summary card). And when a report splits tiers without a `定档:` line, the summary badge still said `见右侧` while the right side held nothing but bold lines of tier text. Now the long image lists one row per tier — badge plus the scope it covers — with each badge appearing exactly once; a `**已证实 / 高**（…）` line (one tier per line, no `定档:` prefix) is treated as a tier declaration in both images and no longer repeated verbatim in the prose; and if the tiers only appear inside a judgement sentence, the summary badge drops `见右侧` and shows the tier badges itself. Single-tier reports render exactly as before.
- **The README linked GenUI at an account that does not exist**: `https://github.com/changfenhuang/dsh-genui` was assembled from the npm scope (`@changfenhuang/dsh-genui`), and there is no `changfenhuang` account on GitHub — even the user page is a 404. The plugin's own `package.json` declares `omdsh-dev/dsh-genui` in `repository`, `homepage` and `bugs`, so both READMEs now point there.
- **One plugin carried two display names**: the prose said `gen-ui` while the plugin reports itself as `GenUI` (`dshGo.title`). Both READMEs and `skills/transcript-card/SKILL.md` now say `GenUI`.
- **The Chinese README was missing four badges**: the English one carries seven (selftest / npm / npm downloads / license / node / zero dependencies / DSH plugin) while the Chinese one carried three (selftest / npm / license). The missing four are added, so both files now carry the same badges in the same order.
- **The language-switch line sat in five different places**: seven of the ten files were off — `README.md` and `RELEASING.md` put it after the intro, the `CONTRIBUTING` and `SECURITY` pairs had no such line at all, and `RELEASING.zh-CN.md` had none either; only `README.zh-CN.md` and the changelog pair kept it under the title. All five pairs now follow one rule: immediately below the H1, one blank line apart. English side `> 中文版：[X.zh-CN.md](X.zh-CN.md)`, Chinese side `> English: [X.md](X.md) · 本文为中文版`.

### Changed

- **The changelog now has an English twin**: the Chinese text moved to `CHANGELOG.zh-CN.md` and `CHANGELOG.md` is now English — matching the naming convention of the other four bilingual pairs (README / CONTRIBUTING / SECURITY / RELEASING), where the unsuffixed name is English and `.zh-CN` is Chinese. `files` and the doc-sync checklists in the RELEASING and CONTRIBUTING docs were extended for the pair.

## [0.1.1] — 2026-11-09

Documentation and packaging-manifest corrections only; `lib/` and `tools/` are untouched (`npm pack --dry-run` differs from the previous package only by the extra `RELEASING.zh-CN.md`). The release existed to make the npm package page, the repository docs and `engines` say the same thing, and to prove the Trusted Publishing (OIDC) path end to end.

### Fixed

- **The Node badge was wrong**: the README badge said `node >=18`, while `engines`, the prose and CI all require `>=22.15.0` — session logs are zstd-compressed, and `node:zlib` only gained that in 22.15.
- **`README.en.md` does not exist, yet three places referenced it**: the line at the top of `README.zh-CN.md` was a dead link (the English version is `README.md`, already linked on the line above, so the duplicate is gone); the doc-sync checklists in `CONTRIBUTING.zh-CN.md` and `RELEASING.zh-CN.md` also named the English twin `README.en.md` — the English docs name the Chinese one `README.zh-CN.md` in that same slot, so the Chinese side had it exactly backwards.
- **The self-test scale was understated**: the 0.1.0 section, `CONTRIBUTING.zh-CN.md` and `RELEASING.zh-CN.md` still said "eight suites / ~236 assertions"; it is eleven suites / 364 assertions (`npm run smoke`, measured).
- **`RELEASING.zh-CN.md` was not in the package**: `files` listed every bilingual doc as a pair except this one, so "中文版" on the npm package page was a 404. Added.
- **One line in the 0.1.0 known-limits list appeared twice.**

## [0.1.0] — 2026-11-09

First release. Two skills on one zero-dependency rendering base.

### Added

- **Plugin skeleton**: `ctx.skills.registerProvider` registers the two skills; each body is read from its own `SKILL.md` at call time, so edits take effect on restart or hot reload. Mounting is **non-blocking** (the first-run probe runs on `setImmediate`).
- **`report-card` (RPC)**: any Markdown report → summary image + full verbatim long image.
  - The summary is written by the model after reading the whole report (`--brief`: conclusion / key points / key figures / limits); without a brief it degrades to extraction from the source, labelled as such in both the kicker and the footer.
  - The full image reproduces the report's own structure, order and wording.
  - Fact-check reports (any two of `一句话结论` / `哪些是真的` / `来源` present) automatically get the tier badge, the two rails and per-claim tiering; `--brief` may only override the judgement and the summary — **tiers and rails always come from the report**.
  - Missing sections are not filled in: they are listed at the end of the full image.
- **`transcript-card` (TSC)**: a DSH session excerpt → message-flow long image.
  - Four range forms: `--last N` / `--turns a-b` / `--seq a-b` / quoted `--from "…" --to "…"` (matched after normalisation; a short quote must hit exactly once).
  - Four display levels aligned with the client's "work steps" setting: `compact` / `standard` (the default) / `detailed` / `verbose`.
  - Only `source.kind === 'user'` counts as a human instruction; six kinds of injected content never enter the image. Human messages carry no `turn` field, so turn numbers are derived from `turn/start` ordinals.
  - Images render as placeholders by default (name / dimensions / size); `--with-images` embeds local attachments (3 MB per image); `[表情: xxx]` renders as a label.
  - A single over-long message is truncated at 1200 characters by default with the original length noted; `--max-chars` adjusts it.
- **`dsh-ui` mini renderer**: ` ```dsh-ui ` blocks render as cards by default, with three levels of fallback (card → item kept verbatim → whole block as a code fence). When `type` is missing the shape is inferred (`columns+rows` / `pairs` / `steps` / plain-string `items`); what cannot be recognised is never guessed. `--no-render-ui` forces the raw text.
- **Render degradation chain**: Edge → Chrome → Brave/Chromium/Vivaldi → PDF → HTML. If the first in-container attempt fails with sandbox characteristics, one retry appends `--no-sandbox --disable-dev-shm-usage` (never the default).
- **First-run probe**: renders one real PNG and one real PDF to derive `renderLevel` (`png`/`pdf`/`html`) and gives platform-specific advice; it also checks whether dsh-fact-check is installed (introduces it, never promotes it — enforced by a test).
- **Dividers**: the long image is not split; instead a full-bleed hairline is drawn at content-unit boundaries — between `##` sections in reports, between turns in conversations. It reads as an ordinary section break, and because the line reaches the card edge and is perfectly horizontal it doubles as a cutting guide. The line always sits on a unit boundary, never inside a sentence or a table.
- **Configuration**: an out-of-package `config.json` enables or disables each skill by id; the old `verdictCard` key is still recognised.
- **Self-tests**: eleven suites, 364 assertions (`npm run smoke`).

### Fixed (found against real reports)

- **Table-bearing sections were silently dropped**: "哪些是真的" (claim / source / tier table) and "本次未能核实到的" (gap / attempt / result table) in fact-check reports were parsed as `- ` bullets only, so the whole table never reached the image. The renderer now picks by content shape: any section carrying a table or `###` subheadings is rendered as its original Markdown.
- **Ordered-list numbers were all 1**: two causes compounding — a blank line unconditionally ended the list, and `trim()` on continuation lines during assembly dropped their indentation, so each item became its own group.
- **A trailing `---` was drawn as body text**: divider lines are now dropped while parsing.
- **Italic inside bold leaked the whole `**` pair** (`**…*not*…**`), and `***x***` produced mismatched tags.
- **`\|` inside tables cut cells apart**; **tables without leading or trailing pipes were not recognised**.
- **Image syntax became `!` plus a link**; **autolinks `<https://…>` showed their punctuation**; **Setext `===` headings** were not recognised.
- The two-rail heading rewrite dropped the report's own qualifier; the source appendix lost its group heading and closing note; the sequence-number font was too small (11px → 15px).

### Changed (HTML and math)

- **Raw HTML now asks before rendering**: a document containing raw HTML is no longer decided silently — the command exits 4 with zero files written and returns `htmlAsk` (counts by `math` / `style` / `active`, the question, and the two `--html on|off` options); `<script>`/`<img>` and friends are classified `active` and the question suggests the literal option. Plain-text documents are unaffected, and `--preflight` can detect without rendering.
- **Conversation cards are always escaped**: `dsh-ui` card content comes from session text and goes through `inline(..., { html: false })`, unaffected by `--html`.
- **Math goes through a zero-dependency MathML path**: Chromium lays it out natively; `displaystyle="true"` stacks limits and `stretchy="true"` scales delimiters. Eight common formula classes measured with zero semantic loss; long nesting (weighted cross-entropy) checked term by term.

### New self-tests

- `smoke-coverage` (content completeness, 20 assertions): checks line by line that every source line reached the image.
- `smoke-conformance` (Markdown conformance, 56 assertions): 30 constructs + explicit assertions for the known limits + the HTML detector.
- `smoke-math` (math, 20 assertions): MathML structure, `displaystyle`/`stretchy` surviving, long nested formulas, LaTeX inside fenced blocks staying literal.

### Known limits

- The long image is not paginated (`--split` is gone): cut along the drawn dividers when you need segments.
- Markdown support is a subset: a table inside a list is flattened to one line; footnotes and math are not parsed; HTML is always escaped (never executed).
- Fonts come from the system stack, so glyphs differ across machines.
- The container sandbox retry path is unit-tested at the predicate only; the full chain has not been run inside a restricted container.

[Unreleased]: https://github.com/7starsseeker/dsh-card-export/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/7starsseeker/dsh-card-export/releases/tag/v0.1.2
[0.1.1]: https://github.com/7starsseeker/dsh-card-export/releases/tag/v0.1.1
[0.1.0]: https://github.com/7starsseeker/dsh-card-export/releases/tag/v0.1.0
