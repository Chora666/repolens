# RepoLens Token Savings Iteration Plan

Date: 2026-05-06
Status: Revised after internal review; P0/P1/P2 initial implementation complete

## Summary

RepoLens is already useful as a behavior guardrail, project memory, and
session ledger. Real long-window tests show it can run safely inside OpenCode
without disrupting work. The remaining gap is token-saving proof: in real runs,
DeepSeek often avoided duplicate full-file reads naturally, so the current
repeat-read blocker did not trigger.

The next iteration should move RepoLens from "block repeated waste" to
"actively prevent unnecessary large reads." The core product shift is:

```text
Before: block the second full-file read.
After: guide or block the first large full-file read when a cheaper path exists.
```

## Goals

- Reduce unnecessary full-file reads of large source files.
- Make RepoLens savings measurable in real OpenCode sessions.
- Preserve low-friction default behavior for first-time users.
- Keep simulator savings claims separate from real-world savings evidence.
- Improve reports so product value is visible even when hard blocks do not fire.

## Non-Goals

- Do not claim fixed percentage savings without real A/B proof.
- Do not require a new external tokenizer in the first iteration.
- Do not force strict repeat-read blocking changes by default for all users.
- Do not rewrite anatomy storage into a full database yet.

## Current Evidence

Real tests so far show:

- RepoLens loads and tracks real OpenCode sessions.
- It records reads, writes, memory, and token ledger data.
- Cerebrum write protection works with OpenCode's real `edit` tool.
- Duplicate full-file read blocking works in simulator and controlled smoke
  tests.
- Real long-window runs produced zero repeated full-file reads, so no direct
  token savings were proven.

Main insight:

```text
The expensive event is often the first large full-file read, not only repeated reads.
```

## Revised Execution Strategy

The internal review changed the implementation order. P3-style validation must
run alongside P0 instead of after all feature work. Otherwise RepoLens could
ship better telemetry without proving that the trigger condition exists in real
model behavior.

Revised order:

```text
P0-a  Update REPOLENS.md read protocol               [done]
P0-b  Add file-size distribution analysis                [done]
P0-c  Build a repeatable trap-case eval                 [done]
P1-a  Add large-file first-read guard with retry          [done]
P1-b  Extend ledger counters with migration defaults      [done]
P2-a  Add lightweight anatomy section hints               [done]
P2-b  Store session event summaries inside token-ledger.json [done]
```

Dependency map:

```text
Read protocol ──────────────┐
File-size distribution ─────┼──▶ Trap-case eval ──▶ Large-file guard
Telemetry counters ─────────┘             │
                                          ▼
Anatomy section hints ─────────▶ Better guard messages
                                          │
                                          ▼
                         Ledger session event summaries
```

## Iteration P0-a: REPOLENS Read Protocol

### Problem

The model often follows project instructions well. This is the cheapest way to
improve token discipline before adding new hook behavior.

### Proposal

Update `REPOLENS.md` with a concrete read protocol:

```text
Before reading files estimated above 8k tokens:
1. Check .lens/anatomy.md for file map and sections.
2. Use grep for symbols or keywords.
3. Use read with offset/limit around relevant matches.
4. Use full-file read only for small files or when the full file is genuinely needed.
```

This should ship before or alongside the large-file guard because it is low
risk, requires no migration, and does not interrupt the workflow.

## Iteration P0-b: File-Size Distribution Analysis

### Problem

The 8k-token threshold is a reasonable starting guess, but it needs real project
distribution data. If few files exceed the threshold, the guard will not trigger.

### Proposal

Add a repeatable analysis command that scans a target project using RepoLens
ignore rules and reports:

- total tracked files
- files above 8k / 15k / 30k estimated tokens
- largest files
- extension and directory hotspots
- suggested threshold for the project

### Acceptance Criteria

- The report can be generated without OpenCode or model calls.
- The script honors `.lens/config.json` when present.
- The output is Markdown and can be checked into `tests/` as evidence.

## Iteration P0-c: Trap-Case Real Eval

### Problem

R1 and R2 showed that modern models may naturally avoid duplicate full-file
reads. The savings strategy needs a repeatable task that naturally tempts at
least one large full-file read.

### Proposal

Design a fixture or real-project task where the model is likely to read a large
file unless RepoLens intervenes. Run every major change through:

```text
A: RepoLens disabled
B: RepoLens enabled
same model, same prompt, no explicit "avoid large reads" instruction
```

Success is not only lower tokens; the final answer/fix quality must be at least
as good as baseline.

## Iteration P1-a: Large File First-Read Guard

### Problem

The current plugin allows the first full read of any file. In large source
files, one full read can be tens of thousands of estimated tokens. If the model
only reads that file once, the repeat-read blocker never helps.

### Proposal

Add a configurable large-file policy:

```json
{
  "large_file_policy": "strict",
  "large_file_threshold_tokens": 8000,
  "large_file_allow_globs": []
}
```

Policy values:

```text
off     Do nothing.
warn    Warn once, but allow the full read.
strict  Block the first large full read and suggest grep/range reads.
```

Default for Beta:

```json
{
  "mode": "adaptive",
  "repeat_read_policy": "strict",
  "large_file_policy": "strict",
  "large_file_threshold_tokens": 8000
}
```

### Behavior

When the model attempts a first full read of a large file:

```text
[RepoLens] Large file read: src/large-module.cpp (~47k tok).

Suggested cheaper path:
- grep "handler|callback|registry"
- read with offset/limit around relevant matches
- consult .lens/anatomy.md for section map

Full-file reads of large files can be expensive. Use range reads unless the
whole file is genuinely needed. Do not reduce task quality to save tokens; if
grep/range context is insufficient to verify the requested change, retry the
full read.
```

In `warn` mode, print the warning and let the read proceed.

In `strict` mode, use a retry escape hatch:

```text
First large full read for a file: throw Error with section/grep suggestions.
Second large full read for same file: allow, because the AI/user is insisting.
```

This prevents permanent blocking when the whole file is genuinely needed.

`large_file_allow_globs` uses gitignore-style glob strings, not regular
expressions. It should be documented as path-relative to project root.

### Acceptance Criteria

- Small files are unaffected.
- Large file first-read warning appears once per file per session.
- Range reads bypass the warning.
- `warn` mode does not break task completion.
- `strict` mode blocks first large full read, increments a ledger counter, and
  allows the second attempt for the same file.

## Iteration P1-b: Better Telemetry for Savings

### Problem

The ledger currently tracks total reads/writes/tokens and repeated blocks. Real
runs can be context-efficient without triggering repeated blocks, but the report
does not make that visible.

### Proposal

Start with four counters only:

```json
{
  "full_reads": 5,
  "range_reads": 32,
  "large_full_reads_warned": 3,
  "large_full_reads_blocked": 1
}
```

Keep `estimated_tokens_avoided` and `followed_by` out of the plugin core until
there is a clear formula. Those fields can be inferred later from OpenCode JSONL
or richer session event analysis.

### Ledger Migration

New fields must be backward compatible with existing `.lens/token-ledger.json`:

```ts
ledger.lifetime.full_reads ??= 0
ledger.lifetime.range_reads ??= 0
ledger.lifetime.large_full_reads_warned ??= 0
ledger.lifetime.large_full_reads_blocked ??= 0
```

Session records should receive the same `??= 0` treatment when loaded.

### Acceptance Criteria

- Old ledgers load without manual migration.
- Existing 9 scenario tests update expected ledger values exactly.
- Reports distinguish full reads, range reads, large-file warnings, and
  large-file blocks.

## Iteration P2-a: Anatomy as a Read Planner

### Problem

`anatomy.md` is currently a passive file map. It helps users inspect the project,
but it does not actively tell the model what to read next.

### Proposal

Upgrade anatomy entries for source files with a capped line-level section index:

```text
## src
- `large-module.cpp` - large implementation module (~47002 tok)
  sections:
  - LargeModule::LargeModule at L41
  - initControls() at L...
  - layoutControls() at L...
  - buildRegistry() at L...
```

Use the existing `extractSections()` as the first implementation. For C++ and
other regex-hostile languages, degrade gracefully by extracting grep-friendly
keywords such as class names, qualified function names, and obvious method
definitions. Cap noisy files to about 15 high-signal entries.

### Read Planner Message

When a large full read is warned or blocked, RepoLens should include:

- Known sections from anatomy.
- Recent range reads for the same file.
- Suggested grep patterns based on the task, when available from tool input.
- Recommended offset/limit snippets.

### Acceptance Criteria

- Anatomy contains useful line-level sections for TS/JS/Python/Go/Rust/C++-like
  declarations where regex can detect them.
- Large-file guard messages include section hints.
- Anatomy remains under a readable size cap.
- After write/edit, the file's anatomy section hints are refreshed or marked
  stale so old line numbers are not presented as authoritative.

## Iteration P2-b: Ledger Session Event Summaries

### Problem

Manual log parsing is slow and weakens the evidence loop.

### Proposal

Extend each `token-ledger.json.sessions[]` entry instead of creating a separate
`session-report.json` file. This keeps all session telemetry in one place.

Suggested shape:

```json
{
  "session_id": "ses_x",
  "started_at": "...",
  "ended_at": "...",
  "summary": {
    "reads": 11,
    "full_reads": 5,
    "range_reads": 6,
    "writes": 1,
    "large_full_reads_warned": 2,
    "large_full_reads_blocked": 0,
    "repeated_reads_blocked": 0,
    "estimated_tokens_avoided": 0
  },
  "events": [
    {
      "tool": "read",
      "file": "src/engine.cpp",
      "read_kind": "range",
      "offset": 969,
      "limit": 15,
      "tokens_estimated": 500
    }
  ]
}
```

### Acceptance Criteria

- A/B test reports can be generated from the ledger without manually reading
  OpenCode JSONL logs.
- The report preserves enough detail to audit savings claims.
- Event arrays are capped to prevent unbounded ledger growth.

## Ongoing: Evaluation Harness for Real Savings

### Problem

Single A/B runs are too noisy. Different runs can choose different valid fixes.

### Proposal

Create repeatable real-eval tasks:

1. **Trap Case**
   - Build a fixture with large files and a task that naturally tempts repeated
     full reads.
   - Do not instruct the model to avoid full reads.
   - Compare enabled vs disabled runs.

2. **Repeated Trials**
   - Run the same task 3-5 times with RepoLens off and on.
   - Compare medians, not single samples.

3. **Quality Gate**
   - Score whether the final fix is correct, not just whether tokens are lower.

### Success Metrics

```text
Safety:
- No false blocks that prevent completion.
- Final answer quality not worse than baseline.

Savings:
- Fewer large full-file reads.
- More grep/range reads after RepoLens guidance.
- Non-zero estimated tokens avoided in strict/adaptive mode.

Proof:
- At least 3 repeated trials showing a consistent direction.
```

## Implementation Order

Recommended order:

1. Update `REPOLENS.md` read protocol.
2. Add file-size distribution analysis and run it on real projects.
3. Define the trap-case eval and run it before/after each feature.
4. Add large-file first-read policy with strict retry.
5. Extend ledger with full/range/large-file counters and migration defaults.
6. Include capped anatomy section hints in large-file warnings.
7. Store capped session event summaries in `token-ledger.json.sessions[]`.

## Risks

- Strict first-read blocking may annoy users if enabled by default.
- Regex section extraction may be incomplete for C++ and heavily macro-based
  files.
- Estimated token savings can be overstated if the model compensates with many
  grep/range reads.
- More telemetry fields increase migration complexity for existing ledgers.
- If real models still avoid large full reads naturally, the token-savings
  positioning should remain secondary to project memory and behavior guardrails.

## Recommended Beta Defaults

```json
{
  "mode": "adaptive",
  "repeat_read_policy": "strict",
  "large_file_policy": "strict",
  "large_file_threshold_tokens": 8000,
  "adaptive_threshold": 500,
  "auto_scan_on_init": true,
  "auto_update_anatomy": true
}
```

This keeps first-time user friction low while collecting better evidence.
Power users can switch `large_file_policy` to `warn` or `off` if strict creates
too much friction.

Upgrade guidance:

```text
Stay on strict if large_full_reads_blocked leads to grep/range reads and task
quality remains stable.
Switch back to warn if strict blocks create task friction or repeated retries.
```

## Release Messaging

Use:

```text
RepoLens helps OpenCode avoid wasteful large reads, track context usage, and
maintain lightweight project memory.
```

Avoid until proven:

```text
RepoLens saves 40% tokens in real-world use.
```

The simulator can continue to report 39%-49% savings as simulator estimates,
but real-world savings should be reported separately from `session-report.json`
and A/B runs.
