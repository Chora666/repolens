# Real OpenCode Smoke Test

Date: 2026-05-06
RepoLens version: 1.0.0
OpenCode version: 1.14.30
Node version: v25.9.0
Primary model: dee-seek/deepseek-v4-pro
Additional model checked: opencode/minimax-m2.5-free

## Current Status

Current status: PASS for CLI, Desktop, and fresh npm install smoke tests.

- Latest clean CLI run: `dee-seek/deepseek-v4-flash` passed after the plugin export fix. The OpenCode log did not include `patchText.split is not a function` or `failed to load plugin`.
- Historical CLI runs with `dee-seek/deepseek-v4-pro` and `opencode/minimax-m2.5-free` passed functionally but recorded the pre-fix plugin-loading warning. They are kept below as historical evidence.
- OpenCode Desktop passed the same read-interception path: first full-file read succeeded, duplicate full-file read was blocked, range read succeeded, and `.lens/` bookkeeping files were updated.
- Fresh npm install smoke passed from the packed tarball: the installed CLI initialized a clean target project and the compiled plugin exposed only the `default` export.

Scope note: these smoke tests validate real OpenCode hook behavior and packaging. The 49% / 39% token-savings figures remain simulator estimates from `tests/TEST_REPORT.md`.

## Setup

Fixture directory:

```text
<tmp-root>/repolens-real-smoke-deepseek
```

Fixture file:

```text
src/api.ts
```

Installed RepoLens with:

```bash
node bin/cli.js init --dir <tmp-root>/repolens-real-smoke-deepseek --force
```

This created:

```text
.opencode/plugins/repolens.ts
.lens/config.json
.lens/cerebrum.md
.lens/buglog.json
.lens/memory.md
.lens/token-ledger.json
REPOLENS.md
```

## Command

```bash
opencode run \
  --dir <tmp-root>/repolens-real-smoke-deepseek \
  --format json \
  --dangerously-skip-permissions \
  --model dee-seek/deepseek-v4-pro \
  'This is a RepoLens smoke test. Use the read tool to read src/api.ts as a full file. Then use the read tool again to read src/api.ts as a full file a second time. Then use read with offset/limit to read a small range from src/api.ts. Finally summarize any RepoLens warning/error you observed.'
```

## Expected

- First full-file read of `src/api.ts` succeeds.
- Second full-file read of `src/api.ts` is blocked by RepoLens.
- Range read with `offset` / `limit` succeeds.
- `.lens/token-ledger.json` records the successful reads and repeated-read block.
- `.lens/memory.md` records the range-read bypass and idle snapshot.

## Observed

First full-file read succeeded:

```text
tool=read
status=completed
input.filePath=<tmp-root>/repolens-real-smoke-deepseek/src/api.ts
```

Second full-file read was blocked:

```text
[RepoLens] Re-reading file: src/api.ts. Last read earlier this session.

Key sections:
  createAPI() at L1
  handleRequest() at L5
  class SmokeClient at L9

Prefer grep for targeted searches, or use offset/limit to read specific sections.
Full-file re-reads will continue to be blocked. Use offset/limit to bypass.
```

Range read succeeded:

```text
tool=read
status=completed
input.filePath=<tmp-root>/repolens-real-smoke-deepseek/src/api.ts
input.offset=5
input.limit=5
```

The model summarized the behavior correctly:

```text
RepoLens blocked the duplicate full-file read of src/api.ts to conserve context.
The third read with offset=5, limit=5 succeeded without any warning.
```

Ledger after the run:

```json
{
  "lifetime": {
    "total_tokens_estimated": 52,
    "total_reads": 2,
    "total_writes": 0,
    "total_sessions": 1,
    "anatomy_hits": 0,
    "repeated_reads_blocked": 1
  }
}
```

Memory after the run:

```text
Range read #3: src/api.ts (bypassed — has offset/limit)
Session ses_20448e2beffe8LD5Zv53mYVe3n idle — 2 reads, 0 writes, ~52 tok, 1 repeated reads
```

## Result

PASS with warning.

The real OpenCode run confirms that RepoLens can intercept real `read` tool calls, block a duplicate full-file read, surface key sections, allow a range read, and update the token ledger.

## Warning Found

The OpenCode log included this plugin loading error:

```text
service=plugin path=file://<tmp-root>/repolens-real-smoke-deepseek/.opencode/plugins/repolens.ts
error=patchText.split is not a function
failed to load plugin
```

Despite this log entry, RepoLens behavior was active during the run. The likely cause is that `src/plugin.ts` exports helper functions for unit tests, and OpenCode attempts to treat named exports as plugin functions. The core plugin export still appears to load, but this log entry is noisy and should be fixed before publishing.

Follow-up status:

- Fixed in source after this run: the production plugin entry now exports only the default OpenCode plugin function.
- Unit tests still exercise the same helper implementations through a test-only temporary module, so helper functions are no longer shipped as named plugin exports.
- Local export check after `repolens init` no longer shows helper names such as `extractApplyPatchPaths`, `parseAnatomy`, or `parseCerebrum`.
- Superseded by later clean CLI verification: the `dee-seek/deepseek-v4-flash` run below did not show `patchText.split is not a function` or `failed to load plugin`.

## Additional Run: Free Model

Date: 2026-05-06
OpenCode version: 1.14.30
Node version: v25.9.0
Model: opencode/minimax-m2.5-free

Fixture directory:

```text
<tmp-root>/repolens-real-smoke
```

Command:

```bash
opencode run \
  --dir <tmp-root>/repolens-real-smoke \
  --format json \
  --dangerously-skip-permissions \
  --model opencode/minimax-m2.5-free \
  'This is a RepoLens smoke test. Use the read tool to read src/api.ts as a full file. Then use the read tool again to read src/api.ts as a full file a second time. Then use read with offset/limit to read a small range from src/api.ts. Finally summarize any RepoLens warning/error you observed.'
```

Observed:

- First full-file read of `src/api.ts` succeeded.
- Second full-file read was blocked by RepoLens.
- Range read with `offset=9, limit=5` succeeded.
- The model summarized the warning correctly.

Second read error:

```text
[RepoLens] Re-reading file: src/api.ts. Last read earlier this session.

Key sections:
  createAPI() at L1
  handleRequest() at L5
  class SmokeClient at L9

Prefer grep for targeted searches, or use offset/limit to read specific sections.
Full-file re-reads will continue to be blocked. Use offset/limit to bypass.
```

Ledger after the free-model run:

```json
{
  "lifetime": {
    "total_tokens_estimated": 52,
    "total_reads": 2,
    "total_writes": 0,
    "total_sessions": 2,
    "anatomy_hits": 0,
    "repeated_reads_blocked": 1
  }
}
```

Note: this fixture includes one earlier failed OpenCode attempt using the default model, which returned `403 insufficient_balance` before any tool call. That failed attempt created a zero-token session in the same ledger. The successful `opencode/minimax-m2.5-free` session itself recorded `2 reads`, `0 writes`, `~52 tok`, and `1 repeated read`.

Memory after the free-model run:

```text
Range read #3: src/api.ts (bypassed — has offset/limit)
Session ses_2044a7111ffeIz7NkKdj7r7mqB idle — 2 reads, 0 writes, ~52 tok, 1 repeated reads
```

Result:

PASS with the same warning as the DeepSeek run.

The OpenCode log also included `patchText.split is not a function` while loading `.opencode/plugins/repolens.ts`, but RepoLens behavior was active and the duplicate full-file read was blocked. This warning was addressed in a follow-up source change by removing named helper function exports from the production plugin entry.

## Additional Run: OpenCode Desktop

Date: 2026-05-06
OpenCode Desktop version: 1.14.30
Node version used by local tooling: v25.9.0

Fixture directory:

```text
<desktop-smoke-workspace>
```

Setup command:

```bash
node bin/cli.js init --dir <desktop-smoke-workspace> --force
```

The user opened the fixture in OpenCode Desktop and ran this prompt manually:

```text
This is a RepoLens desktop smoke test. Use the read tool to read src/api.ts as a full file. Then use the read tool again to read src/api.ts as a full file a second time. Then use read with offset/limit to read a small range from src/api.ts. Finally summarize any RepoLens warning/error you observed.
```

Observed from `.lens/token-ledger.json`:

```json
{
  "lifetime": {
    "total_tokens_estimated": 53,
    "total_reads": 2,
    "total_writes": 0,
    "total_sessions": 1,
    "anatomy_hits": 3,
    "repeated_reads_blocked": 1
  }
}
```

Observed from `.lens/memory.md`:

```text
Session ses_2043565efffeo0UZ7yv20XL47S started
Range read #3: src/api.ts (bypassed — has offset/limit)
Session ses_2043565efffeo0UZ7yv20XL47S idle — 2 reads, 0 writes, ~53 tok, 1 repeated reads
```

Observed generated files:

```text
.lens/anatomy.md
.lens/session-briefing.md
.lens/token-ledger.json
.lens/memory.md
```

Result:

PASS.

The desktop run confirms that RepoLens works in OpenCode Desktop for the same read interception path: first full-file read succeeds, duplicate full-file read is blocked, range read succeeds, and ledger/memory/anatomy files are updated.

Desktop log notes:

```text
service=config dir=<desktop-smoke-workspace>/.opencode
background dependency install failed: @opencode-ai/plugin@local no matching version found
```

This did not prevent RepoLens from running. No `patchText.split is not a function` entry was found for the desktop smoke fixture in the latest OpenCode Desktop log.

## Additional Run: DeepSeek V4 Flash

Date: 2026-05-06
OpenCode version: 1.14.30
Node version: v25.9.0
Model: dee-seek/deepseek-v4-flash

Fixture directory:

```text
<tmp-root>/repolens-real-smoke-deepseek-flash
```

Command:

```bash
opencode run \
  --dir <tmp-root>/repolens-real-smoke-deepseek-flash \
  --format json \
  --dangerously-skip-permissions \
  --model dee-seek/deepseek-v4-flash \
  'This is a RepoLens smoke test. Use the read tool to read src/api.ts as a full file. Then use the read tool again to read src/api.ts as a full file a second time. Then use read with offset/limit to read a small range from src/api.ts. Finally summarize any RepoLens warning/error you observed.'
```

Observed:

- First full-file read of `src/api.ts` succeeded.
- Second full-file read was blocked by RepoLens.
- Range read with `offset=1, limit=3` succeeded.
- The model summarized the warning correctly.

Second read error:

```text
[RepoLens] Re-reading file: src/api.ts. Last read earlier this session.

Key sections:
  createAPI() at L1
  handleRequest() at L5
  class SmokeClient at L9

Prefer grep for targeted searches, or use offset/limit to read specific sections.
Full-file re-reads will continue to be blocked. Use offset/limit to bypass.
```

Ledger after the run:

```json
{
  "lifetime": {
    "total_tokens_estimated": 52,
    "total_reads": 2,
    "total_writes": 0,
    "total_sessions": 1,
    "anatomy_hits": 0,
    "repeated_reads_blocked": 1
  }
}
```

Memory after the run:

```text
Range read #3: src/api.ts (bypassed — has offset/limit)
Session ses_20430965fffeL6tBuQoPLDYmeJ idle — 2 reads, 0 writes, ~52 tok, 1 repeated reads
```

Result:

PASS.

The OpenCode log for this run showed the RepoLens plugin loading and did not include `patchText.split is not a function` or `failed to load plugin`.

## Additional Check: Fresh npm Install Smoke

Date: 2026-05-06
RepoLens version: 1.0.0
Node version: v25.9.0

Temporary paths:

```text
<tmp-root>/repolens-pack-out/repolens-1.0.0.tgz
<tmp-root>/repolens-fresh-install-smoke
<tmp-root>/repolens-fresh-target
```

Commands:

```bash
npm_config_cache=<tmp-root>/repolens-npm-cache npm pack --pack-destination <tmp-root>/repolens-pack-out
npm init -y
npm install --legacy-peer-deps --no-audit --no-fund <tmp-root>/repolens-pack-out/repolens-1.0.0.tgz
./node_modules/.bin/repolens init --dir <tmp-root>/repolens-fresh-target
node -e "import('<tmp-root>/repolens-fresh-install-smoke/node_modules/@chora404/repolens/dist/plugin.js').then(m=>console.log(Object.keys(m).join(',')))"
```

Observed package metadata:

```text
version=1.0.0
bin=bin/cli.js
main=dist/plugin.js
exports[.]=./dist/plugin.js
```

Installed package files included:

```text
LICENSE
README.md
bin/cli.js
dist/plugin.js
dist/plugin.d.ts
package.json
src/plugin.ts
templates/
```

`repolens init` created these target files:

```text
REPOLENS.md
.opencode/plugins/repolens.ts
.lens/token-ledger.json
.lens/config.json
.lens/cerebrum.md
.lens/buglog.json
.lens/memory.md
```

Compiled plugin export check:

```text
default
```

Result:

PASS.

The packed npm artifact can be installed into a clean consumer project, the `repolens` binary works, starter files are copied correctly, and the production plugin entry exposes only the OpenCode plugin default export. Temporary smoke-test paths were removed after this evidence was recorded.
