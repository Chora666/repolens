# RepoLens Eval Documents

This directory keeps trap-case eval plans and reports in a readable naming scheme.

All current trap fixtures are generated synthetic projects. Do not add private project source code, local absolute paths, raw model JSONL logs, or machine-specific temp directories to these reports.

## Current Evidence

| File | Purpose |
|---|---|
| `trap-v2-real-deepseek.md` | Current DeepSeek V4 Pro real eval for the >8k audio/math fixture |
| `trap-v3-real-deepseek.md` | Current DeepSeek V4 Pro real eval for the >8k dashboard/state fixture |
| `trap-v2-plan.md` | How to reproduce the v2 matrix |
| `trap-v3-plan.md` | How to reproduce the v3 matrix |

## Historical Reports

| File | Purpose |
|---|---|
| `trap-v1-design.md` | Original trap-case design notes |
| `trap-v1-sim-results.md` | Original simulator-style trap-case results |
| `trap-v1-real-deepseek-2026-05-06.md` | First DeepSeek real eval on the ambiguous v1 fixture |
| `trap-v1-multirun-deepseek-2026-05-06.md` | Multi-run v1 DeepSeek eval with quality-oracle caveat |
| `trap-v2-multirun-deepseek-2026-05-06.md` | Earlier v2 multi-run report kept for traceability |

## Naming

```text
trap-v<fixture>-plan.md
trap-v<fixture>-real-<model>.md
trap-v<fixture>-multirun-<model>-<date>.md
```
