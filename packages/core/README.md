# @ultracode/core

> UltraCode core: agents, tools, memory, context, execution, providers, config and AI versioning.

Part of the [UltraCode](https://github.com/AndreasSchwan-SIMO/UltraCode) monorepo.
This package contains the engine that powers the [`ultracode`](https://www.npmjs.com/package/ultracode)
CLI; most users should install the CLI instead of consuming this package directly.

## Installation

```bash
npm install @ultracode/core
```

Requires Node.js `>=22.13.0`. ESM only.

## Usage

```ts
import { /* agents, tools, versioning, ... */ } from "@ultracode/core";
```

The core exposes the agentic runtime (multi-provider LLM access, a sandboxed tool
layer, memory and context management) and the AI-powered versioning subsystem that
proposes SemVer bumps, drafts changelogs and evaluates release quality gates.

## License

[MIT](./LICENSE) © UltraCode Team / SIMO GmbH
