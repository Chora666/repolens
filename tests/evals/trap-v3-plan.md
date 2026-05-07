# Trap Case V3 Eval Plan

## Purpose

Trap Case V3 adds a non-audio, app-state style fixture. It tests whether RepoLens large-file policies still help when the task is a dashboard pagination bug rather than a math/audio bug.

## Fixture

```text
tests/fixtures/trap-case-v3/
  PROMPT.md
  package.json
  src/dashboard-state-large.tsx
```

Generate or refresh the fixture:

```bash
npm run trap:v3:generate
```

The target file is intentionally larger than the default 8k-token threshold.

## Quality Oracle

Run the gate against any completed eval workspace:

```bash
npm run trap:v3:gate -- <workspace>
```

Pass condition:

```text
Changing search, segment, or region resets pageIndex to 0.
SET_PAGE still preserves the requested page.
```

## Recommended Matrix

```text
off x3
warn@8000 x3
strict@8000 x3
adaptive@8000 x3
```

`adaptive@8000` is expected to behave closer to warn for single-full-read tasks, because it warns first and blocks only a later repeated large full read.

## Standard Prompt

Use the contents of `tests/fixtures/trap-case-v3/PROMPT.md`.

## Runner

Preview the planned matrix without calling an external model:

```bash
npm run trap:v3:real-eval -- --dry-run
```

Run the matrix only after explicitly approving external model disclosure:

```bash
REPOLENS_ALLOW_EXTERNAL_MODEL=1 npm run trap:v3:real-eval
```

## Safety Boundary

Run every model invocation in a fresh system-temp workspace copied from this fixture. Do not run the model inside the RepoLens repository.
