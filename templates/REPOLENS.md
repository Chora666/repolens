# RepoLens

RepoLens is your project-aware context optimizer for OpenCode. It builds and maintains a living knowledge base of your codebase so you can work smarter with fewer tokens.

## CRITICAL — Read at session start

Before doing anything else, read `.lens/session-briefing.md`. This file contains what changed since your last session, recent git commits, working tree status, and file edit hotspots.

## How to Use RepoLens

### Before Reading a File

Check `.lens/anatomy.md` first to understand what a file contains and its token size. This helps you decide whether a full read is necessary or a targeted read is enough.

```
BEFORE: read src/large-module.ts
CHECK:  .lens/anatomy.md → "large-module.ts — Config loader with Zod (~2300 tok)"
DECIDE: Is 2300 tokens justified? If only needing one type, consider grep instead.
```

### Large File Read Protocol

Before reading files estimated above ~8k tokens:

1. Check `.lens/anatomy.md` for the file map, token estimate, and known sections.
2. Use `grep` for symbols, callbacks, identifiers, class names, or error text.
3. Use `read` with `offset`/`limit` around the relevant matches.
4. Use a full-file read only when the whole file is genuinely needed.

Good pattern:

```text
grep "handler|callback|registry" src/large-module.cpp
read src/large-module.cpp offset=<match-line-20> limit=80
```

Avoid this pattern for large files:

```text
read src/large-module.cpp
read src/processor.cpp
```

### When RepoLens Blocks or Warns

If RepoLens warns or blocks a read, do not blindly retry the same full read.
Use the suggested sections, `grep`, or `offset`/`limit` first. Retry the full
read only when the complete file is truly necessary for the task.

### When Corrected by the User

If the user corrects a mistake or expresses a preference, immediately update `.lens/cerebrum.md`:

- Add to **Do-Not-Repeat** section if it was an error
- Add to **User Preferences** section if it was a style/pattern choice
- Add to **Key Learnings** section if it was a project-specific discovery

### When Fixing a Bug

1. Search `.lens/buglog.json` for similar past issues
2. After fixing, append a new entry to `buglog.json`

```json
{
  "id": "bug-<next-number>",
  "error_message": "<the error>",
  "file": "<file where bug occurred>",
  "root_cause": "<why it happened>",
  "fix": "<what fixed it>",
  "tags": ["<relevant keywords>"],
  "date": "<ISO date>"
}
```

### Token Awareness

- `.lens/anatomy.md` shows estimated token counts for every tracked file
- `.lens/token-ledger.json` tracks lifetime and per-session token usage
- Avoid re-reading the same file in a session — RepoLens will warn you
- Prefer targeted reads (`grep`, `offset`/`limit`) over full-file reads for large files
- Treat full-file reads above ~8k tokens as an explicit decision, not the default

### .lens/ File Overview

| File | Purpose | Auto-Maintained? |
|------|---------|:---:|
| `anatomy.md` | Project file map with descriptions and token estimates | Yes |
| `cerebrum.md` | Learning memory: mistakes, preferences, project knowledge | No — update it yourself |
| `buglog.json` | Bug fix history, searchable | No — update it yourself |
| `memory.md` | Chronological action log | Yes |
| `token-ledger.json` | Token usage tracking and session history | Yes |
| `session-briefing.md` | Previous session summary, recent commits, working tree, edit hotspots | Yes |
| `config.json` | RepoLens configuration | No |

### Commands You Can Use

- `cat .lens/anatomy.md` — View project file map
- `cat .lens/cerebrum.md` — View learning memory
- `cat .lens/token-ledger.json` — View token usage stats
- `cat .lens/buglog.json` — Search bug history (use jq or grep)
