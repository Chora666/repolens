import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"

const LENS_DIR = ".lens"
const CONFIG_FILE = "config.json"
const ANATOMY_FILE = "anatomy.md"
const CEREBRUM_FILE = "cerebrum.md"
const BUGLOG_FILE = "buglog.json"
const MEMORY_FILE = "memory.md"
const SESSIONS_BRIEFING_FILE = "session-briefing.md"
const TOKEN_LEDGER_FILE = "token-ledger.json"
const MAX_ANATOMY_SECTIONS_PER_FILE = 12
const ANATOMY_SECTION_TOKEN_THRESHOLD = 1000
const MAX_LEDGER_EVENTS_PER_SESSION = 100

interface LensConfig {
  version: string
  enabled: boolean
  token_estimation_ratio: number
  ignore_patterns: string[]
  ignore_extensions: string[]
  auto_scan_on_init: boolean
  auto_update_anatomy: boolean
  max_scan_files: number
  mode?: "strict" | "warn" | "adaptive"
  adaptive_threshold?: number
  large_file_policy?: "off" | "warn" | "strict" | "adaptive"
  large_file_threshold_tokens?: number
  large_file_allow_globs?: string[]
}

interface TokenLedgerSession {
  session_id: string
  started_at: string
  ended_at: string
  tokens_estimated: number
  reads: number
  writes: number
  anatomy_hits: number
  repeated_reads_blocked: number
  full_reads: number
  range_reads: number
  large_full_reads_warned: number
  large_full_reads_blocked: number
  summary: TokenLedgerSummary
  events: TokenLedgerEvent[]
}

interface TokenLedgerSummary {
  reads: number
  full_reads: number
  range_reads: number
  writes: number
  large_full_reads_warned: number
  large_full_reads_blocked: number
  repeated_reads_blocked: number
  estimated_tokens_intercepted: number
  estimated_tokens_avoided: number
}

interface TokenLedgerEvent {
  at: string
  tool: string
  file?: string
  read_kind?: "full" | "range"
  outcome: "completed" | "warned" | "blocked"
  reason?: "large_file" | "repeated_read" | "cerebrum"
  offset?: number
  limit?: number
  tokens_estimated?: number
}

interface TokenLedger {
  lifetime: {
    total_tokens_estimated: number
    total_reads: number
    total_writes: number
    total_sessions: number
    anatomy_hits: number
    repeated_reads_blocked: number
    full_reads: number
    range_reads: number
    large_full_reads_warned: number
    large_full_reads_blocked: number
  }
  sessions: TokenLedgerSession[]
}

interface BugEntry {
  id: string
  error_message: string
  file: string
  root_cause: string
  fix: string
  tags: string[]
  date?: string
}

interface ConfigCacheEntry {
  config: LensConfig
  mtimeMs: number
}

let loadedConfigs: Map<string, ConfigCacheEntry> = new Map()
interface ReadRecord { count: number; lastReadTime: number }

function getLensDir(projectDir: string): string {
  return path.join(projectDir, LENS_DIR)
}

function normalizePath(filePath: string, projectDir: string): string {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(projectDir, filePath)
  return path.relative(projectDir, absPath)
}

function extractApplyPatchPaths(patchText: string, projectDir: string): string[] {
  const paths = new Set<string>()
  const marker = /^\*\*\* (?:(Add|Update|Delete) File|Move(?: to| File)): (.+)$/

  for (const line of patchText.split("\n")) {
    const match = line.match(marker)
    if (!match) continue

    const rawPath = match[2].trim()
    if (!rawPath || rawPath === "/dev/null") continue
    paths.add(normalizePath(rawPath, projectDir))
  }

  return [...paths]
}

function shouldBlock(config: LensConfig, estimatedTokens?: number): boolean {
  if (config.mode === "warn") return false
  if (config.mode === "adaptive" && estimatedTokens !== undefined && estimatedTokens < (config.adaptive_threshold ?? 500)) return false
  return true
}

function normalizeForGlob(relPath: string): string {
  return relPath.split(path.sep).join("/")
}

function globMatches(pattern: string, relPath: string): boolean {
  const normalizedPattern = normalizeForGlob(pattern.trim())
  const normalizedPath = normalizeForGlob(relPath)
  if (!normalizedPattern) return false
  if (!normalizedPattern.includes("*")) {
    return normalizedPath === normalizedPattern || normalizedPath.endsWith(`/${normalizedPattern}`)
  }

  let source = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  source = source.replace(/\*\*/g, "__REPOLENS_DOUBLE_STAR__")
  source = source.replace(/\*/g, "[^/]*")
  source = source.replace(/__REPOLENS_DOUBLE_STAR__/g, ".*")
  return new RegExp(`^${source}$`).test(normalizedPath)
}

function isLargeFileAllowed(filePath: string, config: LensConfig): boolean {
  if (filePath === LENS_DIR || filePath.startsWith(`${LENS_DIR}${path.sep}`) || normalizeForGlob(filePath).startsWith(`${LENS_DIR}/`)) {
    return true
  }
  return (config.large_file_allow_globs ?? []).some((pattern) => globMatches(pattern, filePath))
}

function hasReadRange(args: Record<string, unknown> | undefined): boolean {
  return args?.offset !== undefined || args?.limit !== undefined
}

function sectionLineNumber(section: string): number | undefined {
  const match = section.match(/\bL(\d+)\b/)
  if (!match) return undefined
  const line = Number(match[1])
  return Number.isFinite(line) ? line : undefined
}

function renderSectionHints(filePath: string, sections: string[] | undefined): string {
  if (!sections || sections.length === 0) return ""
  const knownSections = sections.slice(0, 6)
  const rangeHints = knownSections
    .map((section) => ({ section, line: sectionLineNumber(section) }))
    .filter((hint): hint is { section: string; line: number } => hint.line !== undefined)
    .map((hint) => ({
      ...hint,
      offset: Math.max(0, hint.line - 20),
      limit: hint.line < 80 ? 120 : 100,
    }))
    .filter((hint, index, all) =>
      all.findIndex((other) => other.offset === hint.offset && other.limit === hint.limit) === index,
    )
    .slice(0, 3)
    .map((hint) => `  ${hint.section} -> read ${filePath} offset=${hint.offset} limit=${hint.limit}`)

  let block = "\n\nKnown sections:\n  " + knownSections.join("\n  ")
  if (rangeHints.length > 0) {
    block += "\n\nSuggested range reads:\n" + rangeHints.join("\n")
  }
  return block
}

function largeFileMessage(filePath: string, tokens: number, threshold: number, strictRetry: boolean, sections?: string[]): string {
  const retryLine = strictRetry
    ? "\n\nIf the whole file is genuinely needed, retry this same full read once; the retry will be allowed."
    : ""
  return `[RepoLens] Large file read: ${filePath} (~${tokens} tok, threshold ${threshold}).` +
    renderSectionHints(filePath, sections) +
    "\n\nSuggested cheaper path:" +
    "\n- Check .lens/anatomy.md for file map and section hints." +
    "\n- Use grep for symbols, callbacks, parameter IDs, class names, or error text." +
    "\n- Use offset/limit around relevant matches." +
    "\n\nFull-file reads of large files can be expensive. Use a range read unless the whole file is genuinely needed." +
    "\nDo not reduce task quality to save tokens. If grep/range context is insufficient to verify the requested change, retry the full read." +
    retryLine
}

function loadConfig(projectDir: string): LensConfig {
  const configPath = path.join(getLensDir(projectDir), CONFIG_FILE)
  let mtimeMs = -1
  try {
    mtimeMs = fs.statSync(configPath).mtimeMs
  } catch {
  }

  const cached = loadedConfigs.get(projectDir)
  if (cached && cached.mtimeMs === mtimeMs) return cached.config

  let cfg: LensConfig
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
  } catch {
    cfg = {
      version: "1.0.0",
      enabled: true,
      token_estimation_ratio: 4,
      ignore_patterns: [
        "node_modules",
        ".git",
        ".opencode",
        "dist",
        "build",
        ".next",
        "coverage",
        ".lens",
        "target",
        ".turbo",
        ".cache",
        ".parcel-cache",
        "vendor",
        "bower_components",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "Builds",
        "DerivedData",
      ],
      ignore_extensions: [
        ".lock",
        ".log",
        ".map",
        ".min.js",
        ".min.css",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".svg",
        ".ico",
        ".woff",
        ".woff2",
        ".ttf",
        ".otf",
        ".eot",
        ".mp3",
        ".mp4",
        ".wav",
        ".ogg",
        ".webm",
        ".pdf",
        ".doc",
        ".docx",
        ".ppt",
        ".pptx",
        ".xls",
        ".xlsx",
        ".zip",
        ".tar",
        ".gz",
        ".7z",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".wasm",
        ".o",
        ".d",
        ".dia",
        ".resp",
        ".dat",
      ],
      auto_scan_on_init: true,
      auto_update_anatomy: true,
      max_scan_files: 1000,
      mode: "adaptive",
      adaptive_threshold: 500,
      large_file_policy: "warn",
      large_file_threshold_tokens: 8000,
      large_file_allow_globs: [],
    }
  }

  cfg.mode ??= "adaptive"
  cfg.adaptive_threshold ??= 500
  cfg.large_file_policy ??= "warn"
  cfg.large_file_threshold_tokens ??= 8000
  cfg.large_file_allow_globs ??= []

  const validModes = ["strict", "warn", "adaptive"]
  if (cfg.mode && !validModes.includes(cfg.mode)) {
    console.warn(`[repolens] Invalid mode "${cfg.mode}" — falling back to "adaptive". Valid: ${validModes.join(", ")}`)
    cfg.mode = "adaptive"
  }
  if (cfg.token_estimation_ratio && (typeof cfg.token_estimation_ratio !== "number" || cfg.token_estimation_ratio <= 0)) {
    console.warn(`[repolens] Invalid token_estimation_ratio — falling back to 4`)
    cfg.token_estimation_ratio = 4
  }
  const validLargeFilePolicies = ["off", "warn", "strict", "adaptive"]
  if (cfg.large_file_policy && !validLargeFilePolicies.includes(cfg.large_file_policy)) {
    console.warn(`[repolens] Invalid large_file_policy "${cfg.large_file_policy}" — falling back to "warn". Valid: ${validLargeFilePolicies.join(", ")}`)
    cfg.large_file_policy = "warn"
  }
  if (cfg.large_file_threshold_tokens !== undefined &&
      (typeof cfg.large_file_threshold_tokens !== "number" || cfg.large_file_threshold_tokens <= 0)) {
    console.warn(`[repolens] Invalid large_file_threshold_tokens — falling back to 8000`)
    cfg.large_file_threshold_tokens = 8000
  }
  if (cfg.large_file_allow_globs !== undefined && !Array.isArray(cfg.large_file_allow_globs)) {
    console.warn(`[repolens] Invalid large_file_allow_globs — falling back to []`)
    cfg.large_file_allow_globs = []
  }

  loadedConfigs.set(projectDir, { config: cfg, mtimeMs })
  return cfg
}

function estimateTokens(content: string, ratio: number): number {
  return Math.ceil(content.length / ratio)
}

function estimateFileTokens(filePath: string, ratio: number): number {
  try {
    const stat = fs.statSync(filePath)
    return Math.ceil(stat.size / ratio)
  } catch {
    return 0
  }
}

function isIgnored(relPath: string, config: LensConfig): boolean {
  const parts = relPath.split(path.sep)
  if (parts.some((p) => config.ignore_patterns.includes(p))) return true
  if (config.ignore_extensions.some((e) => relPath.toLowerCase().endsWith(e.toLowerCase()))) return true
  if (path.basename(relPath).startsWith(".") && !relPath.startsWith(".lens")) return true
  return false
}

function generateFileDescription(filePath: string): string {
  const name = path.basename(filePath)
  const dir = path.dirname(filePath)
  if (dir === ".") return name

  try {
    const raw = fs.readFileSync(filePath, "utf-8").slice(0, 200)
    const firstLine = raw.split("\n")[0].trim()
    if (firstLine.startsWith("//") || firstLine.startsWith("#") || firstLine.startsWith("--")) {
      const desc = firstLine.replace(/^[/#\-]{1,3}\s*/, "").trim()
      if (desc.length > 3 && desc.length < 80) return desc
    }
    if (firstLine.startsWith("import") || firstLine.startsWith("package") || firstLine.startsWith("use ")) {
      return firstLine.slice(0, 60)
    }
  } catch {
  }

  return name
}

function extractSections(filePath: string): string[] {
  const sections: { name: string; line: number; kind: string }[] = []
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const lines = content.split("\n")
    const patterns: { regex: RegExp; nameIndex: number; kind: string }[] = [
      { regex: /^\s*(export\s+)?(async\s+)?function\s+(\w+)/, nameIndex: 3, kind: "fn" },
      { regex: /^\s*(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/, nameIndex: 2, kind: "fn" },
      { regex: /^\s*(export\s+)?class\s+(\w+)/, nameIndex: 2, kind: "class" },
      { regex: /^\s*(export\s+)?(interface|type)\s+(\w+)/, nameIndex: 3, kind: "type" },
      { regex: /^\s*(template\s*<[^>]+>\s*)?(class|struct)\s+(\w+)/, nameIndex: 3, kind: "class" },
      { regex: /^\s*(?:[\w:<>,~*&\s]+)\s+([A-Za-z_~]\w*(?:::[A-Za-z_~]\w*)+)\s*\(/, nameIndex: 1, kind: "fn" },
      { regex: /^\s*([A-Za-z_~]\w*(?:::[A-Za-z_~]\w*)+)\s*\(/, nameIndex: 1, kind: "fn" },
      { regex: /^\s*(export\s+default\s+)?(async\s+)?function\s+(\w+)/, nameIndex: 3, kind: "fn" },
      { regex: /^\s*(async\s+)?def\s+(\w+)/, nameIndex: 2, kind: "fn" },
      { regex: /^\s*class\s+(\w+)\s*(\(|:)/, nameIndex: 1, kind: "class" },
      { regex: /^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?(\w+)/, nameIndex: 2, kind: "fn" },
      { regex: /^\s*type\s+(\w+)\s+(struct|interface)/, nameIndex: 1, kind: "type" },
      { regex: /^\s*(pub(\s*\(\s*\w+\s*\))?\s+)?(async\s+)?fn\s+(\w+)/, nameIndex: 4, kind: "fn" },
      { regex: /^\s*(pub\s+)?struct\s+(\w+)/, nameIndex: 2, kind: "type" },
      { regex: /^\s*(pub\s+)?enum\s+(\w+)/, nameIndex: 2, kind: "type" },
      { regex: /^\s*(pub\s+)?trait\s+(\w+)/, nameIndex: 2, kind: "type" },
      { regex: /^\s*(pub\s+)?impl\b/, nameIndex: 0, kind: "impl" },
    ]

    const seen = new Set<string>()
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const pat of patterns) {
        const m = line.match(pat.regex)
        if (!m) continue
        const name = pat.nameIndex > 0 ? m[pat.nameIndex] || "" : ""
        if (pat.kind === "impl") {
          const traitMatch = line.match(/impl\s*(?:<[^>]*>\s*)?(\S+)/)
          const implName = traitMatch ? `impl ${traitMatch[1]}` : "impl block"
          if (!seen.has(implName)) {
            seen.add(implName)
            sections.push({ name: implName, line: i + 1, kind: "impl" })
          }
          break
        }
        if (name && name.length > 1 &&
            name !== "return" && name !== "if" && name !== "for" &&
            name !== "while" && name !== "function" && name !== "interface" &&
            name !== "type" && name !== "default" && name !== "export" && name !== "async") {
          if (!seen.has(name)) {
            seen.add(name)
            sections.push({ name, line: i + 1, kind: pat.kind })
          }
        }
        break
      }
      if (sections.length >= 15) break
    }
  } catch {
  }

  return sections.map((s) => {
    if (s.kind === "class") return `class ${s.name} at L${s.line}`
    if (s.kind === "type") return `type ${s.name} at L${s.line}`
    if (s.kind === "impl") return `${s.name} at L${s.line}`
    return `${s.name}() at L${s.line}`
  })
}

function renderAnatomyEntry(absPath: string, relPath: string, desc: string, tokens: number): string {
  let block = `- \`${path.basename(relPath)}\` — ${desc} (~${tokens} tok)\n`
  if (tokens >= ANATOMY_SECTION_TOKEN_THRESHOLD) {
    const sections = extractSections(absPath).slice(0, MAX_ANATOMY_SECTIONS_PER_FILE)
    if (sections.length > 0) {
      block += "  sections:\n"
      for (const section of sections) {
        block += `  - ${section}\n`
      }
    }
  }
  return block
}

function scanProject(projectDir: string): string {
  const config = loadConfig(projectDir)
  const ratio = config.token_estimation_ratio

  const entries: { absPath: string; relPath: string; desc: string; tokens: number }[] = []
  const dirs = new Map<string, { absPath: string; relPath: string; desc: string; tokens: number }[]>()

  function walk(dir: string) {
    if (entries.length >= config.max_scan_files) return
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const item of items) {
      if (entries.length >= config.max_scan_files) return
      const absPath = path.join(dir, item.name)
      const relPath = path.relative(projectDir, absPath)

      if (isIgnored(relPath, config)) continue

      if (item.isDirectory()) {
        walk(absPath)
      } else if (item.isFile()) {
        const tokens = estimateFileTokens(absPath, ratio)
        const desc = generateFileDescription(absPath)
        entries.push({ absPath, relPath, desc, tokens })
      }
    }
  }

  walk(projectDir)

  for (const e of entries) {
    const dirKey = path.dirname(e.relPath) || "."
    if (!dirs.has(dirKey)) dirs.set(dirKey, [])
    dirs.get(dirKey)!.push(e)
  }

  const sortedDirs = [...dirs.keys()].sort((a, b) => {
    if (a === ".") return -1
    if (b === ".") return 1
    return a.localeCompare(b)
  })

  let md = "# Anatomy — Project File Map\n"
  md += `*Auto-generated. Last scan: ${new Date().toISOString()}*\n`
  md += `*Total files indexed: ${entries.length}*\n\n`

  for (const dirKey of sortedDirs) {
    const files = dirs.get(dirKey)!
    if (sortedDirs.length > 1 || dirKey !== ".") {
      md += `## ${dirKey === "." ? "root" : dirKey}\n`
    }
    for (const f of files) {
      md += renderAnatomyEntry(f.absPath, f.relPath, f.desc, f.tokens)
    }
    md += "\n"
  }

  return md
}

function parseAnatomy(projectDir: string): Map<string, { desc: string; tokens: number; sections: string[] }> {
  const map = new Map<string, { desc: string; tokens: number; sections: string[] }>()
  const anatomyPath = path.join(getLensDir(projectDir), ANATOMY_FILE)

  try {
    const content = fs.readFileSync(anatomyPath, "utf-8")
    const lines = content.split("\n")
    let currentDir = ""
    let currentFilePath = ""
    let inSections = false

    for (const line of lines) {
      if (line.startsWith("## ")) {
        currentDir = line.slice(3).trim()
        if (currentDir === "root") currentDir = "."
        currentFilePath = ""
        inSections = false
        continue
      }
      const match = line.match(/^- `([^`]+)` — (.+) \(~(\d+) tok\)$/)
      if (match) {
        const fileName = match[1]
        const desc = match[2]
        const tokens = parseInt(match[3], 10)
        const fPath = currentDir ? path.join(currentDir, fileName) : fileName
        map.set(fPath, { desc, tokens, sections: [] })
        currentFilePath = fPath
        inSections = false
        continue
      }
      if (currentFilePath && line.trim() === "sections:") {
        inSections = true
        continue
      }
      if (inSections) {
        const sectionMatch = line.match(/^  - (.+)$/)
        if (sectionMatch) {
          map.get(currentFilePath)?.sections.push(sectionMatch[1])
          continue
        }
        if (!line.startsWith("  ")) {
          inSections = false
        }
      }
    }
  } catch {
  }

  return map
}

function updateAnatomyEntry(projectDir: string, filePath: string) {
  const config = loadConfig(projectDir)
  if (!config.auto_update_anatomy) return

  const anatomyPath = path.join(getLensDir(projectDir), ANATOMY_FILE)
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath)

  if (isIgnored(filePath, config)) return
  if (!fs.existsSync(absPath)) return

  const ratio = config.token_estimation_ratio
  const tokens = estimateFileTokens(absPath, ratio)
  const desc = generateFileDescription(absPath)

  try {
    let content = fs.readFileSync(anatomyPath, "utf-8")
    const dirKey = path.dirname(filePath) === "." ? "root" : (path.dirname(filePath) || "root")
    const fileName = path.basename(filePath)
    const newBlock = renderAnatomyEntry(absPath, filePath, desc, tokens).trimEnd()

    const escapedFile = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const existingRegex = new RegExp(`^- \`${escapedFile}\` — .+ \\(~\\d+ tok\\)(?:\\n  sections:\\n(?:  - .+\\n?)*)?`, "m")

    const dirHeader = `## ${dirKey}\n`
    const dirIdx = content.indexOf(dirHeader)

    if (dirIdx !== -1) {
      const afterHeader = dirIdx + dirHeader.length
      const nextHeader = content.indexOf("\n## ", afterHeader)
      const sectionEnd = nextHeader !== -1 ? nextHeader : content.length
      const section = content.slice(dirIdx, sectionEnd)

      if (existingRegex.test(section)) {
        content = content.slice(0, dirIdx) +
          section.replace(existingRegex, newBlock) +
          content.slice(sectionEnd)
      } else {
        content = content.slice(0, dirIdx) +
          section + newBlock + "\n" +
          content.slice(sectionEnd)
      }
    } else {
      content += `\n## ${dirKey}\n${newBlock}\n`
    }

    fs.writeFileSync(anatomyPath, content, "utf-8")
  } catch {
    console.warn("[repolens] Failed to update anatomy entry for", filePath)
  }
}

function removeAnatomyEntry(projectDir: string, filePath: string) {
  const config = loadConfig(projectDir)
  if (!config.auto_update_anatomy) return

  const anatomyPath = path.join(getLensDir(projectDir), ANATOMY_FILE)
  const dirKey = path.dirname(filePath) === "." ? "root" : (path.dirname(filePath) || "root")
  const fileName = path.basename(filePath)
  const escapedFile = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const existingRegex = new RegExp(`^- \`${escapedFile}\` — .+ \\(~\\d+ tok\\)(?:\\n  sections:\\n(?:  - .+\\n?)*)?\\n?`, "m")

  try {
    let content = fs.readFileSync(anatomyPath, "utf-8")
    const dirHeader = `## ${dirKey}\n`
    const dirIdx = content.indexOf(dirHeader)
    if (dirIdx === -1) return

    const afterHeader = dirIdx + dirHeader.length
    const nextHeader = content.indexOf("\n## ", afterHeader)
    const sectionEnd = nextHeader !== -1 ? nextHeader : content.length
    const section = content.slice(dirIdx, sectionEnd)
    if (!existingRegex.test(section)) return

    content = content.slice(0, dirIdx) +
      section.replace(existingRegex, "") +
      content.slice(sectionEnd)
    fs.writeFileSync(anatomyPath, content, "utf-8")
  } catch {
    console.warn("[repolens] Failed to remove anatomy entry for", filePath)
  }
}

function parseCerebrum(projectDir: string): string[] {
  const cerebrumPath = path.join(getLensDir(projectDir), CEREBRUM_FILE)
  try {
    const content = fs.readFileSync(cerebrumPath, "utf-8")
    const lines = content.split("\n")
    const warnings: string[] = []
    let inDoNotRepeat = false

    for (const line of lines) {
      if (line.startsWith("## Do-Not-Repeat")) {
        inDoNotRepeat = true
        continue
      }
      if (inDoNotRepeat && line.startsWith("## ")) {
        inDoNotRepeat = false
        continue
      }
      if (inDoNotRepeat && line.startsWith("- ") && line.length > 3) {
        const trimmed = line.slice(2).trim()
        if (trimmed && !trimmed.startsWith("_") && !trimmed.startsWith("<!--")) {
          warnings.push(trimmed)
        }
      }
    }
    return warnings
  } catch {
    return []
  }
}

function loadBuglog(projectDir: string): BugEntry[] {
  const buglogPath = path.join(getLensDir(projectDir), BUGLOG_FILE)
  try {
    return JSON.parse(fs.readFileSync(buglogPath, "utf-8"))
  } catch {
    return []
  }
}

function emptyTokenLedger(): TokenLedger {
  return {
    lifetime: {
      total_tokens_estimated: 0,
      total_reads: 0,
      total_writes: 0,
      total_sessions: 0,
      anatomy_hits: 0,
      repeated_reads_blocked: 0,
      full_reads: 0,
      range_reads: 0,
      large_full_reads_warned: 0,
      large_full_reads_blocked: 0,
    },
    sessions: [],
  }
}

function emptyTokenLedgerSummary(): TokenLedgerSummary {
  return {
    reads: 0,
    full_reads: 0,
    range_reads: 0,
    writes: 0,
    large_full_reads_warned: 0,
    large_full_reads_blocked: 0,
    repeated_reads_blocked: 0,
    estimated_tokens_intercepted: 0,
    estimated_tokens_avoided: 0,
  }
}

function estimateSessionInterceptions(events: TokenLedgerEvent[]): { intercepted: number; avoided: number } {
  let intercepted = 0
  let avoided = 0

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.tool !== "read" || event.outcome !== "blocked") continue
    if (event.reason !== "large_file" && event.reason !== "repeated_read") continue

    const tokens = event.tokens_estimated ?? 0
    intercepted += tokens

    const laterFullRead = events.slice(i + 1).some((later) =>
      later.tool === "read" &&
      later.file === event.file &&
      later.read_kind === "full" &&
      later.outcome === "completed",
    )
    if (!laterFullRead) avoided += tokens
  }

  return { intercepted, avoided }
}

function normalizeTokenLedger(raw: unknown): TokenLedger {
  const base = emptyTokenLedger()
  const input = raw as Partial<TokenLedger> | undefined
  const lifetime = (input?.lifetime ?? {}) as Partial<TokenLedger["lifetime"]>
  base.lifetime.total_tokens_estimated = lifetime.total_tokens_estimated ?? 0
  base.lifetime.total_reads = lifetime.total_reads ?? 0
  base.lifetime.total_writes = lifetime.total_writes ?? 0
  base.lifetime.total_sessions = lifetime.total_sessions ?? 0
  base.lifetime.anatomy_hits = lifetime.anatomy_hits ?? 0
  base.lifetime.repeated_reads_blocked = lifetime.repeated_reads_blocked ?? 0
  base.lifetime.full_reads = lifetime.full_reads ?? 0
  base.lifetime.range_reads = lifetime.range_reads ?? 0
  base.lifetime.large_full_reads_warned = lifetime.large_full_reads_warned ?? 0
  base.lifetime.large_full_reads_blocked = lifetime.large_full_reads_blocked ?? 0

  base.sessions = Array.isArray(input?.sessions)
    ? input.sessions.map((session) => {
      const sessionWithOptional = session as Partial<TokenLedgerSession>
      const summary = { ...emptyTokenLedgerSummary(), ...(sessionWithOptional.summary ?? {}) }
      const events = Array.isArray(sessionWithOptional.events) ? sessionWithOptional.events.slice(0, MAX_LEDGER_EVENTS_PER_SESSION) : []
      return {
      session_id: session.session_id ?? "",
      started_at: session.started_at ?? "",
      ended_at: session.ended_at ?? "",
      tokens_estimated: session.tokens_estimated ?? 0,
      reads: session.reads ?? 0,
      writes: session.writes ?? 0,
      anatomy_hits: session.anatomy_hits ?? 0,
      repeated_reads_blocked: session.repeated_reads_blocked ?? 0,
      full_reads: session.full_reads ?? 0,
      range_reads: session.range_reads ?? 0,
      large_full_reads_warned: session.large_full_reads_warned ?? 0,
      large_full_reads_blocked: session.large_full_reads_blocked ?? 0,
      summary,
      events,
      }
    })
    : []

  return base
}

function loadTokenLedger(projectDir: string): TokenLedger {
  const ledgerPath = path.join(getLensDir(projectDir), TOKEN_LEDGER_FILE)
  try {
    return normalizeTokenLedger(JSON.parse(fs.readFileSync(ledgerPath, "utf-8")))
  } catch {
    return emptyTokenLedger()
  }
}

function saveTokenLedger(projectDir: string, ledger: TokenLedger) {
  try {
    fs.writeFileSync(
      path.join(getLensDir(projectDir), TOKEN_LEDGER_FILE),
      JSON.stringify(ledger, null, 2),
      "utf-8",
    )
  } catch {
    console.warn("[repolens] Failed to save token ledger")
  }
}

function appendMemory(projectDir: string, line: string) {
  try {
    const memoryPath = path.join(getLensDir(projectDir), MEMORY_FILE)
    const timestamp = new Date().toISOString()
    fs.appendFileSync(memoryPath, `${timestamp} — ${line}\n`, "utf-8")
  } catch {
  }
}

function ensureLensDir(projectDir: string) {
  const lensDir = getLensDir(projectDir)
  if (!fs.existsSync(lensDir)) {
    fs.mkdirSync(lensDir, { recursive: true })
  }
}

function generateBriefing(projectDir: string): string {
  let md = "# Session Briefing\n\n"

  const isGitRepo = fs.existsSync(path.join(projectDir, ".git"))

  try {
    const memoryPath = path.join(getLensDir(projectDir), MEMORY_FILE)
    if (fs.existsSync(memoryPath)) {
      const mem = fs.readFileSync(memoryPath, "utf-8")
      const lines = mem.trim().split("\n").filter(Boolean)

      const filesEdited = new Set<string>()
      let lastSessionLine = ""
      let foundLastSessionEnd = false

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]
        if (!foundLastSessionEnd && line.includes("Session") && (line.includes("ended") || line.includes("idle"))) {
          lastSessionLine = line.split(" — ").slice(1).join(" — ")
          foundLastSessionEnd = true
        }
        if (foundLastSessionEnd) {
          if (line.includes("Session") && line.includes("started")) {
            break
          }
          const writeMatch = line.match(/\d{2}:\d{2}:\d{2}.* — (write|edit): (\S+)/)
          if (writeMatch) {
            filesEdited.add(writeMatch[2])
          }
        }
      }

      if (lastSessionLine) {
        md += "## Last Session Summary\n" + lastSessionLine + "\n\n"
      }
      if (filesEdited.size > 0) {
        md += "Files changed last session: " + [...filesEdited].join(", ") + "\n\n"
      }
    }
  } catch {
  }

  if (!isGitRepo) return md

  try {
    const log = execSync("git log --oneline -10", {
      cwd: projectDir, timeout: 3000, stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim()
    if (log) {
      md += "## Recent Commits\n```\n" + log + "\n```\n\n"
    }
  } catch {
  }

  try {
    const status = execSync("git status --short", {
      cwd: projectDir, timeout: 3000, stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim()
    if (status) {
      md += "## Working Tree\n```\n" + status + "\n```\n\n"
    }
  } catch {
  }

  try {
    const hotspots = execSync(
      'git log --since="7 days ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -10',
      { cwd: projectDir, timeout: 3000, shell: "/bin/sh", stdio: ["ignore", "pipe", "ignore"] },
    ).toString().trim()
    if (hotspots) {
      md += "## Edit Hotspots (7 days)\n```\n" + hotspots + "\n```\n\n"
    }
  } catch {
  }

  return md
}

const RepoLensPlugin: Plugin = async ({ project, directory }) => {
  const projectDir = directory || process.cwd()
  const initialConfig = loadConfig(projectDir)
  if (!initialConfig.enabled) return {}

  interface SessionState {
    reads: Map<string, ReadRecord>
    sections: Map<string, string[]>
    cerebrumWarned: Set<string>
    largeReadWarned: Set<string>
    largeReadBlockedOnce: Set<string>
    largeReadRetryAllowed: Set<string>
    tokens: number
    readCount: number
    writeCount: number
    repeatedBlocked: number
    fullReadCount: number
    rangeReadCount: number
    largeFileWarnedCount: number
    largeFileBlockedCount: number
    anatomyHits: number
    events: TokenLedgerEvent[]
    startTime: string
    finalized: boolean
  }

  const sessions: Map<string, SessionState> = new Map()
  let activeSessionId = ""
  let startupArtifactsChecked = false

  function getOrCreateState(activeSessionId: string): SessionState {
    if (!sessions.has(activeSessionId)) {
      sessions.set(activeSessionId, {
        reads: new Map(),
        sections: new Map(),
        cerebrumWarned: new Set(),
        largeReadWarned: new Set(),
        largeReadBlockedOnce: new Set(),
        largeReadRetryAllowed: new Set(),
        tokens: 0,
        readCount: 0,
        writeCount: 0,
        repeatedBlocked: 0,
        fullReadCount: 0,
        rangeReadCount: 0,
        largeFileWarnedCount: 0,
        largeFileBlockedCount: 0,
        anatomyHits: 0,
        events: [],
        startTime: new Date().toISOString(),
        finalized: false,
      })
    }
    return sessions.get(activeSessionId)!
  }

  function currentState(sessionID?: string): SessionState {
    return getOrCreateState(sessionID || activeSessionId || "default")
  }

  function recordSessionEvent(sessionId: string | undefined, event: Omit<TokenLedgerEvent, "at">) {
    const s = currentState(sessionId)
    s.events.push({ at: new Date().toISOString(), ...event })
    if (s.events.length > MAX_LEDGER_EVENTS_PER_SESSION) {
      s.events.splice(0, s.events.length - MAX_LEDGER_EVENTS_PER_SESSION)
    }
  }

  function buildSessionSummary(s: SessionState): TokenLedgerSummary {
    const { intercepted, avoided } = estimateSessionInterceptions(s.events)
    return {
      reads: s.readCount,
      full_reads: s.fullReadCount,
      range_reads: s.rangeReadCount,
      writes: s.writeCount,
      large_full_reads_warned: s.largeFileWarnedCount,
      large_full_reads_blocked: s.largeFileBlockedCount,
      repeated_reads_blocked: s.repeatedBlocked,
      estimated_tokens_intercepted: intercepted,
      estimated_tokens_avoided: avoided,
    }
  }

  function flushSession(sessionId: string, opts?: { final?: boolean }) {
    const s = getOrCreateState(sessionId)
    if (s.finalized) return

    const ledger = loadTokenLedger(projectDir)

    const sessionRecord: TokenLedgerSession = {
      session_id: sessionId,
      started_at: s.startTime,
      ended_at: new Date().toISOString(),
      tokens_estimated: s.tokens,
      reads: s.readCount,
      writes: s.writeCount,
      anatomy_hits: s.anatomyHits,
      repeated_reads_blocked: s.repeatedBlocked,
      full_reads: s.fullReadCount,
      range_reads: s.rangeReadCount,
      large_full_reads_warned: s.largeFileWarnedCount,
      large_full_reads_blocked: s.largeFileBlockedCount,
      summary: buildSessionSummary(s),
      events: s.events.slice(-MAX_LEDGER_EVENTS_PER_SESSION),
    }

    const idx = ledger.sessions.findIndex((r) => r.session_id === sessionId)
    const previous = idx !== -1 ? ledger.sessions[idx] : undefined

    if (idx !== -1) {
      ledger.sessions[idx] = sessionRecord
    } else {
      ledger.sessions.push(sessionRecord)
      ledger.lifetime.total_sessions += 1
    }

    ledger.lifetime.total_tokens_estimated += s.tokens - (previous?.tokens_estimated ?? 0)
    ledger.lifetime.total_reads += s.readCount - (previous?.reads ?? 0)
    ledger.lifetime.total_writes += s.writeCount - (previous?.writes ?? 0)
    ledger.lifetime.anatomy_hits += s.anatomyHits - (previous?.anatomy_hits ?? 0)
    ledger.lifetime.repeated_reads_blocked += s.repeatedBlocked - (previous?.repeated_reads_blocked ?? 0)
    ledger.lifetime.full_reads += s.fullReadCount - (previous?.full_reads ?? 0)
    ledger.lifetime.range_reads += s.rangeReadCount - (previous?.range_reads ?? 0)
    ledger.lifetime.large_full_reads_warned += s.largeFileWarnedCount - (previous?.large_full_reads_warned ?? 0)
    ledger.lifetime.large_full_reads_blocked += s.largeFileBlockedCount - (previous?.large_full_reads_blocked ?? 0)

    saveTokenLedger(projectDir, ledger)

    if (opts?.final) {
      s.finalized = true
    }
  }

  function sessionIdFromEvent(event: Record<string, unknown>): string {
    const props = event.properties as Record<string, unknown> | undefined
    return (event.sessionID as string) ||
           (props?.sessionID as string) ||
           (props?.info as Record<string, unknown> | undefined)?.id as string ||
           ""
  }

  function sessionIdFromInput(input: Record<string, unknown>): string {
    return (input.sessionID as string) || activeSessionId || "default"
  }

  function ensureStartupArtifacts(config: LensConfig, opts?: { forceScan?: boolean }) {
    ensureLensDir(projectDir)

    const anatomyPath = path.join(getLensDir(projectDir), ANATOMY_FILE)
    const briefingPath = path.join(getLensDir(projectDir), SESSIONS_BRIEFING_FILE)

    if (config.auto_scan_on_init && (opts?.forceScan || !fs.existsSync(anatomyPath))) {
      try {
        const anatomyMd = scanProject(projectDir)
        fs.writeFileSync(anatomyPath, anatomyMd, "utf-8")
      } catch (err) {
        console.warn("[repolens] Initial project scan failed:", err)
      }
    }

    if (opts?.forceScan || !fs.existsSync(briefingPath)) {
      try {
        const briefing = generateBriefing(projectDir)
        fs.writeFileSync(briefingPath, briefing, "utf-8")
      } catch {
      }
    }

    startupArtifactsChecked = true
  }

  return {
    "event": async ({ event }: { event: Record<string, unknown> }) => {
      const evType = (event?.type as string) ?? ""
      const sid = sessionIdFromEvent(event)

      switch (evType) {
        case "session.created": {
          activeSessionId = sid || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const config = loadConfig(projectDir)
          if (!config.enabled) return
          getOrCreateState(activeSessionId)
          ensureStartupArtifacts(config, { forceScan: true })

          appendMemory(projectDir, `Session ${activeSessionId} started`)
          break
        }
        case "session.idle": {
          try {
            if (sid) activeSessionId = sid
            flushSession(activeSessionId)
            const s = currentState(sid)
            appendMemory(
              projectDir,
              `Session ${activeSessionId} idle — ${s.readCount} reads, ${s.writeCount} writes, ~${s.tokens} tok, ${s.repeatedBlocked} repeated reads`,
            )
          } catch (err) {
            console.warn("[repolens] Failed to save idle snapshot:", err)
          }
          break
        }
        case "session.deleted": {
          try {
            if (sid) activeSessionId = sid
            flushSession(activeSessionId, { final: true })
            const s = currentState(activeSessionId)
            appendMemory(
              projectDir,
              `Session ${activeSessionId} ended — ${s.readCount} reads, ${s.writeCount} writes, ~${s.tokens} tok, ${s.repeatedBlocked} repeated reads`,
            )
          } catch {
          }
          break
        }
      }
    },

    "tool.execute.before": async (input: Record<string, unknown>, output: Record<string, unknown> | undefined) => {
      const args = (output as Record<string, unknown> | undefined)?.args as Record<string, unknown> | undefined
      const tool = String(input?.tool ?? "").toLowerCase()
      const sid = sessionIdFromInput(input)
      const config = loadConfig(projectDir)
      if (!config.enabled) return
      if (!startupArtifactsChecked) ensureStartupArtifacts(config)

      if (tool === "read") {
        const rawPath = args?.filePath as string | undefined
        if (!rawPath) return
        const filePath = normalizePath(rawPath, projectDir)

        const anatomy = parseAnatomy(projectDir)
        const entry = anatomy.get(filePath)

        if (entry) {
          currentState(sid).anatomyHits++
        }

        const readHasRange = hasReadRange(args)
        const largeFilePolicy = config.large_file_policy ?? "warn"
        const largeFileThreshold = config.large_file_threshold_tokens ?? 8000
        const estimatedTokens = entry?.tokens ?? estimateFileTokens(path.join(projectDir, filePath), config.token_estimation_ratio)
        const state = currentState(sid)
        let skipRepeatedReadGuard = false

        if (!readHasRange &&
            largeFilePolicy !== "off" &&
            estimatedTokens >= largeFileThreshold &&
            !isIgnored(filePath, config) &&
            !isLargeFileAllowed(filePath, config)) {
          const retryAllowed = state.largeReadRetryAllowed.has(filePath)
          const msg = largeFileMessage(filePath, estimatedTokens, largeFileThreshold, largeFilePolicy === "strict" || largeFilePolicy === "adaptive", entry?.sections)

          if (retryAllowed) {
            state.largeReadRetryAllowed.delete(filePath)
            skipRepeatedReadGuard = true
            appendMemory(projectDir, `Large full read retry allowed: ${filePath} (~${estimatedTokens} tok)`)
          } else if (largeFilePolicy === "strict" && !state.largeReadBlockedOnce.has(filePath)) {
            state.largeReadBlockedOnce.add(filePath)
            state.largeReadRetryAllowed.add(filePath)
            state.largeFileBlockedCount++
            recordSessionEvent(sid, {
              tool: "read",
              file: filePath,
              read_kind: "full",
              outcome: "blocked",
              reason: "large_file",
              tokens_estimated: estimatedTokens,
            })
            appendMemory(projectDir, `Large full read blocked: ${filePath} (~${estimatedTokens} tok)`)
            throw new Error(msg)
          } else if (largeFilePolicy === "adaptive" && state.largeReadWarned.has(filePath) && !state.largeReadBlockedOnce.has(filePath)) {
            state.largeReadBlockedOnce.add(filePath)
            state.largeReadRetryAllowed.add(filePath)
            state.largeFileBlockedCount++
            recordSessionEvent(sid, {
              tool: "read",
              file: filePath,
              read_kind: "full",
              outcome: "blocked",
              reason: "large_file",
              tokens_estimated: estimatedTokens,
            })
            appendMemory(projectDir, `Large full read adaptive-blocked after warning: ${filePath} (~${estimatedTokens} tok)`)
            throw new Error(msg)
          } else if (!state.largeReadWarned.has(filePath)) {
            state.largeReadWarned.add(filePath)
            state.largeFileWarnedCount++
            recordSessionEvent(sid, {
              tool: "read",
              file: filePath,
              read_kind: "full",
              outcome: "warned",
              reason: "large_file",
              tokens_estimated: estimatedTokens,
            })
            appendMemory(projectDir, `Large full read warned: ${filePath} (~${estimatedTokens} tok)`)
            console.warn(msg)
          }
        }

        const record = currentState(sid).reads.get(filePath)
        const count = (record?.count ?? 0) + 1
        const now = Date.now()
        currentState(sid).reads.set(filePath, { count, lastReadTime: now })

        if (count === 2) {
          const hasRange = hasReadRange(args)
          if (hasRange) {
            appendMemory(projectDir, `Range read #2: ${filePath} (bypassed)`)
            return
          }
          const elapsedMin = record ? Math.round((now - record.lastReadTime) / 60000) : 0
          const elapsed = elapsedMin > 0 ? `${elapsedMin} min ago` : "earlier this session"
          const tokenInfo = entry ? ` (~${entry.tokens} tok)` : ""

          const sections = currentState(sid).sections.get(filePath)
          let sectionsBlock = ""
          if (sections && sections.length > 0) {
            sectionsBlock = "\n\nKey sections:\n  " + sections.slice(0, 6).join("\n  ")
          }

          const msg = `[RepoLens] Re-reading file: ${filePath}${tokenInfo}. Last read ${elapsed}.` +
              sectionsBlock +
              "\n\nPrefer grep for targeted searches, or use offset/limit to read specific sections." +
              "\nFull-file re-reads will continue to be blocked. Use offset/limit to bypass."

          if (skipRepeatedReadGuard) {
            appendMemory(projectDir, `Repeated-read guard skipped for large full read retry: ${filePath}`)
          } else if (shouldBlock(config, entry?.tokens)) {
            currentState(sid).repeatedBlocked++
            recordSessionEvent(sid, {
              tool: "read",
              file: filePath,
              read_kind: "full",
              outcome: "blocked",
              reason: "repeated_read",
              tokens_estimated: estimatedTokens,
            })
            throw new Error(msg)
          } else {
            console.warn(msg)
          }
        }

        if (count >= 3) {
          const hasRange = hasReadRange(args)
          if (!hasRange) {
            const elapsedMin = record ? Math.round((now - record.lastReadTime) / 60000) : 0
            const elapsed = elapsedMin > 0 ? `${elapsedMin} min ago` : "earlier this session"
            const sections = currentState(sid).sections.get(filePath)
            let sectionsBlock = ""
            if (sections && sections.length > 0) {
              sectionsBlock = "\n\nKey sections:\n  " + sections.slice(0, 6).join("\n  ")
            }

            const msg = `[RepoLens] Still re-reading ${filePath} (#${count}). Last read ${elapsed}.` +
                sectionsBlock +
                "\n\nUse offset/limit to read specific sections, or grep for targeted searches." +
                "\nRepeating the same full read will continue to be blocked."

            if (skipRepeatedReadGuard) {
              appendMemory(projectDir, `Repeated-read guard skipped for large full read retry: ${filePath}`)
            } else if (shouldBlock(config, entry?.tokens)) {
              currentState(sid).repeatedBlocked++
              recordSessionEvent(sid, {
                tool: "read",
                file: filePath,
                read_kind: "full",
                outcome: "blocked",
                reason: "repeated_read",
                tokens_estimated: estimatedTokens,
              })
              throw new Error(msg)
            } else {
              console.warn(msg)
            }
          } else {
            appendMemory(projectDir, `Range read #${count}: ${filePath} (bypassed — has offset/limit)`)
          }
        }
        return
      }

      if (tool === "write" || tool === "edit" || tool === "apply_patch") {
        const rawPath = args?.filePath as string | undefined
        const patchText = args?.patchText as string | undefined
        const filePaths = tool === "apply_patch"
          ? extractApplyPatchPaths(patchText ?? "", projectDir)
          : rawPath ? [normalizePath(rawPath, projectDir)] : []
        if (filePaths.length === 0) return

        for (const filePath of filePaths) {
          currentState(sid).reads.delete(filePath)
          currentState(sid).sections.delete(filePath)
          currentState(sid).largeReadWarned.delete(filePath)
          currentState(sid).largeReadBlockedOnce.delete(filePath)
          currentState(sid).largeReadRetryAllowed.delete(filePath)

          if (!currentState(sid).cerebrumWarned.has(filePath)) {
            const warnings = parseCerebrum(projectDir)
            for (const warn of warnings) {
              const fileMatch = warn.match(/\(file:\s*([^)]+)\)/)
              if (fileMatch) {
                const warnedFile = fileMatch[1].trim()
                if (filePath.includes(warnedFile) || warnedFile.includes(filePath)) {
                  currentState(sid).cerebrumWarned.add(filePath)
                  const msg = `[RepoLens] Cerebrum: known issue detected for this file.\n\n` +
                      `  "${warn}"\n\n` +
                      `Check ${LENS_DIR}/${CEREBRUM_FILE} if this is no longer relevant.\n` +
                      `Proceeding with the write will bypass this warning.`
                  if (shouldBlock(config)) {
                    recordSessionEvent(sid, {
                      tool,
                      file: filePath,
                      outcome: "blocked",
                      reason: "cerebrum",
                    })
                    throw new Error(msg)
                  } else {
                    recordSessionEvent(sid, {
                      tool,
                      file: filePath,
                      outcome: "warned",
                      reason: "cerebrum",
                    })
                    console.warn(msg)
                  }
                }
              } else if (!currentState(sid).cerebrumWarned.has("__global__")) {
                currentState(sid).cerebrumWarned.add("__global__")
                const msg = `[RepoLens] Cerebrum: general warning applies.\n\n` +
                    `  "${warn}"\n\n` +
                    `Check ${LENS_DIR}/${CEREBRUM_FILE} if this is no longer relevant.\n` +
                    `Proceeding with the write will bypass this warning.`
                if (shouldBlock(config)) {
                  recordSessionEvent(sid, {
                    tool,
                    file: filePath,
                    outcome: "blocked",
                    reason: "cerebrum",
                  })
                  throw new Error(msg)
                } else {
                  recordSessionEvent(sid, {
                    tool,
                    file: filePath,
                    outcome: "warned",
                    reason: "cerebrum",
                  })
                  console.warn(msg)
                }
              }
            }
          }
        }
        return
      }
    },

    "tool.execute.after": async (input: Record<string, unknown>, _output: Record<string, unknown> | undefined) => {
      const args = (input as Record<string, unknown>)?.args as Record<string, unknown> | undefined
      const tool = String(input?.tool ?? "").toLowerCase()
      const sid = sessionIdFromInput(input)
      const config = loadConfig(projectDir)
      if (!config.enabled) return
      if (!startupArtifactsChecked) ensureStartupArtifacts(config)
      const ratio = config.token_estimation_ratio

      if (tool === "read") {
        currentState(sid).readCount++

        const rawPath = args?.filePath as string | undefined
        if (!rawPath) return
        const filePath = normalizePath(rawPath, projectDir)

        if (hasReadRange(args)) {
          currentState(sid).rangeReadCount++
          recordSessionEvent(sid, {
            tool: "read",
            file: filePath,
            read_kind: "range",
            outcome: "completed",
            offset: typeof args?.offset === "number" ? args.offset : undefined,
            limit: typeof args?.limit === "number" ? args.limit : undefined,
          })
          return
        }
        currentState(sid).fullReadCount++

        const record = currentState(sid).reads.get(filePath)

        if (record && record.count === 1) {
          try {
            const absPath = path.join(projectDir, filePath)
            if (fs.existsSync(absPath)) {
              const sections = extractSections(absPath)
              if (sections.length > 0) {
                currentState(sid).sections.set(filePath, sections)
              }
            }
          } catch {
          }
        }

        const anatomy = parseAnatomy(projectDir)
        const entry = anatomy.get(filePath)
        let tokensForRead = 0
        if (entry) {
          tokensForRead = entry.tokens
        } else {
          try {
            const absPath = path.join(projectDir, filePath)
            if (fs.existsSync(absPath)) {
              const stat = fs.statSync(absPath)
              tokensForRead = Math.ceil(stat.size / ratio)
            }
          } catch {
            tokensForRead = 100
          }
        }
        currentState(sid).tokens += tokensForRead
        recordSessionEvent(sid, {
          tool: "read",
          file: filePath,
          read_kind: "full",
          outcome: "completed",
          tokens_estimated: tokensForRead,
        })
        return
      }

      if (tool === "write" || tool === "edit" || tool === "apply_patch") {
        currentState(sid).writeCount++
        const rawPath = args?.filePath as string | undefined
        const patchText = args?.patchText as string | undefined
        const filePaths = tool === "apply_patch"
          ? extractApplyPatchPaths(patchText ?? "", projectDir)
          : rawPath ? [normalizePath(rawPath, projectDir)] : []

        if (tool !== "apply_patch") {
          const filePath = filePaths[0]
          if (!filePath) return
          try {
            const absPath = path.join(projectDir, filePath)
            if (fs.existsSync(absPath)) {
              const stat = fs.statSync(absPath)
              const tokens = Math.ceil(stat.size / ratio)
              currentState(sid).tokens += tokens
              updateAnatomyEntry(projectDir, filePath)
              recordSessionEvent(sid, {
                tool,
                file: filePath,
                outcome: "completed",
                tokens_estimated: tokens,
              })
              appendMemory(
                projectDir,
                `${tool}: ${filePath} (~${tokens} tok)`,
              )
            }
          } catch {
          }
        }
        if (tool === "apply_patch") {
          let patchTokens = 0
          for (const filePath of filePaths) {
            try {
              const absPath = path.join(projectDir, filePath)
              if (fs.existsSync(absPath)) {
                const stat = fs.statSync(absPath)
                const tokens = Math.ceil(stat.size / ratio)
                patchTokens += tokens
                updateAnatomyEntry(projectDir, filePath)
                recordSessionEvent(sid, {
                  tool: "apply_patch",
                  file: filePath,
                  outcome: "completed",
                  tokens_estimated: tokens,
                })
                appendMemory(projectDir, `apply_patch: ${filePath} (~${tokens} tok)`)
              } else {
                removeAnatomyEntry(projectDir, filePath)
                recordSessionEvent(sid, {
                  tool: "apply_patch",
                  file: filePath,
                  outcome: "completed",
                })
                appendMemory(projectDir, `apply_patch: ${filePath} (deleted)`)
              }
            } catch {
            }
          }
          if (patchTokens > 0) {
            currentState(sid).tokens += patchTokens
          } else {
            currentState(sid).tokens += 200
            appendMemory(projectDir, `apply_patch (~200 tok est.)`)
          }
        }
        return
      }

      if (tool === "bash") {
        currentState(sid).tokens += 200
        recordSessionEvent(sid, {
          tool: "bash",
          outcome: "completed",
          tokens_estimated: 200,
        })
        return
      }
    },
  }
}

export default RepoLensPlugin
