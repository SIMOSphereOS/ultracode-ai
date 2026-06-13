# ultracode-shared

> Shared types, contracts, errors and utilities for UltraCode AI.

Part of the [UltraCode AI](https://github.com/AndreasSchwan-SIMO/UltraCode) monorepo.
This is an internal foundation package consumed by
[`ultracode-core`](https://www.npmjs.com/package/ultracode-core) and the
[`ultracode`](https://www.npmjs.com/package/ultracode) CLI.

## Installation

```bash
npm install ultracode-shared
```

Requires Node.js `>=22.13.0`. ESM only.

## Usage

```ts
import { /* types, contracts, error classes, utilities */ } from "ultracode-shared";
```

Provides the cross-package type definitions, interface contracts, the typed error
model (e.g. `VersioningError`, `ProviderError`, `SessionError`, `ToolError`) and
small shared utilities used throughout UltraCode AI.

## License

[MIT](./LICENSE) © UltraCode AI Team / SIMO GmbH
