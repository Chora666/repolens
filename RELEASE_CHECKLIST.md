# RepoLens Release Checklist

Use this before publishing `@chora404/repolens`.

## Preflight

- Confirm `README.md` uses GitHub links for docs that are not shipped in the npm package.
- Confirm eval fixtures and reports are synthetic only.
- Confirm no private source code, machine-local paths, raw JSONL logs, `.env` files, or `.DS_Store` files are present.
- Confirm `package.json` has `publishConfig.access: "public"` for the scoped npm package.

## Required Checks

```bash
npm run typecheck
npm run build
npm run test:unit
npm test
npm run trap:v2:real-eval -- --dry-run
REPOLENS_TRAP_CASE=v3 npm run trap:v3:real-eval -- --dry-run
npm pack --dry-run
```

## Privacy Scan

```bash
rg -n --hidden --glob '!node_modules/**' '<fill-in-private-patterns-before-running>' .
find . -path './node_modules' -prune -o \( -iname '*DS_Store*' -o -iname '*.jsonl' -o -iname '*.stderr' -o -iname '.env' -o -iname '*.local' -o -iname '*.tgz' \) -print
```

Both commands should return no project-sensitive files or content.

## Publish

```bash
npm whoami
npm publish
```

`prepublishOnly` runs typecheck, unit tests, and integration tests automatically. `prepack` rebuilds `dist/`.

## Post-Publish Smoke

```bash
npm view @chora404/repolens version
npx @chora404/repolens init --dry-run
```
