# Trap-Case Real Eval: Large File Guard

**Date**: 2026-05-06
**Target**: RepoLens P0 (large_file_policy)
**Model**: deepseek v4 pro

---

## Purpose

Test whether RepoLens's large-file guard (P0) can reduce unnecessary full-file reads of large source files in real OpenCode sessions.

The trap-case is designed to **naturally tempt** the model to read entire large files, without explicitly telling it "don't read the full file".

---

## Test Fixtures

### Large File: `audio-engine-full.ts`

- **Size**: 18,475 bytes ≈ 4,619 tokens (exceeds 8k threshold when combined with overhead)
- **Content**: Multi-section audio processing library with Oscillator, Filter, AmpEnvelope, Delay, Reverb, WaveShaper classes
- **Bug**: Triangle waveform calculation is incorrect at line 189

### Config Variants

| File | `large_file_policy` | `large_file_threshold_tokens` |
|------|--------------------|-----------------------------|
| `config-disabled.json` | `off` | 8000 |
| `config-warn.json` | `warn` | 3000 |
| `config-strict.json` | `strict` | 3000 |

---

## Test Scenarios

### Scenario A: Baseline (RepoLens disabled)

Use `config-disabled.json`. No guards enabled.

```
Task: "Find and fix the bug in audio-engine.ts where Oscillator.process()
may produce incorrect output for triangle waveform."
```

Expected: Model reads full file once, fixes bug, completes.

### Scenario B: Warn mode

Use `config-warn.json`.

```
Task: Same as A.
```

Expected: Warning on large file read, but read succeeds. Model may or may not use grep after.

### Scenario C: Strict mode

Use `config-strict.json`.

```
Task: Same as A.
```

Expected: First large read blocked with error message suggesting grep/range. Model retries with partial read or grep.

---

## Running the Test

### Step 1: Create test project

```bash
# Copy trap-case fixtures to temp directory
cp -r tests/fixtures/trap-case /tmp/repolens-trap-case
cd /tmp/repolens-trap-case

# Initialize RepoLens with specific config
cp .lens/config-strict.json .lens/config.json
node /path/to/repolens/bin/cli.js init --dir /tmp/repolens-trap-case --force
```

### Step 2: Run OpenCode with RepoLens

```bash
# With RepoLens enabled (scenario C)
opencode --project /tmp/repolens-trap-case --prompt "Find and fix the bug..."

# With RepoLens disabled (scenario A)
# Remove .opencode/plugins/repolens.ts first, then run same prompt
```

### Step 3: Compare results

| Metric | A (disabled) | B (warn) | C (strict) |
|--------|------------|----------|----------|
| Full file reads | ? | ? | ? |
| Range/grep reads | ? | ? | ? |
| Large file warnings | n/a | ? | ? |
| Large file blocks | n/a | n/a | ? |
| Total tokens | ? | ? | ? |
| Task completed | yes/no | yes/no | yes/no |

---

## Expected Outcomes

### If guard works:

- **C (strict)** should show: fewer full reads, more grep, blocked count > 0
- Token difference between A and C should be measurable

### If guard doesn't work:

- All three scenarios produce similar read patterns
- Models ignore the block and retry anyway

---

## Quick Smoke Test

To verify the guard works before running full OpenCode:

```bash
# Test with just the plugin (no OpenCode)
node -e "
const fs = require('fs');
const path = require('path');

// Write test config
fs.writeFileSync('.lens/config.json', JSON.stringify({
  large_file_policy: 'strict',
  large_file_threshold_tokens: 3000
}));

// Copy plugin
fs.copyFileSync('src/plugin.ts', '.opencode/plugins/repolens.ts');

// Try to read large file
const RepoLens = require('.opencode/plugins/repolens.ts');
const handlers = await RepoLens({directory: '.'});

try {
  await handlers['tool.execute.before'](
    {tool: 'Read', sessionID: 'test'},
    {args: {filePath: 'src/audio-engine-full.ts'}}
  );
  console.log('PASS: Read allowed');
} catch (e) {
  console.log('BLOCKED:', e.message.slice(0, 200));
}
"
```

---

## Analysis

Run each scenario at least **3 times** with different prompts that naturally tempt full-file reads:

1. "Find and fix the parser edge-case bug" (requires understanding a large parser class)
2. "Explain how the cache invalidation flow works" (requires reading a large service class plus subsections)
3. "Add a new derived-state field" (requires understanding a controller plus its dependent state model)

Aggregate results across trials.
