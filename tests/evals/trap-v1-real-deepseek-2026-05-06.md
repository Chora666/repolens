# Trap-Case Real Eval: DeepSeek V4 Pro

**Date**: 2026-05-06  
**Model**: `dee-seek/deepseek-v4-pro`  
**OpenCode**: `1.14.30`  
**RepoLens version**: `@chora404/repolens@1.0.0` pre-release  
**Eval root**: `<eval-root>`  

## Scope And Consent

This eval intentionally sent the local trap-case fixture and prompt to the external DeepSeek V4 Pro service through OpenCode. The user explicitly approved sending this local workspace fixture code and prompt to the untrusted external model service for the off / warn / strict real eval matrix.

Data sent was limited to isolated copies of `tests/fixtures/trap-case` and the eval prompt. No other project source was used as a target workspace.

## Purpose

The goal was to move `large_file_policy: strict` beyond a single positive smoke test and check whether it creates repeatable evidence:

- Does strict block the first large full-file read?
- Does the model switch to grep/range reads after the block?
- Does task completion and fix quality remain at least as good as baseline?
- Does the default 8k threshold trigger on this trap-case?

## Fixture

Target file:

```text
src/audio-engine-full.ts
```

Size:

```text
18,475 bytes ~= 4,619 estimated tokens
```

Task:

```text
Find and fix the bug in src/audio-engine-full.ts where Oscillator.process()
may produce incorrect output for triangle waveform. Make the smallest safe
code change in that file, then briefly explain what you changed. No test run
is required; do not search dependency directories or test directories.
```

The fixture naturally tempts a full read because the bug is inside a medium-large source file with many classes. The 4,619-token size is above the eval threshold of 3,000, but below the product default threshold of 8,000.

## Matrix

| Run | RepoLens | Config | Purpose |
|---|---|---|---|
| `off-run2` | absent | n/a | Baseline behavior |
| `warn3000-run2` | installed | `large_file_policy=warn`, threshold `3000` | Check whether non-blocking warning changes behavior |
| `strict3000-run2` | installed | `large_file_policy=strict`, threshold `3000` | Check hard intervention on this fixture |
| `strict8000-run2` | installed | `large_file_policy=strict`, threshold `8000` | Check product-default threshold on this fixture |

There was also one prior pilot run, `strict3000-pilot`, with the same model and a less constrained prompt. It confirmed the strict block path and completed with a correct formula change, but the JSONL was not captured to disk because it was run as an interactive pilot.

## Commands

Each enabled run was initialized with:

```bash
node bin/cli.js init --dir <workspace> --force
```

Then the selected `.lens/config*.json` was copied to `.lens/config.json`.

The formal runs used:

```bash
opencode run \
  --dir <workspace> \
  --format json \
  --dangerously-skip-permissions \
  --model dee-seek/deepseek-v4-pro \
  'Find and fix the bug in src/audio-engine-full.ts where Oscillator.process() may produce incorrect output for triangle waveform. Make the smallest safe code change in that file, then briefly explain what you changed. No test run is required; do not search dependency directories or test directories.'
```

JSONL outputs:

```text
<eval-root>/off-run2.jsonl
<eval-root>/warn3000-run2.jsonl
<eval-root>/strict3000-run2.jsonl
<eval-root>/strict8000-run2.jsonl
```

## Results Summary

| Metric | off | warn@3000 | strict@3000 | strict@8000 |
|---|---:|---:|---:|---:|
| Duration | 420.9s | 763.9s | 423.5s | 904.9s |
| JSON events | 10 | 9 | 22 | 10 |
| OpenCode final tokens | 31,125 | 48,430 | 27,741 | 48,142 |
| Tool calls | 2 | 2 | 7 | 2 |
| Completed full reads | 1 | 1 | 0 | 1 |
| Completed range reads | 0 | 0 | 2 | 0 |
| Read errors / blocks | 0 | 0 | 1 | 0 |
| Grep calls | 0 | 0 | 3 | 0 |
| Edits | 1 | 1 | 1 | 1 |
| RepoLens large warnings | n/a | 1 | 0 | 0 |
| RepoLens large blocks | n/a | 0 | 1 | 0 |
| Quality gate | pass | pass | fail | fail |

## RepoLens Ledger

`warn@3000`:

```json
{
  "tokens_estimated": 9206,
  "reads": 1,
  "writes": 1,
  "full_reads": 1,
  "range_reads": 0,
  "large_full_reads_warned": 1,
  "large_full_reads_blocked": 0,
  "estimated_tokens_avoided": 0
}
```

`strict@3000`:

```json
{
  "tokens_estimated": 4587,
  "reads": 2,
  "writes": 1,
  "full_reads": 0,
  "range_reads": 2,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "estimated_tokens_intercepted": 4619,
  "estimated_tokens_avoided": 4619
}
```

`strict@8000`:

```json
{
  "tokens_estimated": 9206,
  "reads": 1,
  "writes": 1,
  "full_reads": 1,
  "range_reads": 0,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 0,
  "estimated_tokens_avoided": 0
}
```

## Behavior Detail

### off

Tool sequence:

```text
read full src/audio-engine-full.ts
edit src/audio-engine-full.ts
```

The model read the whole file once and changed the triangle calculation to:

```ts
sample = (2 / Math.PI) * Math.asin(Math.sin(this.phase))
```

Quality assessment: **pass**. The fix is a plausible standard triangle-wave formula and directly changes the calculation.

### warn@3000

OpenCode stderr showed the RepoLens warning:

```text
[RepoLens] Large file read: src/audio-engine-full.ts (~4619 tok, threshold 3000).
...
Full-file reads of large files can be expensive. Use a range read unless the whole file is genuinely needed.
```

Tool sequence:

```text
read full src/audio-engine-full.ts
edit src/audio-engine-full.ts
```

The model still performed the full read. It changed the formula to:

```ts
sample = 1 - 2 * Math.abs(sawValue)
```

Quality assessment: **pass**. The run supports the earlier finding that `console.warn` alone does not materially change model behavior in this setup.

### strict@3000

Tool sequence:

```text
read full src/audio-engine-full.ts -> blocked by RepoLens
grep triangle
grep class Oscillator
grep process(
read range src/audio-engine-full.ts offset=37 limit=110
read range src/audio-engine.ts offset=1 limit=100
edit src/audio-engine-full.ts
```

RepoLens event:

```json
{
  "tool": "read",
  "file": "src/audio-engine-full.ts",
  "read_kind": "full",
  "outcome": "blocked",
  "reason": "large_file",
  "tokens_estimated": 4619
}
```

This run did prove the behavioral intervention: the model switched from full read to grep plus range reads, and no retry loop occurred.

However, the edit only removed the stale bug comments and left the formula unchanged:

```diff
-          // BUG: This calculation is incorrect for triangle wave
-          // Properly it should use absolute value of sawtooth
           const sawValue = 2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1
           sample = Math.abs(sawValue) * 2 - 1
```

Final model explanation:

```text
The actual triangle formula at line 102 is mathematically correct...
The comment was a leftover...
```

Quality assessment: **fail** for the fixture intent. The task asked for a calculation bug fix, and this run did not change the calculation.

### strict@8000

Tool sequence:

```text
read full src/audio-engine-full.ts
edit src/audio-engine-full.ts
```

Because the file is about 4,619 estimated tokens, the default 8,000-token threshold did not trigger. The run behaved like baseline from a read-policy perspective.

The edit also only removed the bug comments and left the formula unchanged:

```diff
-          // BUG: This calculation is incorrect for triangle wave
-          // Properly it should use absolute value of sawtooth
           const sawValue = 2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1
           sample = Math.abs(sawValue) * 2 - 1
```

Quality assessment: **fail** for the fixture intent.

## Pilot Observation

Before the formal matrix, a `strict@3000` pilot was run without redirecting JSONL to disk. It showed the same key intervention path:

```text
read full src/audio-engine-full.ts -> blocked
grep triangle
grep class Oscillator
grep process(
read range around triangle case
edit src/audio-engine-full.ts
read range to verify
```

The pilot produced a correct formula change:

```ts
sample = 1 - 2 * Math.abs(sawValue)
```

It also exposed an eval hygiene issue: OpenCode installed `.opencode/node_modules` into the fixture, and the model searched dependency test files with broad glob patterns. The formal prompt was tightened to discourage dependency/test searches.

## Interpretation

### What Is Proven

`strict@3000` reliably changes read behavior for this trap-case. Across the pilot and formal run, the first full read of `audio-engine-full.ts` was blocked, and the model responded by using grep/range reads instead of retrying the same full read.

`warn@3000` does not provide comparable behavioral force. The warning was emitted, but the model still completed a full-file read.

RepoLens ledger telemetry is useful for auditing this: full reads, range reads, large-file blocks, and estimated intercepted tokens were all captured in `token-ledger.json`.

### What Is Not Proven

This eval does **not** prove that `strict` should be the product default at `8000` tokens.

The trap file is about 4,619 tokens, so `strict@8000` does not trigger. The default threshold therefore received no positive trigger evidence from this fixture.

This eval also does **not** prove quality non-regression. The formal `strict@3000` run had lower OpenCode final tokens and avoided the full read, but it failed the quality gate by treating the bug as only a stale comment.

### Quality Tradeoff

The central tradeoff is now visible:

```text
strict@3000:
  + avoided the large full read
  + forced grep/range behavior
  + reduced OpenCode final tokens vs warn/default-threshold runs
  - failed the intended bug-fix quality gate in the formal run
```

This means the evidence supports strict as a powerful intervention mechanism, but not yet as a universally safe default.

## Recommendations

1. Keep `large_file_policy: strict` behind a conservative threshold for beta, but do not claim it is proven as a default from this eval alone.

2. Build a second trap fixture above the default threshold, ideally 10k-15k estimated tokens, so `strict@8000` can be tested without lowering the threshold.

3. Repeat the matrix at least 3 times per condition and score medians:

```text
off x3
warn@3000 x3
strict@3000 x3
strict@8000 x3 on a >8k fixture
```

4. Add a quality gate script for the fixture. For this task, a pass should require that the triangle case calculation changes, not only that the comment disappears.

5. Update eval hygiene so `.opencode/node_modules` cannot pollute model search behavior. Options:

```text
- Add .opencode to trap fixture ignore rules.
- Add prompt guardrails against dependency/test directories.
- Use a fixture copied after OpenCode dependency install, then delete .opencode/node_modules before each run.
```

6. Treat ledger `estimated_tokens_avoided` as a plugin-side estimate, not a final savings claim. OpenCode final token totals varied widely due to model reasoning and exploration.

## Verdict

The real eval upgrades the evidence from "one positive smoke" to "repeatable behavioral intervention": strict mode can block the first large full read and redirect DeepSeek V4 Pro toward grep/range reads.

It does **not** yet justify a strong product claim that strict default is safe and beneficial. The formal strict run failed the quality gate, and the default 8k threshold did not trigger on this fixture.

Best current wording:

```text
RepoLens strict large-file guard has real OpenCode evidence that it can
redirect a model from full-file reads to grep/range reads. More repeated evals
on >8k fixtures are needed before claiming strict default improves real task
outcomes without quality loss.
```

