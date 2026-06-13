# UltraCode AI — Examples

Small, self-contained scripts that exercise a **real public API** of UltraCode AI.
They are dependency-light and offline-friendly: no network calls, no LLM, no API
key required.

Build the workspace once before running any example:

```bash
pnpm -r build
```

## `versioning-suggest.mjs`

Asks the AI versioning system (`createVersioningSystem(...).suggest()` from
`ultracode-core`) for the next SemVer version of **this repository**, using the
deterministic conventional-commit heuristics. The only external process is the
local `git` binary that the change analyser shells out to.

```bash
# Suggest the next version from the last tag → HEAD:
node examples/versioning-suggest.mjs

# Or analyse an explicit git revision range:
node examples/versioning-suggest.mjs v1.2.0..HEAD
```

Example output (numbers vary with history):

```text
UltraCode versioning suggestion
───────────────────────────────
current   1.2.0
suggested 1.3.0
bump      minor   (confidence 72%)
reasons:
  - 1 feature commit(s) — backwards-compatible minor bump.
  - 2 of 3 commit(s) follow the Conventional Commits format.
```

> The script loads the compiled `ultracode-core` entry point by relative path
> so it runs straight from a fresh checkout. When you depend on the published
> package instead, replace that with a plain
> `import { createVersioningSystem } from "ultracode-core";`.
