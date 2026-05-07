# RepoLens

> **Beta Release.** RepoLens is functional and tested (32 unit + 9 integration scenarios), with real OpenCode CLI/Desktop smoke tests and DeepSeek V4 Pro trap-case evals for the large-file read-interception path. Token numbers are estimates and eval-scoped observations; use with awareness of the [limitations](#limitations) below. Dogfooding welcomed.

**Repo-aware context plugin for OpenCode.**  
Repeat-read interception, file index, token tracking, and learning memory — zero workflow changes.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What Is RepoLens

OpenCode is powerful but it works blind. It doesn't know what a file contains until it opens it. It can't tell a 50-token config from a 2,000-token module. It reads the same file multiple times in one session without noticing. It has no index of your project, no memory of your corrections, and no awareness of what it already tried.

RepoLens gives OpenCode a second brain: a file index so it knows what files contain before reading them, a learning memory file for your preferences and past mistakes, and a token ledger for session bookkeeping. Runtime hooks surface this context during reads and writes.

## Token Savings

RepoLens intercepts repeat reads and surfaces project knowledge before writes, helping OpenCode make smarter context decisions.

In simulated testing (9 scenarios, 69 tool calls), RepoLens intercepted 30 tool calls: 26 repeat reads and 4 Cerebrum write warnings. Estimated savings were 49% optimistic or 39% conservative while respecting range reads, cerebrum rules, and mode configuration. See [TEST_REPORT.md](https://github.com/Chora666/repolens/blob/main/tests/TEST_REPORT.md) for full details.

Real OpenCode smoke tests on 2026-05-06 confirmed the main runtime behavior in CLI and Desktop: first full-file read succeeds, duplicate full-file read is blocked, offset/limit range read succeeds, and the token ledger is updated. See [REAL_OPENCODE_SMOKE.md](https://github.com/Chora666/repolens/blob/main/tests/REAL_OPENCODE_SMOKE.md).

Real DeepSeek V4 Pro evals on two controlled >8k-token executable fixtures showed `strict@8000` redirecting large full-file reads to scoped range reads while preserving quality gates:

- [trap-v2-real-deepseek.md](https://github.com/Chora666/repolens/blob/main/tests/evals/trap-v2-real-deepseek.md): audio/math fixture, `strict@8000` passed 3/3 with ~43% lower mean final tokens.
- [trap-v3-real-deepseek.md](https://github.com/Chora666/repolens/blob/main/tests/evals/trap-v3-real-deepseek.md): dashboard/state fixture, `strict@8000` passed 3/3 with ~55% lower mean final tokens.

Eval fixtures are generated synthetic code. The repository and npm package do not include private project source code or machine-local eval logs.

Recommended positioning: default behavior stays conservative (`large_file_policy: "warn"`), while `strict@8000` is available for power users who want stronger large-file intervention.

## Quick Start

```bash
npx @chora404/repolens init
```

That's it. Restart OpenCode. RepoLens is watching.

This installs RepoLens as a local OpenCode plugin and creates the `.lens/`
templates plus `REPOLENS.md`.

### Direct npm Plugin

RepoLens can also be loaded directly by OpenCode from npm:

```json
{
  "plugin": ["@chora404/repolens"]
}
```

Direct npm loading uses the compiled `dist/plugin.js` package entry. It enables
the runtime hooks, but it does not copy `REPOLENS.md` or starter `.lens/`
templates into your project. Use `npx @chora404/repolens init` if you want the
full local knowledge base files.

### CLI Flags

```bash
repolens init              # Initialize (skip existing files)
repolens init --force      # Overwrite existing files
repolens init --dry-run    # Preview what would be written
repolens init --dir <path> # Initialize in a specific directory
```

### Manual Install

```bash
git clone https://github.com/Chora666/repolens cli
mkdir -p your-project/.opencode/plugins your-project/.lens
cp cli/src/plugin.ts your-project/.opencode/plugins/repolens.ts
cp cli/templates/REPOLENS.md your-project/
cp cli/templates/config.json your-project/.lens/
cp cli/templates/cerebrum.md your-project/.lens/
cp cli/templates/buglog.json your-project/.lens/
cp cli/templates/memory.md your-project/.lens/
cp cli/templates/token-ledger.json your-project/.lens/
```

## What It Creates

`repolens init` creates a `.lens/` directory in your project:

| File | Purpose | Maintained |
|------|---------|:---:|
| `anatomy.md` | Project file map with descriptions and token estimates | Auto |
| `cerebrum.md` | Learned preferences, corrections, Do-Not-Repeat list | Manual |
| `memory.md` | Chronological action log with token estimates | Auto |
| `buglog.json` | Searchable bug fix notes for the AI to consult | Manual |
| `token-ledger.json` | Lifetime token tracking and session history | Auto |
| `session-briefing.md` | Previous session summary, recent commits, edit hotspots | Auto |
| `config.json` | Configuration (mode, enabled, ignore rules) | Manual |

And `REPOLENS.md` in your project root — the instructions OpenCode follows every session.

## Configuration

Edit `.lens/config.json` to customize behavior:

```json
{
  "enabled": true,
  "mode": "adaptive",
  "adaptive_threshold": 500,
  "large_file_policy": "warn",
  "large_file_threshold_tokens": 8000,
  "large_file_allow_globs": [],
  ...
}
```

RepoLens reloads this file when its modification time changes, so switching
between `strict`, `warn`, and `adaptive` can take effect during a running
OpenCode session.

### Mode

| Mode | Read Interception | Cerebrum Warnings |
|------|:---:|:---:|
| `adaptive` (default) | Blocks repeated full-file reads only for files ≥ `adaptive_threshold` tokens (default 500) | Same as `strict` |
| `strict` | `throw Error` — blocks repeated full-file reads | `throw Error` — blocks writes matching known mistakes |
| `warn` | `console.warn` — notifies but never blocks | `console.warn` — notifies but never blocks |

### Large File Policy

`large_file_policy` controls first full-file reads above
`large_file_threshold_tokens`:

| Policy | Behavior |
|--------|:---:|
| `off` | No large-file warning or block |
| `warn` (default) | Warn once per file, then allow the read |
| `adaptive` | Warn on the first large full read, block the next large full read of the same file, then allow one exact retry |
| `strict` | Block the first full read, then allow one exact retry |

Use `large_file_allow_globs` for generated files or project-local exceptions
that are safe to read in full.

Strict and adaptive blocking are quality-first guardrails: if grep/range context
is not enough to verify the requested change, the model should retry the full
read rather than make a lower-confidence edit just to save tokens.

### Enabled

Set `"enabled": false` to disable all RepoLens hooks without removing files.

## How It Works

### Repeat-Read Interception

The plugin intercepts file reads and prevents unnecessary re-reading.

| Read attempt | Behavior |
|:---:|---|
| **1st read** | File reads normally. Plugin extracts key sections (functions, classes, exports) and caches them in memory. |
| **2nd read** | If the read has no `offset`/`limit`, plugin throws an error visible to the AI: _"You read this file 3 min ago (~1200 tok). Key sections: authenticate() at L42..."_ |
| **Subsequent** | Full-file reads (no offset/limit) continue to be blocked. Range-based reads with offset/limit are always allowed. |

The interception error message includes token estimates from the anatomy index, elapsed time since the first read, and extracted key sections (TS, JS, Python, Go, Rust) so the AI can make an informed decision.

When a file is written or edited, the plugin clears its read history — the file has changed, so stale section data is discarded.

### Write Protection

Before OpenCode writes or edits a file, the plugin checks `.lens/cerebrum.md` for known mistake patterns. If a match is found and this file hasn't been warned about yet this session, it throws an error with the relevant historical note. The write proceeds on the next attempt. This surfaces past mistakes directly at the point of editing.

### Automatic Bookkeeping

After reads and file modifications (`write`, `edit`, `apply_patch`), the plugin updates the token ledger and project file map.

```
You type a message
    ↓
OpenCode decides to read src/auth.ts
    ↓
RepoLens: large first read? → warn or block with grep/range guidance
RepoLens: repeat full-file read? → YES → throw Error with key sections + guidance
OpenCode sees the error, uses grep or offset instead       ↑
    ↓                          OR: range read / not blocked |
OpenCode reads the file                                    |
    ↓                                                      |
RepoLens (1st read): extracts sections, caches          |
RepoLens (every read): logs token estimate              |
    ↓                                                      |
OpenCode decides to write/edit/patch src/auth.ts           |
    ↓                                                      |
RepoLens: checks cerebrum.md — match found?             |
    → YES: throw Error with historical note               |
    → file now marked as warned, retry will bypass         |
    ↓                                                      |
OpenCode writes code                                       |
    ↓                                                      |
RepoLens: clears read history for edited file           |
RepoLens: updates anatomy.md, appends memory            |
    ↓
OpenCode finishes
    ↓
RepoLens: writes session report to token ledger
```

## Installation

### npm (recommended)

```bash
npx @chora404/repolens init
```

### Direct OpenCode npm plugin

```json
{
  "plugin": ["@chora404/repolens"]
}
```

This loads the plugin directly from npm. For the full `.lens/` starter files and
`REPOLENS.md`, use the `npx init` installer above.

### Git Clone

```bash
git clone https://github.com/Chora666/repolens cli
cd your-project
mkdir -p .opencode/plugins .lens
cp ../cli/src/plugin.ts .opencode/plugins/repolens.ts
cp ../cli/templates/REPOLENS.md .
cp ../cli/templates/config.json .lens/
cp ../cli/templates/cerebrum.md .lens/
cp ../cli/templates/buglog.json .lens/
cp ../cli/templates/memory.md .lens/
cp ../cli/templates/token-ledger.json .lens/
```

## Uninstall

```bash
rm -rf .lens/ REPOLENS.md .opencode/plugins/repolens.ts
```

See [UNINSTALL.md](https://github.com/Chora666/repolens/blob/main/UNINSTALL.md) for step-by-step instructions.

## Limitations

RepoLens is built for OpenCode's plugin API. Key points to be aware of:

- **Savings quantification is mixed.** Simulator tests cover plugin counters, and real OpenCode trap-case evals show strict can redirect large full-file reads to grep/range reads. The project does not yet claim strict defaults improve task quality.
- **Token tracking is estimation.** Tokens are approximated by `file_size / 4`, not a real tokenizer. Use as a trend indicator, not a precise cost metric.
- **File writes are not atomic.** `token-ledger.json`, `anatomy.md`, and `memory.md` could be corrupted if the process terminates mid-write.
- **Config validation is limited.** `mode`, `large_file_policy`, `token_estimation_ratio`, and large-file fields are checked, but ignore patterns are trusted.
- **Repeat-read interception can use `throw Error`** to surface warnings directly to the AI. In default adaptive mode, small repeated full-file reads warn while larger repeated full-file reads block; range reads pass through.
- **Cerebrum warnings use `throw Error`** to show historical mistakes before writes. Each file is warned once per session.
- **`cerebrum.md` depends on the AI following `REPOLENS.md` instructions.** Compliance is not guaranteed.
- **Section extraction is regex-based** (TS, JS, Python, Go, Rust). Detects declarations, classes, and types but does not parse ASTs.

## Inspiration

RepoLens draws conceptual inspiration from [OpenWolf](https://github.com/cytostack/openwolf) — the idea of a project file map, learning memory, and token ledger as a "second brain" for AI coding tools. RepoLens is built from scratch for OpenCode's plugin API, not a fork or derivative.

## License

MIT — see [LICENSE](https://github.com/Chora666/repolens/blob/main/LICENSE).

## AI Assistance

This project was built with assistance from GPT-5.5 and DeepSeek V4 Pro.

## Author

Chora404
