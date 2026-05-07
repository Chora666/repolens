# RepoLens Trap Case V2 — Multi-Run Real Eval: DeepSeek V4 Pro

**Date**: 2026-05-06  
**Model**: `dee-seek/deepseek-v4-pro`  
**OpenCode**: `1.14.33`  
**RepoLens**: `@chora404/repolens@1.0.0` pre-release  
**Eval root**: `<eval-root>/`

---

## Scope and Data Disclosure

This eval intentionally sent the local trap-case V2 fixture code and standardized prompt to the external DeepSeek V4 Pro service through OpenCode. The user explicitly approved sending this isolated fixture code and prompt to the untrusted external model service for the off / warn@8000 / strict@8000 real eval matrix.

Data sent was limited to isolated copies of `tests/fixtures/trap-case-v2/` in `<tmp-root>/`. No other RepoLens source or user files were transmitted.

---

## Safety Boundary

| Constraint | Status |
|---|---|
| No model execution inside `<project-root>` | OK |
| No modification to original project files | OK |
| All workspaces in `<tmp-root>/repolens-trap-v2-<ts>/` | OK |
| Each run has independent workspace | OK |
| Only V2 fixture files copied | OK |
| No deletion/move/overwrite of non-eval files | OK |
| Only this report written to original project (`tests/`) | OK |
| No git commit, no publish, no npm install to original project | OK |

---

## V1 vs V2 Improvements

| Aspect | V1 | V2 |
|---|---|---|
| Target file | `audio-engine-full.ts` | `audio-engine-large.ts` |
| File size | 18,475 bytes (~4,619 tokens) | **52,186 bytes (~13,047 tokens)** |
| Triggers 8k default? | No | **Yes** |
| Bug | Ambiguous (formula correct, comments misleading) | Clear executable oracle with exact expected output |
| Quality gate | Manual diff inspection | `npm run trap:v2:gate -- <workspace>` |
| Prompt | Ad-hoc with no expected values | Standardized `PROMPT.md` with expected sample array |

---

## Fixture

| Property | Value |
|---|---|
| Fixture root | `tests/fixtures/trap-case-v2/` |
| Target file | `src/audio-engine-large.ts` |
| Lines | 1,907 |
| Size | 52,186 bytes |
| Estimated tokens | **~13,047** (ratio=4) |
| Bug location | `triangleSampleForPhase()` function, lines 14-25 |
| Filler | 55 `UtilityProcessor` classes (lines 94-1907) |

### The Bug

```typescript
export function triangleSampleForPhase(phaseRadians: number): number {
  const phase = ((phaseRadians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const sawValue = 2 * (phase / (2 * Math.PI)) - 1
  // BUG: This phase convention is wrong for this engine.
  // Expected values are: 0, 1, 0, -1, 0 (at phases 0, PI/2, PI, 3PI/2, 2PI)
  return Math.abs(sawValue) * 2 - 1
}
```

**Current output for Oscillator(1Hz, triangle, gain=1, sampleRate=4)**: `[1, 0, -1, 0, 1]`  
**Expected**: `[0, 1, 0, -1, 0]`

The formula `Math.abs(sawValue) * 2 - 1` uses the wrong phase convention — output starts at +1 instead of 0.

### Executable Oracle

```bash
cd RepoLens && npm run trap:v2:gate -- <workspace>
```

- PASS: output equals `[0, 1, 0, -1, 0]` within 1e-6 tolerance
- FAIL: any mismatch or compile error
- Formula-agnostic: does not care how the fix is achieved
- Confirmed: unmodified fixture FAILS the oracle

---

## Matrix

| Group | `large_file_policy` | Threshold | Runs | Purpose |
|---|---|---|---|---|
| off | — (`enabled: false`) | — | x3 | Baseline, no intervention |
| warn@8000 | `warn` | 8000 | x3 | Warning emitted, full read allowed |
| **strict@8000** | `strict` | **8000** | x3 | **Primary test: block at product-default threshold** |

Gap: no strict@3000 group (V1 already demonstrated quality collapse at that threshold; skipped to focus budget on default threshold evidence).

---

## Prompt

```
Find and fix the bug in src/audio-engine-large.ts where Oscillator.process()
produces incorrect output for triangle waveform.

Expected triangle samples for a 1 Hz oscillator at sampleRate 4 with gain 1 are:
0, 1, 0, -1, 0

Make the smallest safe code change in src/audio-engine-large.ts, then briefly
explain what you changed. No test run is required; do not search dependency
directories or test directories.
```

---

## Raw Log Paths

```
<eval-root>/logs/
├── off-run1.jsonl          off-run1.stderr
├── off-run2.jsonl          off-run2.stderr
├── off-run3.jsonl          off-run3.stderr
├── warn8000-run1.jsonl     warn8000-run1.stderr
├── warn8000-run2.jsonl     warn8000-run2.stderr
├── warn8000-run3.jsonl     warn8000-run3.stderr
├── strict8000-run1.jsonl   strict8000-run1.stderr
├── strict8000-run2.jsonl   strict8000-run2.stderr
└── strict8000-run3.jsonl   strict8000-run3.stderr
```

Workspaces:
```
<eval-root>/workspaces/
├── off-run1/   off-run2/   off-run3/
├── warn8000-run1/   warn8000-run2/   warn8000-run3/
└── strict8000-run1/   strict8000-run2/   strict8000-run3/
```

---

## Per-Run Results

### Tool Behavior Summary

| Run | Dur(s) | Events | Tokens | FullRd | RngeRd | Grep | Glob | Edit | RdErr |
|---|---|---|---|---|---|---|---|---|---|
| off-run1 | 122.7 | 10 | 34,870 | 1 | 0 | 0 | 0 | 1 | 0 |
| off-run2 | 176.5 | 10 | 35,969 | 1 | 0 | 0 | 0 | 1 | 0 |
| off-run3 | 246.9 | 10 | 38,613 | 1 | 0 | 0 | 0 | 1 | 0 |
| warn8000-run1 | 108.0 | 10 | 34,276 | 1 | 0 | 0 | 0 | 1 | 0 |
| warn8000-run2 | 127.1 | 10 | 35,126 | 1 | 0 | 0 | 0 | 1 | 0 |
| warn8000-run3 | 71.7 | 10 | 32,389 | 1 | 0 | 0 | 0 | 1 | 0 |
| strict8000-run1 | 167.7 | 15 | 18,129 | 1 | **2** | 0 | 0 | 1 | **1** |
| strict8000-run2 | 410.3 | 16 | 26,890 | 1 | **2** | 0 | 0 | 1 | **1** |
| strict8000-run3 | 284.9 | 13 | 21,896 | 1 | **1** | 0 | 0 | 1 | **1** |

> **FullRd** = attempted full-file reads (includes blocked). **RdErr** = read errors (blocks). All 3 strict runs had exactly 1 block on the first full read, then switched to range reads.

### Diff and Fix Strategy

| Run | Fix Strategy | Formula Used |
|---|---|---|
| off-run1 | Full rewrite | `1 - 4 * Math.abs((phaseNorm + 0.25) % 1 - 0.5)` |
| off-run2 | `asin(sin)` triangle | `Math.asin(Math.sin(phase)) * (2 / Math.PI)` |
| off-run3 | Phase shift `sawValue` | `2 * (((phase + 3*PI/2) % (2*PI)) / (2*PI)) - 1` |
| warn8000-run1 | `asin(sin)` triangle | `(2 / Math.PI) * Math.asin(Math.sin(phaseRadians))` |
| warn8000-run2 | `asin(sin)` triangle | `(2 / Math.PI) * Math.asin(Math.sin(phaseRadians))` |
| warn8000-run3 | `asin(sin)` triangle | `Math.asin(Math.sin(phase)) * (2 / Math.PI)` |
| strict8000-run1 | Full rewrite | `1 - 2 * Math.abs(phase / Math.PI - 0.5)` |
| strict8000-run2 | Phase shift `sawValue` | `2 * (((phase + 3*PI/2) % (2*PI)) / (2*PI)) - 1` |
| strict8000-run3 | `asin(sin)` triangle | `(2 * Math.asin(Math.sin(phaseRadians))) / Math.PI` |

Three distinct fix strategies emerged across all runs:
1. **`asin(sin)` formula** (6/9 runs): `(2/PI) * asin(sin(phase))` — mathematically produces a triangle wave
2. **Phase shift** (2/9 runs): Shifts the `sawValue` computation by `3*PI/2` (or equivalently `-PI/2`)
3. **Full rewrite** (2/9 runs): Replaces the entire function body with a clean triangle formula

### strict@8000 Detailed Tool Sequences

```
run-1: full read BLOCKED → range read offset=1 limit=50 → range read offset=14 limit=15 → edit
run-2: full read BLOCKED → range read offset=1 limit=50 → range read offset=12 limit=15 → edit
run-3: full read BLOCKED → range read offset=1 limit=50 → edit
```

All three runs first attempted a full read (blocked), then read the first 50 lines (which contains both the `triangleSampleForPhase` function and the `Oscillator` class), then narrowed to the specific bug region. No grep was used — range reads alone provided sufficient context. No retry loops.

### Quality Gate (Oracle)

| Run | Oracle Result | Actual Output |
|---|---|---|
| off-run1 | **PASS** | `[0, 1, 0, -1, 0]` |
| off-run2 | **PASS** | `[0, 1, ~0, -1, 0]` |
| off-run3 | **PASS** | `[0, 1, 0, -1, 0]` |
| warn8000-run1 | **PASS** | `[0, 1, ~0, -1, 0]` |
| warn8000-run2 | **PASS** | `[0, 1, ~0, -1, 0]` |
| warn8000-run3 | **PASS** | `[0, 1, ~0, -1, 0]` |
| strict8000-run1 | **PASS** | `[0, 1, 0, -1, 0]` |
| strict8000-run2 | **PASS** | `[0, 1, 0, -1, 0]` |
| strict8000-run3 | **PASS** | `[0, 1, ~0, -1, 0]` |

> `~0` = floating point near-zero (e.g., 7.8e-17), within the oracle's 1e-6 tolerance.

**9/9 runs passed the oracle.** The V2 prompt (with explicit expected sample values) and executable oracle eliminate the quality ambiguity that plagued V1.

---

## RepoLens Ledger Summary

| Run | Reads | Full | Range | Writes | Warned | Blocked | Tokens Avoided |
|---|---|---|---|---|---|---|---|
| warn8000-run1 | 1 | 1 | 0 | 1 | **1** | 0 | 0 |
| warn8000-run2 | 1 | 1 | 0 | 1 | **1** | 0 | 0 |
| warn8000-run3 | 1 | 1 | 0 | 1 | **1** | 0 | 0 |
| strict8000-run1 | 2 | **0** | 2 | 1 | 0 | **1** | **13,047** |
| strict8000-run2 | 2 | **0** | 2 | 1 | 0 | **1** | **13,047** |
| strict8000-run3 | 1 | **0** | 1 | 1 | 0 | **1** | **13,047** |

> Off runs had no token-ledger.json (RepoLens disabled).

---

## Group Statistics

### off (n=3, baseline)

| Metric | Run1 | Run2 | Run3 | Mean |
|---|---|---|---|---|
| Duration (s) | 122.7 | 176.5 | 246.9 | 182.0 |
| OpenCode final tokens | 34,870 | 35,969 | 38,613 | **36,484** |
| Full reads (completed) | 1 | 1 | 1 | 1.0 |
| Range reads | 0 | 0 | 0 | 0.0 |
| Grep calls | 0 | 0 | 0 | 0.0 |
| Edits | 1 | 1 | 1 | 1.0 |
| Oracle pass | PASS | PASS | PASS | **3/3** |

### warn@8000 (n=3)

| Metric | Run1 | Run2 | Run3 | Mean |
|---|---|---|---|---|
| Duration (s) | 108.0 | 127.1 | 71.7 | 102.3 |
| OpenCode final tokens | 34,276 | 35,126 | 32,389 | **33,930** |
| Full reads (completed after warn) | 1 | 1 | 1 | 1.0 |
| Range reads | 0 | 0 | 0 | 0.0 |
| Grep calls | 0 | 0 | 0 | 0.0 |
| Edits | 1 | 1 | 1 | 1.0 |
| PL warnings | 1 | 1 | 1 | 1.0 |
| PL blocks | 0 | 0 | 0 | 0.0 |
| Oracle pass | PASS | PASS | PASS | **3/3** |

### strict@8000 (n=3) — PRIMARY TEST GROUP

| Metric | Run1 | Run2 | Run3 | Mean |
|---|---|---|---|---|
| Duration (s) | 167.7 | 410.3 | 284.9 | 287.6 |
| OpenCode final tokens | 18,129 | 26,890 | 21,896 | **22,305** |
| Full reads attempted | 1 | 1 | 1 | 1.0 |
| Full reads completed | 0 | 0 | 0 | **0.0** |
| Range reads | 2 | 2 | 1 | 1.7 |
| Grep calls | 0 | 0 | 0 | 0.0 |
| Edits | 1 | 1 | 1 | 1.0 |
| PL warnings | 0 | 0 | 0 | 0.0 |
| PL blocks | 1 | 1 | 1 | **1.0** |
| Token reduction vs off | | | | **-38.9%** |
| Token reduction vs warn | | | | **-34.3%** |
| Oracle pass | PASS | PASS | PASS | **3/3** |

---

## Interpretation

### 1. strict@8000 at Product-Default Threshold: Proven

| Evidence | Runs | Conclusion |
|---|---|---|
| First full read blocked | 3/3 | **Proven**: strict intervenes at default 8k threshold on files > 8k |
| Model switched to range reads | 3/3 | **Proven**: model adapts without grep |
| No retry loops | 3/3 | **Proven**: block does not cause infinite retry |
| Oracle pass | 3/3 | **Proven**: fix quality preserved |
| Token savings | ~39% vs off | Significant reduction |

This is the result V1 could not deliver: **strict at the product-default 8,000-token threshold both blocks full reads and preserves fix quality**, with three independent positive runs and zero quality regressions.

### 2. warn@8000: Still Ineffective

All three warn runs emitted warnings (ledger confirmed), but the model completed the full read in all cases. No behavioral change observed. Token savings: 0. Confirms V1 finding that `console.warn` is not behaviorally meaningful to DeepSeek V4 Pro.

### 3. Range Reads Without Grep

Unlike V1's strict@3000 (which always used grep), V2's strict@8000 runs used only range reads. The model read the first 50 lines (which contains both `triangleSampleForPhase` and `Oscillator.process`), then read just the bug region. This suggests the bug being in a standalone function at the top of a large file is an easier target for range-read strategies than a bug buried mid-file.

### 4. Fix Strategy Diversity

Across all 9 runs, three distinct correct fix strategies emerged. None of the strict runs produced comment-only edits (the V1 failure mode). The explicit expected values in the prompt (`0, 1, 0, -1, 0`) are likely a key enabler of this quality improvement — the model knows the target, not just that "something is wrong."

### 5. Token Efficiency

```
off:                     mean 36,484 tokens (baseline)
warn@8000:               mean 33,930 tokens (no savings, warnings ignored)
strict@8000:             mean 22,305 tokens (39% reduction)
strict@8000 ranged:      mean 1.7 reads × ~800 tokens = ~1,360 tokens in reads
                         vs 13,047 tokens avoided in full reads
                         Net savings: ~11,700 tokens/run
```

---

## Comparison: V1 vs V2

| Metric | V1 strict@3000 | V1 strict@8000 | V2 strict@8000 |
|---|---|---|---|
| File tokens | 4,619 | 4,619 | **13,047** |
| Threshold triggered? | Yes (3k threshold) | No (file < 8k) | **Yes (file > 8k)** |
| Full reads blocked | 3/3 | 0/3 | **3/3** |
| Quality pass | 0/3 | 3/3 | **3/3** |
| Fix type | Comment removal only | Formula changes | Formula changes |
| Token savings | ~24% vs off | None (no trigger) | **~39% vs off** |

V1's strict@8000 did not trigger because the fixture was too small. V1's strict@3000 triggered but degraded quality. **V2's strict@8000 is the first eval that simultaneously demonstrates intervention AND quality preservation at the product-default threshold.**

---

## Does This Support strict as Default?

**Yes, with caveats.** The V2 evidence shows that at the 8,000-token default threshold, on a 13,000-token file with an executable quality oracle:

1. strict reliably blocks the first full read (3/3)
2. The model adapts to range reads (3/3)
3. Fix quality is preserved (3/3)
4. Token consumption is reduced by ~39%

However, the evals are still limited:
- Single model (DeepSeek V4 Pro)
- Single bug type (standalone function at file top)
- Single file size (13k tokens)
- Prompt includes explicit expected values (not always realistic)

---

## Recommendations

1. **Upgrade the product claim**: V2 evidence supports "strict large-file guard at 8,000-token threshold can reduce token consumption by ~39% without degrading fix quality" (for this model and bug type).

2. **Test strict@8000 on a second model** (Claude, GPT-4o) to check if the quality preservation is DeepSeek-specific.

3. **Build a V3 fixture** with the bug in the MIDDLE of a large file (surrounded by filler) rather than at the top, to test whether range-read strategies work when the bug location is not trivially discoverable.

4. **Test without explicit expected values** in the prompt — the V2 prompt gives the model a clear oracle to target, which may not be realistic for all real-world bug-fix tasks.

5. **Consider making `strict` the default** given this positive multi-run evidence. The previous V1 quality collapse was threshold-specific (3,000 tokens), not policy-specific.

6. **Keep `warn` as a documented fallback**, but do not invest in making it more effective — 3/3 runs confirm it is ignored.

---

## Verdict

The V2 multi-run eval provides the missing evidence V1 could not: **strict at the product-default 8,000-token threshold on a file above that threshold preserves fix quality while reducing token consumption.**

```
strict@8000 consistently:
  ✓ Blocks first large full read (3/3)
  ✓ Redirects model to range reads (3/3)
  ✓ Prevents retry loops (3/3)
  ✓ Preserves fix quality — all pass executable oracle (3/3)
  ✓ Reduces token consumption ~39% vs baseline
```

Best current wording:

```
RepoLens strict large-file guard at the 8,000-token default threshold
has multi-run OpenCode evidence (3/3) with DeepSeek V4 Pro that it can:
- Block full-file reads of a 13,000-token source file
- Redirect the model to range reads without grep
- Preserve fix quality (100% oracle pass rate)
- Reduce total token consumption by ~39%

This upgrades the evidence from "behavioral intervention with quality
regression at 3,000 tokens" (V1) to "behavioral intervention with
quality preservation at the product-default 8,000-token threshold" (V2).
```

---

## Temporary Directory

```
<eval-root>/
```

This directory was created by this eval session. It contains all 9 workspace copies and 18 log files. The user may delete it with:

```bash
rm -rf <eval-root>/
```

**No other files or directories on the system were created, modified, or deleted by this eval.**
