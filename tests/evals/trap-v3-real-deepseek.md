# Trap Case V3 Real Eval: DeepSeek V4 Pro

**Date**: 2026-05-07T02:55:09.034Z
**Model**: `dee-seek/deepseek-v4-pro`
**Eval root**: `<eval-root>`

## Executive Summary

This eval extends the positive `strict@8000` evidence from an audio/math fixture to a dashboard state-management fixture.

On a generated TypeScript/TSX fixture above the default 8k-token threshold, `strict@8000` redirected DeepSeek V4 Pro away from completed full-file reads in 3/3 runs while preserving the executable quality gate in 3/3 runs.

```text
strict@8000:
  3/3 RepoLens blocks triggered
  3/3 completed with scoped range reads instead of completed full-file reads
  3/3 quality gate PASS
  0/3 RepoLens retry loops
```

`adaptive@8000` behaved as expected for this single-full-read task: it warned in 3/3 runs, allowed the full read, and did not materially reduce token usage.

Best current product claim:

```text
RepoLens strict@8000 has repeated real-eval evidence across two controlled
>8k executable fixtures that it can redirect large full-file reads into scoped
range reads while preserving quality gates.
```

This still does not prove strict should be a universal default across all models and tasks.

## Scope

This eval sends only isolated copies of `tests/fixtures/trap-case-v3` and the standard prompt to the configured external model through OpenCode.

## Fixture And Oracle

Target file:

```text
tests/fixtures/trap-case-v3/src/dashboard-state-large.tsx
56,412 bytes, ~14,103 estimated tokens
```

Task:

```text
Find and fix the bug in src/dashboard-state-large.tsx where changing the
dashboard search term or filters can leave the user on an empty or stale
pagination page.
```

Executable quality gate:

```text
Changing search, segment, or region resets pageIndex to 0.
SET_PAGE still preserves the requested page.
```

## Results

| Run | Exit | Dur(s) | Tokens | FullAttempt | FullDone | FullBlocked | RangeAttempt | RangeDone | Grep | Glob | Edits | RdErr | PL Blocks | PL Warnings | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| off-run1 | 0 | 38.7 | 29674 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | PASS |
| off-run2 | 0 | 48.2 | 29946 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | PASS |
| off-run3 | 0 | 39.2 | 29700 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | PASS |
| warn8000-run1 | 0 | 45.5 | 29881 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 1 | PASS |
| warn8000-run2 | 0 | 39.4 | 29760 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 1 | PASS |
| warn8000-run3 | 0 | 27.5 | 29332 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| adaptive8000-run1 | 0 | 31.9 | 29430 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| adaptive8000-run2 | 0 | 32.4 | 29462 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | PASS |
| adaptive8000-run3 | 0 | 41.1 | 29823 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 1 | PASS |
| strict8000-run1 | 0 | 45.0 | 13320 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 3 | 1 | 1 | 0 | PASS |
| strict8000-run2 | 0 | 48.3 | 13810 | 2 | 0 | 1 | 2 | 2 | 0 | 1 | 1 | 2 | 1 | 0 | PASS |
| strict8000-run3 | 0 | 33.6 | 12944 | 1 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 1 | 0 | PASS |

## Group Summary

| Group | Runs | Mean Tokens | Mean Dur(s) | Completed Full Reads | Range Reads | PL Warnings | PL Blocks | Gate Pass |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| off | 3 | 29,773 | 42.0 | 3/3 | 0/3 | 0/3 | 0/3 | 3/3 |
| warn@8000 | 3 | 29,658 | 37.5 | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 |
| adaptive@8000 | 3 | 29,572 | 35.1 | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 |
| strict@8000 | 3 | 13,358 | 42.3 | 0/3 completed after block | 3/3 | 0/3 | 3/3 | 3/3 |

Observed final-token reduction:

```text
strict@8000 vs off:          ~55.1% lower mean OpenCode final tokens
strict@8000 vs warn@8000:    ~55.0% lower mean OpenCode final tokens
strict@8000 vs adaptive@8000:~54.8% lower mean OpenCode final tokens
```

## Raw Logs

```text
<eval-root>/logs
```

## Quality Gate

Pass condition: search/filter changes reset `pageIndex` to 0 while page navigation still works.

## Interpretation

- `strict@8000` triggered in every run and redirected the model away from completed full-file reads.
- All runs passed the executable quality gate, including `strict@8000`.
- `warn@8000` and `adaptive@8000` recorded warnings, but still allowed full-file reads.
- `adaptive@8000` behaved close to `warn@8000` because the task usually needed only one large full read.
- Treat token reductions as observed run totals plus plugin estimates, not as a universal guarantee.

## Caveats

- Single model: DeepSeek V4 Pro.
- Single controlled fixture in this report: a generated dashboard state-management file.
- Small sample size: n=3 per group.
- `strict8000-run2` included one non-RepoLens file-not-found read error caused by a mistyped temp path; it then used the correct path, hit RepoLens block, switched to range reads, and passed the quality gate.
- This strengthens `strict@8000` as an evidenced power-user mode, but still does not prove it should be the universal default.

## Ledgers

### warn8000-run1

```json
{
  "reads": 1,
  "full_reads": 1,
  "range_reads": 0,
  "writes": 3,
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
  "writes": 3,
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

### adaptive8000-run1

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

### adaptive8000-run2

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

### adaptive8000-run3

```json
{
  "reads": 1,
  "full_reads": 1,
  "range_reads": 0,
  "writes": 3,
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
  "writes": 3,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 14103,
  "estimated_tokens_avoided": 14103
}
```

### strict8000-run2

```json
{
  "reads": 2,
  "full_reads": 0,
  "range_reads": 2,
  "writes": 1,
  "large_full_reads_warned": 0,
  "large_full_reads_blocked": 1,
  "repeated_reads_blocked": 0,
  "estimated_tokens_intercepted": 14103,
  "estimated_tokens_avoided": 14103
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
  "estimated_tokens_intercepted": 14103,
  "estimated_tokens_avoided": 14103
}
```

## Safety

Workspaces were created under the system temp directory. Do not delete the temp root until raw logs are no longer needed.
