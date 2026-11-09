# Contributing

## Run the self-tests first

```bash
npm run smoke     # eleven suites, 364 assertions
npm run doctor    # render-capability diagnosis (needs a browser)
```

All of `smoke` must pass before touching code. It needs no browser (only `doctor` does), so it runs in CI and offline.

## Three hard rules for this project

**1. The renderer never summarises, infers or rewrites.**

The summary card's conclusion must be written by the caller (the model, or a human) after reading the whole document, and passed via `--brief`. The renderer only lays it out. Without a brief it degrades to an explicitly labelled "extracted from source" card — **never make the renderer invent a summary to look good.**

**2. The image carries facts; operational hints go to the conversation.**

For example an image not exported is written as `[图片] xxx.png · 1200×840 · 18 KB（本次未导出）`; the "add `--with-images` to include it" part goes to stderr and the skill relays it in chat. Tests enforce this.

**3. Do not guess data.**

- Report parsing anchors on fixed `##` headings, never on "looks like";
- In sessions, injected context and real user input are separated by `data.source.kind`, never by text heuristics;
- `dsh-ui` components without a `type` are inferred only when the shape is unambiguous; otherwise kept verbatim and labelled.

## What a change must include

- **New behaviour needs assertions.** Every `tools/smoke-*.mjs` covers one capability; add assertions with the behaviour.
- **Derive assertions from the requirement, not from the implementation.** Writing the same constant in both places only proves it was written twice.
- **Don't invent requirements.** No unrequested abstractions, fallbacks or alternative implementations. Something you thought of but did not build belongs in `CHANGELOG` (known limits) or an issue.
- **Keep docs in sync.** Behaviour changes update `README.md`, `README.zh-CN.md`, the relevant `skills/<id>/SKILL.md`, and `CHANGELOG.md` + `CHANGELOG.zh-CN.md`. `SKILL.md` is the single source of truth for a skill's body — the plugin reads it at call time, so never keep a copy.

## Directory conventions

| Path | Contents |
|---|---|
| `lib/` | Plugin and rendering, zero npm dependencies, only `node:` builtins and relative imports |
| `skills/<id>/SKILL.md` | Skill body (frontmatter `name` must match the directory name) |
| `tools/` | CLIs and self-tests; `smoke-*.mjs` are the assertion entry points |
| `cases/` | Regression fixtures (report, conversation, conformance, math) |

`tools/_*.mjs` are one-off diagnostics (probing asar strings, session fields, A/B comparisons). They are excluded from the npm package and must not be wired into `package.json` scripts. `skills/_*` are retired-skill tombstones, also excluded.

## Commits and pull requests

- One PR, one thing. Large changes start with an issue that states in-scope and out-of-scope.
- Commit messages are imperative and describe *what changed*, not which files moved.
- Paste the **raw output** of the self-tests in the PR body (not "it passes").

## Reporting problems

Bugs, layout problems and platform issues go to [Issues](https://github.com/7starsseeker/dsh-card-export/issues).
Security issues must **not** be filed publicly — see [SECURITY.md](SECURITY.md).
