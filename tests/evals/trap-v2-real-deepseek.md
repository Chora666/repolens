# Trap Case V2 Real Eval: DeepSeek V4 Pro

**Date**: 2026-05-07T02:11:57.484Z
**Model**: `dee-seek/deepseek-v4-pro`
**Eval root**: `<eval-root>`

## Executive Summary

This eval is the first clean positive result for RepoLens' default large-file threshold.

On a generated TypeScript fixture above the default 8k-token threshold, `strict@8000` redirected DeepSeek V4 Pro away from completed full-file reads in 3/3 runs while preserving the executable quality gate in 3/3 runs.

```text
strict@8000:
  3/3 RepoLens blocks triggered
  3/3 completed with scoped range reads instead of completed full-file reads
  3/3 quality gate PASS
  0/3 retry loops
```

`warn@8000` recorded warnings in 3/3 runs but still allowed full-file reads in 3/3 runs.

Best current product claim:

```text
RepoLens has repeated real-eval evidence that strict@8000 can redirect
large full-file reads into scoped range reads while preserving quality on a
controlled >8k executable fixture.
```

This does not prove strict should be a universal default across all models and tasks.

## Scope

This eval sends only isolated copies of `tests/fixtures/trap-case-v2` and the standard prompt to the configured external model through OpenCode.

## Fixture And Oracle

Target file:

```text
tests/fixtures/trap-case-v2/src/audio-engine-large.ts
52,186 bytes, ~13,047 estimated tokens
```

Task:

```text
Find and fix the bug in src/audio-engine-large.ts where Oscillator.process()
produces incorrect output for triangle waveform.
```

Executable quality gate:

```text
Oscillator(1 Hz), triangle waveform, gain 1, sampleRate 4
must produce: 0, 1, 0, -1, 0
```

## Results

| Run | Exit | Dur(s) | Tokens | FullAttempt | FullDone | FullBlocked | RangeAttempt | RangeDone | Grep | Glob | Edits | RdErr | PL Blocks | PL Warnings | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| off-run1 | 0 | 205.5 | 36600 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | PASS |
| off-run2 | 0 | 109.8 | 33923 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | PASS |
| off-run3 | 0 | 162.6 | 35353 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | PASS |
| warn8000-run1 | 0 | 154.9 | 34943 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| warn8000-run2 | 0 | 144.1 | 34651 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| warn8000-run3 | 0 | 151.4 | 34930 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| strict8000-run1 | 0 | 180.2 | 18477 | 1 | 0 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 0 | PASS |
| strict8000-run2 | 0 | 326.1 | 22968 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 0 | PASS |
| strict8000-run3 | 0 | 190.3 | 18374 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 0 | PASS |

## Group Summary

| Group | Runs | Mean Tokens | Mean Dur(s) | Completed Full Reads | Range Reads | PL Warnings | PL Blocks | Gate Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| off | 3 | 35,292 | 159.3 | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| warn@8000 | 3 | 34,841 | 150.1 | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 |
| strict@8000 | 3 | 19,940 | 232.2 | 0/3 completed after block | 3/3 | 0/3 | 3/3 | 3/3 |

Observed final-token reduction:

```text
strict@8000 vs off:       ~43.5% lower mean OpenCode final tokens
strict@8000 vs warn@8000: ~42.8% lower mean OpenCode final tokens
```

## Raw Logs

```text
<eval-root>/logs
```

## Quality Gate

Pass condition: `Oscillator(1 Hz), triangle, gain 1, sampleRate 4` produces `0, 1, 0, -1, 0`.

## Interpretation

- `strict@8000` triggered in every run and redirected the model from a completed full-file read to one range read.
- All runs passed the executable quality gate, including `strict@8000`.
- `warn@8000` recorded warnings, but still allowed full-file reads.
- Treat token reductions as observed run totals plus plugin estimates, not as a universal guarantee.

## Caveats

- Single model: DeepSeek V4 Pro.
- Single controlled fixture: a generated TypeScript audio engine file.
- Small sample size: n=3 per group.
- The fixture has an explicit oracle near the bug, so it may be easier than arbitrary large-file debugging.
- This supports `strict@8000` as an evidenced power-user mode, not as a universal default claim.

## Ledgers

### warn8000-run1

```json
{
  "reads": 1,
  "full_reads": 1,
  "range_reads": 0,
  "writes": 1,
  "large_full_reads_warned": 1,
  "large_full_reads_blocked": 0,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 0,
  "estimated_tokens_avoided": 0
}
```

### warn8000-run2

```json
{
  "reads": 1,
  "full_reads": 1,
  "range_reads": 0,
  "writes": 1,
  "large_full_reads_warned": 1,
  "large_full_reads_blocked": 0,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 0,
  "estimated_tokens_avoided": 0
}
```

### warn8000-run3

```json
{
  "reads": 1,
  "full_reads": 1,
  "range_reads": 0,
  "writes": 1,
  "large_full_reads_warned": 1,
  "large_full_reads_blocked": 0,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 0,
  "estimated_tokens_avoided": 0
}
```

### strict8000-run1

```json
{
  "reads": 1,
  "full_reads": 0,
  "range_reads": 1,
  "writes": 1,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 13047,
  "estimated_tokens_avoided": 13047
}
```

### strict8000-run2

```json
{
  "reads": 1,
  "full_reads": 0,
  "range_reads": 1,
  "writes": 1,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 13047,
  "estimated_tokens_avoided": 13047
}
```

### strict8000-run3

```json
{
  "reads": 1,
  "full_reads": 0,
  "range_reads": 1,
  "writes": 1,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 13047,
  "estimated_tokens_avoided": 13047
}
```

## Safety

Workspaces were created under the system temp directory. Do not delete the temp root until raw logs are no longer needed.
