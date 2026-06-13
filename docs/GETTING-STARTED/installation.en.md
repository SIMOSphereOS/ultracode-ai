# UltraCode AI — Installation (English)

> 🇩🇪 Deutsche Version: [`installation.md`](./installation.md)

UltraCode AI is an agentic AI coding assistant for the terminal with AI-powered
versioning. This guide covers **installation via npm** (recommended) and **from source**,
including configuration, verification and your first run.

---

## 1. System requirements

| Component | Requirement | Check |
|---|---|---|
| **Node.js** | **≥ 22.13** (every package declares `engines.node` `>=22.13.0`; `node:sqlite` needs 22.5+) | `node --version` |
| **npm** | for the global install (ships with Node) | `npm --version` |
| **pnpm** | source install only: `pnpm@11.5.2` | `pnpm --version` |
| **Git** | 2.30+ for the AI-versioning features (otherwise optional) | `git --version` |
| **OS** | Linux, macOS 12+, Windows 10+ (x64/ARM64) | — |

UltraCode AI is a pure TypeScript ESM project with no native dependencies and runs
cross-platform. CI verifies Linux, macOS and Windows on Node 22 and 24.

---

## 2. Install via npm (recommended)

```bash
# Install globally — provides the `ultracode-ai` command
npm install -g ultracode-ai

# Or run directly without a global install
npx ultracode-ai --help
```

The packages are public on npm:

| Package | Purpose |
|---|---|
| [`ultracode-ai`](https://www.npmjs.com/package/ultracode-ai) | CLI (installs the `ultracode-ai` command) |
| [`ultracode-core`](https://www.npmjs.com/package/ultracode-core) | Core library (agents, tools, versioning) |
| [`ultracode-shared`](https://www.npmjs.com/package/ultracode-shared) | Shared types & contracts |

`ultracode-core` and `ultracode-shared` are installed automatically as dependencies.

---

## 3. Install from source

For contributing or the latest `main`:

```bash
# Clone the repository (the clone directory is named ultracode-ai)
git clone https://github.com/AndreasSchwan-SIMO/ultracode-ai.git
cd ultracode-ai

# Install dependencies
pnpm install

# Build all three packages (tsc -b: shared → core → cli)
pnpm build
```

Then run the CLI from the built bundle:

```bash
node packages/cli/dist/index.js --help
```

After `pnpm install` the `ultracode-ai` bin is also linked inside the workspace. Throughout
the docs, `ultracode-ai` stands in for `node packages/cli/dist/index.js`.

---

## 4. Configuration

### 4a. Setup wizard (easiest)

```bash
ultracode-ai setup
```

The wizard asks for a provider, an API key (masked input) and a default agent, then writes
the key to `~/.ultracode/.env` (file mode `0600`; keys must **never** go into `config.toml`).

### 4b. Manually via environment variables

Set the API key for your provider:

```bash
export OPENAI_API_KEY="sk-..."                   # OpenAI
export ANTHROPIC_API_KEY="sk-ant-..."            # Anthropic
export MISTRAL_API_KEY="..."                     # Mistral
export OLLAMA_BASE_URL="http://localhost:11434"  # Ollama (local, no key)
```

Optional overrides (excerpt): `ULTRACODE_MODEL`, `ULTRACODE_CORE__MAX_TOKENS`,
`ULTRACODE_CORE__TEMPERATURE`, `ULTRACODE_DEBUG=1`. Persistent settings live in
`~/.ultracode/config.toml` — see [`configuration.md`](./configuration.md).

---

## 5. Verify the installation

```bash
ultracode-ai --version     # prints the installed version (e.g. 1.3.1)
ultracode-ai doctor        # checks Node version, config, provider reachability
```

`doctor` enforces Node ≥ 22.13 and reports missing API keys or configuration problems with
a non-zero exit code.

---

## 6. First run

```bash
# Interactive (TTY): launches the terminal UI
ultracode-ai

# Non-interactive: a single prompt, result is streamed
ultracode-ai run -p "Explain the architecture of this repo"

# Machine-readable: full result as JSON
ultracode-ai run -p "..." --json

# AI-powered version suggestion from your git commits
ultracode-ai version analyze "v1.3.0..HEAD"
```

More commands: `config`, `tools`, `agents`, `release`, `quality`, `budget`, `skills`,
`learn`. Run `ultracode-ai <command> --help` for each command's options.

---

## 7. Update & uninstall

```bash
# Update
npm update -g ultracode-ai

# Uninstall
npm uninstall -g ultracode-ai
# Optionally remove local configuration
rm -rf ~/.ultracode
```

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `Unsupported engine` / Node too old | Update Node to **≥ 22.13** (`node --version`). |
| `command not found: ultracode-ai` | Check the global npm bin path (`npm bin -g`) or use `npx ultracode-ai`. |
| No output / "no API key" | Run `ultracode-ai setup` or export `*_API_KEY`; verify with `ultracode-ai doctor`. |
| `SQLITE` notice on start | Informational — `node:sqlite` is experimental; the warning is suppressed internally. |
| Source build fails | Check `pnpm --version` (`11.5.2`?) and the Node version, then `pnpm install && pnpm build`. |

For bugs: [Issues](https://github.com/AndreasSchwan-SIMO/ultracode-ai/issues).

---

**Next steps:** [Quick Start](./quick-start.md) · [Configuration](./configuration.md)
