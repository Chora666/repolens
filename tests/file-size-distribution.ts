import * as fs from "node:fs"
import * as path from "node:path"

interface LensConfig {
  token_estimation_ratio?: number
  ignore_patterns?: string[]
  ignore_extensions?: string[]
  max_scan_files?: number
}

interface FileEntry {
  relPath: string
  ext: string
  dir: string
  bytes: number
  tokens: number
}

const args = process.argv.slice(2)

function argValue(name: string, fallback?: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1) return fallback
  return args[idx + 1] ?? fallback
}

const targetDir = path.resolve(argValue("--dir", ".")!)
const outPath = argValue("--out")
const thresholds = (argValue("--thresholds", "8000,15000,30000") ?? "")
  .split(",")
  .map((v) => Number(v.trim()))
  .filter((v) => Number.isFinite(v) && v > 0)
  .sort((a, b) => a - b)
const topN = Number(argValue("--top", "25"))

function loadJson(filePath: string): LensConfig | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"))
  } catch {
    return undefined
  }
}

function loadConfig(projectDir: string): Required<LensConfig> {
  const templateConfig = loadJson(path.resolve("templates/config.json"))
  const projectConfig = loadJson(path.join(projectDir, ".lens", "config.json"))
  const cfg = { ...templateConfig, ...projectConfig }
  const ignorePatterns = [
    ...(templateConfig?.ignore_patterns ?? []),
    ...(projectConfig?.ignore_patterns ?? []),
  ]
  const ignoreExtensions = [
    ...(templateConfig?.ignore_extensions ?? []),
    ...(projectConfig?.ignore_extensions ?? []),
  ]

  return {
    token_estimation_ratio: typeof cfg.token_estimation_ratio === "number" && cfg.token_estimation_ratio > 0
      ? cfg.token_estimation_ratio
      : 4,
    ignore_patterns: [...new Set(ignorePatterns)],
    ignore_extensions: [...new Set(ignoreExtensions)],
    max_scan_files: typeof cfg.max_scan_files === "number" && cfg.max_scan_files > 0
      ? cfg.max_scan_files
      : 1000,
  }
}

function isIgnored(relPath: string, config: Required<LensConfig>): boolean {
  const parts = relPath.split(path.sep)
  if (parts.some((part) => config.ignore_patterns.includes(part))) return true
  const lower = relPath.toLowerCase()
  if (config.ignore_extensions.some((ext) => lower.endsWith(ext.toLowerCase()))) return true
  if (path.basename(relPath).startsWith(".") && !relPath.startsWith(".lens")) return true
  return false
}

function walk(projectDir: string, config: Required<LensConfig>): FileEntry[] {
  const entries: FileEntry[] = []

  function visit(dir: string) {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    items.sort((a, b) => a.name.localeCompare(b.name))

    for (const item of items) {
      const absPath = path.join(dir, item.name)
      const relPath = path.relative(projectDir, absPath)
      if (isIgnored(relPath, config)) continue

      if (item.isDirectory()) {
        visit(absPath)
        continue
      }
      if (!item.isFile()) continue

      try {
        const stat = fs.statSync(absPath)
        entries.push({
          relPath,
          ext: path.extname(relPath).toLowerCase() || "(none)",
          dir: path.dirname(relPath) === "." ? "root" : path.dirname(relPath),
          bytes: stat.size,
          tokens: Math.ceil(stat.size / config.token_estimation_ratio),
        })
      } catch {
      }
    }
  }

  visit(projectDir)
  return entries.sort((a, b) => b.tokens - a.tokens)
}

function groupBy(entries: FileEntry[], key: (entry: FileEntry) => string) {
  const groups = new Map<string, { files: number; tokens: number; bytes: number }>()
  for (const entry of entries) {
    const id = key(entry)
    const current = groups.get(id) ?? { files: 0, tokens: 0, bytes: 0 }
    current.files++
    current.tokens += entry.tokens
    current.bytes += entry.bytes
    groups.set(id, current)
  }
  return [...groups.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => b.tokens - a.tokens)
}

function fmt(num: number): string {
  return new Intl.NumberFormat("en-US").format(num)
}

function renderReport(projectDir: string, config: Required<LensConfig>, entries: FileEntry[]): string {
  const totalTokens = entries.reduce((sum, entry) => sum + entry.tokens, 0)
  const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
  const thresholdRows = thresholds.map((threshold) => {
    const matched = entries.filter((entry) => entry.tokens >= threshold)
    const tokens = matched.reduce((sum, entry) => sum + entry.tokens, 0)
    const pct = totalTokens > 0 ? Math.round((tokens / totalTokens) * 100) : 0
    return `| >= ${fmt(threshold)} tok | ${fmt(matched.length)} | ${fmt(tokens)} | ${pct}% |`
  })

  const topFiles = entries.slice(0, topN).map((entry, idx) =>
    `| ${idx + 1} | \`${entry.relPath}\` | ${fmt(entry.tokens)} | ${fmt(entry.bytes)} |`,
  )

  const extRows = groupBy(entries, (entry) => entry.ext).slice(0, 15).map((entry) =>
    `| \`${entry.name}\` | ${fmt(entry.files)} | ${fmt(entry.tokens)} | ${fmt(entry.bytes)} |`,
  )

  const dirRows = groupBy(entries, (entry) => entry.dir.split(path.sep).slice(0, 2).join(path.sep)).slice(0, 15).map((entry) =>
    `| \`${entry.name}\` | ${fmt(entry.files)} | ${fmt(entry.tokens)} | ${fmt(entry.bytes)} |`,
  )

  const filesAbove8k = entries.filter((entry) => entry.tokens >= 8000).length
  const suggestedThreshold = filesAbove8k === 0
    ? "No tracked file exceeds 8k tokens; use a lower threshold only for experiments."
    : filesAbove8k <= 10
      ? "8k tokens should trigger on the largest files without affecting most reads."
      : "Consider starting with warn at 8k and strict at a higher threshold after real evals."

  return `# File Size Distribution

Date: ${new Date().toISOString().slice(0, 10)}
Target: \`${projectDir}\`
Token ratio: 1 token ~= ${config.token_estimation_ratio} bytes/chars

## Summary

| Metric | Value |
|---|---:|
| Tracked files | ${fmt(entries.length)} |
| Total estimated tokens | ${fmt(totalTokens)} |
| Total bytes | ${fmt(totalBytes)} |
| Ignore patterns | ${config.ignore_patterns.map((v) => `\`${v}\``).join(", ")} |
| Ignore extensions | ${config.ignore_extensions.map((v) => `\`${v}\``).join(", ")} |

## Thresholds

| Threshold | Files | Tokens | Share |
|---|---:|---:|---:|
${thresholdRows.join("\n")}

## Largest Files

| Rank | File | Est. Tokens | Bytes |
|---:|---|---:|---:|
${topFiles.join("\n")}

## Extension Hotspots

| Extension | Files | Est. Tokens | Bytes |
|---|---:|---:|---:|
${extRows.join("\n")}

## Directory Hotspots

| Directory | Files | Est. Tokens | Bytes |
|---|---:|---:|---:|
${dirRows.join("\n")}

## Recommendation

${suggestedThreshold}
`
}

const config = loadConfig(targetDir)
const entries = walk(targetDir, config)
const report = renderReport(targetDir, config, entries)

if (outPath) {
  const absOut = path.resolve(outPath)
  fs.mkdirSync(path.dirname(absOut), { recursive: true })
  fs.writeFileSync(absOut, report, "utf-8")
  console.log(absOut)
} else {
  console.log(report)
}
