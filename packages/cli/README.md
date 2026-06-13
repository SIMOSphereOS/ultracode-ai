# ultracode-ai

> Interactive AI code assistant for the terminal — with AI-powered versioning and release planning.

Part of the [UltraCode AI](https://github.com/AndreasSchwan-SIMO/UltraCode) monorepo.

## Installation

```bash
npm install -g ultracode-ai
# or run ad hoc
npx ultracode-ai
```

Requires Node.js `>=22.13.0`.

## Usage

```bash
ultracode-ai            # start the interactive assistant
ultracode-ai --help     # list commands and flags
```

The CLI bundles the agentic coding assistant (multiple LLM providers, a sandboxed
tool layer, persistent sessions) together with the UltraCode AI versioning subsystem:
it derives a SemVer bump from your Git diffs and commits, drafts a changelog and
checks the configured release quality gates.

## Packages

- [`ultracode-core`](https://www.npmjs.com/package/ultracode-core) — agents, tools, memory, context, providers, config and AI versioning.
- [`ultracode-shared`](https://www.npmjs.com/package/ultracode-shared) — shared types, contracts, errors and utilities.

## License

[MIT](./LICENSE) © UltraCode AI Team / SIMO GmbH
