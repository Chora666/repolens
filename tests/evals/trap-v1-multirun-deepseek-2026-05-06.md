# RepoLens Trap-Case Multi-Run Real Eval: DeepSeek V4 Pro

**Date**: 2026-05-06  
**Model**: `dee-seek/deepseek-v4-pro`  
**OpenCode**: `1.14.33`  
**RepoLens**: `@chora404/repolens@1.0.0` pre-release  
**Eval root**: `<eval-root>/`  

---

## Scope and Data Disclosure

This eval intentionally sent the local trap-case fixture code and the standardized eval prompt to the external DeepSeek V4 Pro service through OpenCode. The user explicitly approved sending this isolated fixture code and prompt to the untrusted external model service for the off / warn@3000 / strict@3000 / strict@8000 real eval matrix.

**Data sent was limited to** isolated copies of `tests/fixtures/trap-case/` copied into `<tmp-root>/`. No other RepoLens source, no other project files on the user's machine were transmitted.

---

## Safety Boundary

| Constraint | Status |
|---|---|
| No model execution inside `<project-root>` | OK |
| No modification to original project files | OK |
| All workspaces in `<tmp-root>/repolens-trap-multirun-<ts>/` | OK |
| Each run has independent workspace (off-run1, warn3000-run1, etc.) | OK |
| Only fixture files copied, not entire RepoLens | OK |
| No deletion/move/overwrite of non-eval files | OK |
| Only this report written to original project (`tests/`) | OK |
| No git commit, no publish, no npm install to original project | OK |

---

## Fixture

| Property | Value |
|---|---|
| Target file | `src/audio-engine-full.ts` |
| Size | 18,475 bytes |
| Estimated tokens | ~4,619 (ratio=4) |
| Lines | 699 |
| Bug location | `Oscillator.process()` triangle branch, lines 98-103 |
| Companion file | `src/audio-engine.ts` (322 lines, same bug for reference) |

### Original triangle branch (lines 98-103)

```typescript
case "triangle":
  // BUG: This calculation is incorrect for triangle wave
  // Properly it should use absolute value of sawtooth
  const sawValue = 2 * ((this.phase % (2 * Math.PI)) / (2 * Math.PI)) - 1
  sample = Math.abs(sawValue) * 2 - 1
  break
```

**Note**: The formula `Math.abs(sawValue) * 2 - 1` is mathematically correct for generating a triangle wave from a sawtooth. The "BUG" comment is a deliberate red herring — the trap tests whether the model makes a meaningful code change or just removes the misleading comments.

---

## Unified Prompt

```
Find and fix the bug in src/audio-engine-full.ts where Oscillator.process()
may produce incorrect output for triangle waveform. Make the smallest safe
code change in that file, then briefly explain what you changed. No test run
is required; do not search dependency directories or test directories.
```

---

## Matrix

| Group | RepoLens | `large_file_policy` | `threshold_tokens` | Runs | Expected behavior |
|---|---|---|---|---|---|
| off | disabled | — | — | x2 | Baseline, full reads |
| warn@3000 | enabled | `warn` | 3000 | x2 | Warning emitted, read allowed |
| strict@3000 | enabled | `strict` | 3000 | x3 | Block on first full read, grep/range redirect |
| strict@8000 | enabled | `strict` | 8000 | x3 | No trigger (fixture < 8k) |

**Gap noted**: off and warn@3000 groups only have 2 runs each (budget constraint). strict groups have 3 runs each for stronger statistical evidence on the primary intervention.

---

## Raw Log Paths

```
<eval-root>/logs/
├── off-run1.jsonl           off-run1.stderr
├── off-run2.jsonl           off-run2.stderr
├── warn3000-run1.jsonl      warn3000-run1.stderr
├── warn3000-run2.jsonl      warn3000-run2.stderr
├── strict3000-run1.jsonl    strict3000-run1.stderr
├── strict3000-run2.jsonl    strict3000-run2.stderr
├── strict3000-run3.jsonl    strict3000-run3.stderr
├── strict8000-run1.jsonl    strict8000-run1.stderr
├── strict8000-run2.jsonl    strict8000-run2.stderr
└── strict8000-run3.jsonl    strict8000-run3.stderr
```

Workspaces:
```
<eval-root>/workspaces/
├── off-run1/   off-run2/
├── warn3000-run1/   warn3000-run2/
├── strict3000-run1/   strict3000-run2/   strict3000-run3/
└── strict8000-run1/   strict8000-run2/   strict8000-run3/
```

---

## Per-Run Results

### Tool Behavior Summary

| Run | Dur(s) | Events | Tokens | FullRd | RngeRd | Grep | Glob | Edit | RdErr |
|---|---|---|---|---|---|---|---|---|---|
| off-run1 | 790.8 | 13 | 44,008 | 1 | 0 | 0 | 0 | 2 | 0 |
| off-run2 | 346.5 | 10 | 29,039 | 1 | 0 | 0 | 0 | 1 | 0 |
| warn3000-run1 | 723.3 | 14 | 42,320 | 1 | 1 | 0 | 0 | 1 | 0 |
| warn3000-run2 | 576.3 | 17 | 37,091 | 1 | 1 | 0 | 1 | 1 | 0 |
| strict3000-run1 | 569.7 | 27 | 32,837 | 1 | 3 | 2 | 1 | 1 | **1** |
| strict3000-run2 | 317.3 | 24 | 23,410 | 1 | 3 | 2 | 0 | 1 | **1** |
| strict3000-run3 | 405.2 | 26 | 27,125 | 1 | 4 | 2 | 0 | 1 | **1** |
| strict8000-run1 | 652.6 | 14 | 40,484 | 1 | 1 | 0 | 0 | 1 | 0 |
| strict8000-run2 | 590.8 | 10 | 37,817 | 1 | 0 | 0 | 0 | 1 | 0 |
| strict8000-run3 | 595.9 | 13 | 42,414 | 1 | 0 | 0 | 1 | 1 | 0 |

> **FullRd** = attempted full-file reads (includes blocked attempts). **RdErr** = read errors (blocks count as errors). **Edit** = completed edit/write operations.

### Diff and Quality Gate

| Run | Diff | Quality |
|---|---|---|
| off-run1 | Changed `buffer.length` to `buffer.data.length` (unrelated to triangle) | **FAIL** |
| off-run2 | Removed `% (2*PI)` from sawValue; deleted bug comments | **FAIL** |
| warn3000-run1 | Only removed the two bug-comment lines (99-100) | **FAIL** |
| warn3000-run2 | `sample = Math.abs(sawValue) * 2 - 1` changed to `sample = 1 - Math.abs(sawValue) * 2` | **PASS** |
| strict3000-run1 | Only removed the two bug-comment lines (99-100) | **FAIL** |
| strict3000-run2 | Only removed the two bug-comment lines (99-100) | **FAIL** |
| strict3000-run3 | Only removed the two bug-comment lines (99-100) | **FAIL** |
| strict8000-run1 | Replaced entire triangle calc with `sample = 1 - 4 * Math.abs((this.phase % (2 * Math.PI)) / (2 * Math.PI) - 0.5)` | **PASS** |
| strict8000-run2 | `sample = Math.abs(sawValue) * 2 - 1` changed to `sample = 1 - Math.abs(sawValue) * 2` (deleted comments) | **PASS** |
| strict8000-run3 | `sample = Math.abs(sawValue) * 2 - 1` changed to `sample = 1 - 2 * Math.abs(sawValue)` (deleted comments) | **PASS** |

### strict@3000 Detailed Tool Sequences

All three runs exhibited identical behavioral patterns:

```
run-1: full read BLOCKED -> grep triangle -> grep "class Oscillator"
       -> glob **/src/audio-e -> range read offset=85 limit=30
       -> range read offset=40 limit=120 -> range read offset=77 limit=50 -> edit

run-2: full read BLOCKED -> grep triangle -> grep "class Oscillator"
       -> range read offset=85 limit=25 -> range read offset=40 limit=80
       -> range read offset=77 limit=35 -> edit

run-3: full read BLOCKED -> grep triangle -> grep "class Oscillator"
       -> range read offset=88 limit=30 -> range read offset=40 limit=30 (audio-engine.ts!)
       -> range read offset=37 limit=70 -> range read offset=96 limit=10 -> edit
```

All three successfully redirected from full read to grep + range reads. No retry loops. But all three produced the same edit: removing only the bug comments with zero calculation change.

---

## RepoLens Ledger Summary

| Run | Reads | Full | Range | Writes | Warned | Blocked | Tokens Intercepted | Tokens Avoided |
|---|---|---|---|---|---|---|---|---|
| warn3000-run1 | 2 | 1 | 1 | 1 | **1** | 0 | 0 | 0 |
| warn3000-run2 | 2 | 1 | 1 | 1 | **1** | 0 | 0 | 0 |
| strict3000-run1 | 3 | 0 | 3 | 1 | 0 | **1** | 4,619 | 4,619 |
| strict3000-run2 | 3 | 0 | 3 | 1 | 0 | **1** | 4,619 | 4,619 |
| strict3000-run3 | 4 | 0 | 4 | 1 | 0 | **1** | 4,619 | 4,619 |
| strict8000-run1 | 2 | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| strict8000-run2 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| strict8000-run3 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 0 |

> off runs had empty ledgers (RepoLens disabled).

---

## Group Statistics

### off (n=2, baseline)

| Metric | Run1 | Run2 | Mean |
|---|---|---|---|
| Duration (s) | 790.8 | 346.5 | 568.7 |
| OpenCode final tokens | 44,008 | 29,039 | 36,524 |
| Full reads (completed) | 1 | 1 | 1.0 |
| Range reads | 0 | 0 | 0.0 |
| Grep calls | 0 | 0 | 0.0 |
| Edits | 2 | 1 | 1.5 |
| Quality pass | FAIL | FAIL | **0/2** |

### warn@3000 (n=2)

| Metric | Run1 | Run2 | Mean |
|---|---|---|---|
| Duration (s) | 723.3 | 576.3 | 649.8 |
| OpenCode final tokens | 42,320 | 37,091 | 39,706 |
| Full reads (completed after warn) | 1 | 1 | 1.0 |
| Range reads | 1 | 1 | 1.0 |
| Grep calls | 0 | 0 | 0.0 |
| Edits | 1 | 1 | 1.0 |
| PL warnings | 1 | 1 | 1.0 |
| PL blocks | 0 | 0 | 0.0 |
| Quality pass | FAIL | PASS | **1/2** |

### strict@3000 (n=3)

| Metric | Run1 | Run2 | Run3 | Mean |
|---|---|---|---|---|
| Duration (s) | 569.7 | 317.3 | 405.2 | 430.7 |
| OpenCode final tokens | 32,837 | 23,410 | 27,125 | **27,791** |
| Full reads attempted | 1 | 1 | 1 | 1.0 |
| Full reads completed | 0 | 0 | 0 | **0.0** |
| Range reads | 3 | 3 | 4 | 3.3 |
| Grep calls | 2 | 2 | 2 | 2.0 |
| Edits | 1 | 1 | 1 | 1.0 |
| PL warnings | 0 | 0 | 0 | 0.0 |
| PL blocks | 1 | 1 | 1 | **1.0** |
| Token reduction vs off | -25.4% | — | — | **-23.9%** |
| Quality pass | FAIL | FAIL | FAIL | **0/3** |

### strict@8000 (n=3) — NO TRIGGER

| Metric | Run1 | Run2 | Run3 | Mean |
|---|---|---|---|---|
| Duration (s) | 652.6 | 590.8 | 595.9 | 613.1 |
| OpenCode final tokens | 40,484 | 37,817 | 42,414 | 40,238 |
| Full reads | 1 | 1 | 1 | 1.0 |
| Range reads | 1 | 0 | 0 | 0.3 |
| Grep calls | 0 | 0 | 0 | 0.0 |
| Edits | 1 | 1 | 1 | 1.0 |
| PL warnings | 0 | 0 | 0 | 0.0 |
| PL blocks | 0 | 0 | 0 | **0.0** |
| Quality pass | PASS | PASS | PASS | **3/3** |

> **The 8,000 threshold did NOT trigger on this fixture.** The file is ~4,619 estimated tokens. This group effectively behaves as a "strict disabled" control — strict policy is active but the threshold is higher than the file size, so no intervention occurs.

---

## Interpretation

### Caveat: Quality Oracle Ambiguity

The behavioral intervention evidence in this report is stronger than the quality-regression evidence.

The current trap-case fixture contains an intentionally misleading comment near the triangle waveform branch, but the original formula can be interpreted as a valid triangle wave under a different phase convention. Because of that, the pass/fail scoring based on "changed calculation logic" should be treated as provisional rather than a definitive correctness oracle.

This report should therefore be read as:

```text
Strong evidence: strict@3000 changes model read behavior.
Provisional evidence: strict@3000 may harm fix quality on this fixture.
Missing evidence: strict@8000 default behavior on a >8k-token fixture.
```

The next eval should use a fixture with executable expected outputs so quality can be scored independently of comments and formula style.

### 1. strict@3000: Intervention Is Proven, Quality Is Not

| Evidence | Conclusion |
|---|---|
| 3/3 runs blocked first full read | **Proven**: strict consistently intervenes |
| 3/3 runs switched to grep + range reads | **Proven**: model reliably adapts to block |
| 0/3 runs had retry loops | **Proven**: block does not cause infinite retry |
| 0/3 runs passed quality gate | **Not proven**: strict does not preserve fix quality |
| Token reduction ~24% vs baseline | Observed but not a saving if quality is lost |

**The central finding**: strict@3000 reliably forces behavior change (grep + range), but all three runs produced the same trivial edit (comment removal) with zero calculation change. The model, when blocked from reading the full file, appears to lose sufficient context to confidently modify the calculation. Instead, it treats the bug comments as the only issue and removes them.

### 2. warn@3000: Ineffective, As Expected

Both runs showed the warning emitted in the ledger, but the model ignored it in both cases. warn@3000-run1 only removed comments. warn@3000-run2 did make a formula change, but the warning did not prevent the full read either way. This confirms the earlier single-run finding: `console.warn` is not behaviorally meaningful to DeepSeek V4 Pro in this setup.

### 3. strict@8000: No Trigger, Highest Quality

Since the fixture (~4,619 tokens) is below the 8,000 threshold, all three runs proceeded without intervention and achieved 100% quality pass. This is a useful reminder that the default threshold matters enormously — and that a file of this size would not benefit from the guard at the product-default threshold.

### 4. The Quality Paradox

```
strict@3000:  token-down  quality-down  (0/3 passed, no useful diff)
strict@8000:  token-flat  quality-up    (3/3 passed, actual formula changes)
```

This is the crucial tradeoff the eval exposes: blocking full reads can save tokens but risks degrading fix quality. The model with grep/range access appears to conclude the bug is only in the comments, not in the calculation. With full-file access, it makes substantive formula changes.

---

## Does This Support strict as Default?

**No.** The eval provides strong evidence that `strict` mode is a powerful intervention mechanism — it reliably blocks full reads and redirects to grep/range. However, at the tested threshold (3,000 tokens), it degraded fix quality to zero across three independent runs.

The default 8,000-token threshold received **no positive trigger evidence** from this fixture (file is too small). A larger fixture (10k-15k tokens) would be needed to test whether strict at a higher threshold balances intervention with quality.

---

## Recommendations

1. **Do NOT default `large_file_policy: strict` at 3,000 tokens.** Quality degradation is too severe.

2. **Build a second trap fixture above 8,000 tokens** (ideally 12k-15k estimated tokens) to test strict at product-default threshold.

3. **Investigate whether strict block response can include more context.** The model in all 3 strict@3000 runs was given an error message about large files, then used grep to find the triangle case — but it apparently lacked enough surrounding context (the sawValue definition, the effectiveGain, the buffer iteration) to understand the full picture. A richer block message with line-range suggestions might help.

4. **Consider a "soft strict" mode** that blocks the first full read but immediately provides an AI-generated summary or skeleton of the file as compensation.

5. **Run the matrix on a second model** (e.g., Claude) to check if this quality degradation is DeepSeek-specific or universal.

6. **Keep `warn` as the product default for now.** It does not harm quality, even if it does not help either.

---

## Verdict

The multi-run eval upgrades the evidence from "single positive smoke" to **"consistent behavioral intervention with quality regression."**

```
strict@3000 consistently:
  - Blocks first large full read
  - Redirects model to grep + range reads
  - Prevents retry loops
  X Degrades fix quality to comment-only edits in 3/3 runs
```

Best current wording:

```
RepoLens strict large-file guard has multi-run OpenCode evidence
(3/3) that it can redirect DeepSeek V4 Pro from full-file reads to
grep/range reads. However, at the tested 3,000-token threshold,
all three strict runs failed the intended bug-fix quality gate by
producing only comment-removal edits. The 8,000-token default
threshold received no trigger evidence from this fixture. More evals
on larger fixtures are needed before claiming strict default improves
real task outcomes without quality loss.
```

---

## Temporary Directory

```
<eval-root>/
```

This directory was created by this eval session. It contains all 10 workspace copies and 20 log files. The user may delete it with:

```bash
rm -rf <eval-root>/
```

**No other files or directories on the system were created, modified, or deleted by this eval.**
