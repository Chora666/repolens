import { spawnSync, execSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

interface RunSpec {
  name: string
  projectLens: boolean
  mode: "adaptive" | "warn" | "strict"
  largeFilePolicy: "warn" | "strict" | "adaptive"
  threshold: number
}

interface RunSummary {
  name: string
  status: number | null
  durationMs: number
  jsonlPath: string
  stderrPath: string
  workspace: string
  finalTokens: number
  fullReadAttempts: number
  fullReadCompleted: number
  fullReadBlocked: number
  rangeReadAttempts: number
  rangeReadCompleted: number
  grepCalls: number
  globCalls: number
  edits: number
  readErrors: number
  projectLensBlocks: number
  projectLensWarnings: number
  gateStatus: number | null
  gateOutput: string
  ledger?: Record<string, unknown>
}

const projectRoot = path.resolve(import.meta.dirname!, "..")
const trapCase = process.env.REPOLENS_TRAP_CASE ?? "v2"
if (trapCase !== "v2" && trapCase !== "v3") {
  throw new Error(`Unsupported REPOLENS_TRAP_CASE=${trapCase}; expected v2 or v3`)
}
const trapCaseUpper = trapCase.toUpperCase()
const fixtureRoot = path.join(projectRoot, "tests", "fixtures", `trap-case-${trapCase}`)
const promptPath = path.join(fixtureRoot, "PROMPT.md")
const evalsDir = path.join(projectRoot, "tests", "evals")
const reportPath = path.join(evalsDir, `trap-${trapCase}-real-deepseek.md`)
const tsxBin = path.join(projectRoot, "node_modules", ".bin", "tsx")
const gatePath = path.join(projectRoot, "tests", `trap-case-${trapCase}-quality-gate.ts`)
const cliPath = path.join(projectRoot, "bin", "cli.js")

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const allowExternalModel = process.env.REPOLENS_ALLOW_EXTERNAL_MODEL === "1"
const model = process.env.REPOLENS_EVAL_MODEL ?? "dee-seek/deepseek-v4-pro"
const tmpRoot = process.env.REPOLENS_TRAP_ROOT ??
  process.env.REPOLENS_TRAP_V2_ROOT ??
  fs.mkdtempSync(path.join(os.tmpdir(), `repolens-trap-${trapCase}-`))
const logsDir = path.join(tmpRoot, "logs")
const workspacesDir = path.join(tmpRoot, "workspaces")

const baseMatrix: RunSpec[] = [
  { name: "off", projectLens: false, mode: "warn", largeFilePolicy: "warn", threshold: 8000 },
  { name: "warn8000", projectLens: true, mode: "adaptive", largeFilePolicy: "warn", threshold: 8000 },
  { name: "strict8000", projectLens: true, mode: "adaptive", largeFilePolicy: "strict", threshold: 8000 },
]

if (process.env.REPOLENS_INCLUDE_ADAPTIVE8000 === "1" || trapCase === "v3") {
  baseMatrix.splice(2, 0, { name: "adaptive8000", projectLens: true, mode: "adaptive", largeFilePolicy: "adaptive", threshold: 8000 })
}

if (process.env.REPOLENS_INCLUDE_STRICT3000 === "1") {
  baseMatrix.push({ name: "strict3000", projectLens: true, mode: "adaptive", largeFilePolicy: "strict", threshold: 3000 })
}

const runsPerCell = Number(process.env.REPOLENS_EVAL_RUNS ?? 3)
const prompt = fs.readFileSync(promptPath, "utf-8").trim()

function makeConfig(spec: RunSpec): Record<string, unknown> {
  return {
    version: "1.0.0",
    enabled: true,
    token_estimation_ratio: 4,
    ignore_patterns: [
      "node_modules",
      ".git",
      ".opencode",
      "dist",
      "build",
      ".lens",
      "coverage",
    ],
    ignore_extensions: [".lock", ".log", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg"],
    auto_scan_on_init: true,
    auto_update_anatomy: true,
    max_scan_files: 1000,
    mode: spec.mode,
    adaptive_threshold: 500,
    large_file_policy: spec.largeFilePolicy,
    large_file_threshold_tokens: spec.threshold,
    large_file_allow_globs: [],
  }
}

function ensureFixture() {
  if (!fs.existsSync(fixtureRoot)) {
    const generated = spawnSync(tsxBin, [path.join(projectRoot, "tests", `generate-trap-case-${trapCase}.ts`)], {
      cwd: projectRoot,
      encoding: "utf-8",
    })
    if (generated.status !== 0) {
      process.stderr.write(generated.stdout)
      process.stderr.write(generated.stderr)
      throw new Error(`Failed to generate trap-case-${trapCase} fixture`)
    }
  }
}

function copyFixture(workspace: string) {
  fs.rmSync(workspace, { recursive: true, force: true })
  fs.mkdirSync(workspace, { recursive: true })
  fs.cpSync(fixtureRoot, workspace, { recursive: true })
}

function initRepoLens(workspace: string, spec: RunSpec) {
  if (!spec.projectLens) return

  const init = spawnSync(process.execPath, [cliPath, "init", "--dir", workspace, "--force"], {
    cwd: projectRoot,
    encoding: "utf-8",
  })
  if (init.status !== 0) {
    throw new Error(`repolens init failed for ${spec.name}:\n${init.stderr || init.stdout}`)
  }

  fs.writeFileSync(
    path.join(workspace, ".lens", "config.json"),
    JSON.stringify(makeConfig(spec), null, 2),
    "utf-8",
  )
}

function parseJsonl(jsonlPath: string): Omit<RunSummary, "name" | "status" | "durationMs" | "jsonlPath" | "stderrPath" | "workspace" | "gateStatus" | "gateOutput" | "ledger"> {
  const summary = {
    finalTokens: 0,
    fullReadAttempts: 0,
    fullReadCompleted: 0,
    fullReadBlocked: 0,
    rangeReadAttempts: 0,
    rangeReadCompleted: 0,
    grepCalls: 0,
    globCalls: 0,
    edits: 0,
    readErrors: 0,
    projectLensBlocks: 0,
    projectLensWarnings: 0,
  }

  if (!fs.existsSync(jsonlPath)) return summary

  const lines = fs.readFileSync(jsonlPath, "utf-8").split("\n").filter(Boolean)
  for (const line of lines) {
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    const part = event.part as Record<string, unknown> | undefined
    const state = part?.state as Record<string, unknown> | undefined
    const input = state?.input as Record<string, unknown> | undefined
    const tool = String(part?.tool ?? "").toLowerCase()
    const status = String(state?.status ?? "").toLowerCase()
    const error = String(state?.error ?? "")

    if (tool === "read") {
      const hasRange = input?.offset !== undefined || input?.limit !== undefined
      if (hasRange) {
        summary.rangeReadAttempts++
        if (status === "completed") summary.rangeReadCompleted++
      } else {
        summary.fullReadAttempts++
        if (status === "completed") summary.fullReadCompleted++
      }
      if (status === "error") summary.readErrors++
    } else if (tool === "grep") {
      summary.grepCalls++
    } else if (tool === "glob") {
      summary.globCalls++
    } else if (tool === "edit" || tool === "write" || tool === "apply_patch") {
      summary.edits++
    }

    if (error.includes("[RepoLens] Large file read")) {
      summary.projectLensBlocks++
      summary.fullReadBlocked++
    }

    const tokens = (part?.tokens as Record<string, unknown> | undefined)?.total
    if (typeof tokens === "number") summary.finalTokens = tokens
    const stepTokens = ((part as Record<string, unknown> | undefined)?.tokens as Record<string, unknown> | undefined)?.total
    if (typeof stepTokens === "number") summary.finalTokens = stepTokens
  }

  return summary
}

function loadLedger(workspace: string): Record<string, unknown> | undefined {
  const ledgerPath = path.join(workspace, ".lens", "token-ledger.json")
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8")) as Record<string, unknown>
    const sessions = ledger.sessions as Record<string, unknown>[] | undefined
    return sessions?.at(-1)
  } catch {
    return undefined
  }
}

function runGate(workspace: string): { status: number | null; output: string } {
  const gate = spawnSync(tsxBin, [gatePath, workspace], {
    cwd: projectRoot,
    encoding: "utf-8",
  })
  return {
    status: gate.status,
    output: `${gate.stdout}${gate.stderr}`.trim(),
  }
}

function detectOpenCodePort(): number | null {
  try {
    const output = execSync(
      "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -i OpenCode | awk '{print $9}' | cut -d: -f2 | head -1",
      { encoding: "utf-8" },
    ).trim()
    const port = Number(output)
    return port > 0 ? port : null
  } catch {
    return null
  }
}

function runOne(spec: RunSpec, index: number): RunSummary {
  const runName = `${spec.name}-run${index}`
  const workspace = path.join(workspacesDir, runName)
  const jsonlPath = path.join(logsDir, `${runName}.jsonl`)
  const stderrPath = path.join(logsDir, `${runName}.stderr`)

  copyFixture(workspace)
  initRepoLens(workspace, spec)

  const opencodePort = detectOpenCodePort()
  const opencodeArgs = opencodePort
    ? [
        "run",
        "--attach", `http://localhost:${opencodePort}`,
        "--dir", workspace,
        "--format", "json",
        "--dangerously-skip-permissions",
        "--model", model,
        prompt,
      ]
    : [
        "run",
        "--dir", workspace,
        "--format", "json",
        "--dangerously-skip-permissions",
        "--model", model,
        prompt,
      ]

  const started = Date.now()
  const proc = spawnSync("opencode", opencodeArgs, {
    cwd: projectRoot,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 50,
  })
  const durationMs = Date.now() - started

  fs.writeFileSync(jsonlPath, proc.stdout ?? "", "utf-8")
  fs.writeFileSync(stderrPath, proc.stderr ?? "", "utf-8")

  const gate = runGate(workspace)
  const parsed = parseJsonl(jsonlPath)
  const stderr = fs.readFileSync(stderrPath, "utf-8")
  parsed.projectLensWarnings += (stderr.match(/\[RepoLens\] Large file read/g) ?? []).length
  const ledger = loadLedger(workspace)
  const ledgerSummary = ledger?.summary as Record<string, unknown> | undefined
  if (typeof ledgerSummary?.large_full_reads_warned === "number") {
    parsed.projectLensWarnings = ledgerSummary.large_full_reads_warned
  }
  if (typeof ledgerSummary?.large_full_reads_blocked === "number") {
    parsed.projectLensBlocks = ledgerSummary.large_full_reads_blocked
    parsed.fullReadBlocked = ledgerSummary.large_full_reads_blocked
  }
  if (typeof ledgerSummary?.full_reads === "number") {
    parsed.fullReadCompleted = ledgerSummary.full_reads
  }
  if (typeof ledgerSummary?.range_reads === "number") {
    parsed.rangeReadCompleted = ledgerSummary.range_reads
  }

  return {
    name: runName,
    status: proc.status,
    durationMs,
    jsonlPath,
    stderrPath,
    workspace,
    gateStatus: gate.status,
    gateOutput: gate.output,
    ledger,
    ...parsed,
  }
}

function renderReport(results: RunSummary[]): string {
  const lines: string[] = []
  lines.push(`# Trap Case ${trapCaseUpper} Real Eval: DeepSeek V4 Pro`)
  lines.push("")
  lines.push(`**Date**: ${new Date().toISOString()}`)
  lines.push(`**Model**: \`${model}\``)
  lines.push(`**Eval root**: \`${tmpRoot}\``)
  lines.push("")
  lines.push("## Scope")
  lines.push("")
  lines.push(`This eval sends only isolated copies of \`tests/fixtures/trap-case-${trapCase}\` and the standard prompt to the configured external model through OpenCode.`)
  lines.push("")
  lines.push("## Results")
  lines.push("")
  lines.push("| Run | Exit | Dur(s) | Tokens | FullAttempt | FullDone | FullBlocked | RangeAttempt | RangeDone | Grep | Glob | Edits | RdErr | PL Blocks | PL Warnings | Gate |")
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")
  for (const r of results) {
    lines.push([
      `| ${r.name}`,
      r.status ?? "null",
      (r.durationMs / 1000).toFixed(1),
      r.finalTokens,
      r.fullReadAttempts,
      r.fullReadCompleted,
      r.fullReadBlocked,
      r.rangeReadAttempts,
      r.rangeReadCompleted,
      r.grepCalls,
      r.globCalls,
      r.edits,
      r.readErrors,
      r.projectLensBlocks,
      r.projectLensWarnings,
      r.gateStatus === 0 ? "PASS" : "FAIL",
    ].join(" | ") + " |")
  }
  lines.push("")
  lines.push("## Raw Logs")
  lines.push("")
  lines.push("```text")
  lines.push(path.join(tmpRoot, "logs"))
  lines.push("```")
  lines.push("")
  lines.push("## Quality Gate")
  lines.push("")
  if (trapCase === "v2") {
    lines.push("Pass condition: `Oscillator(1 Hz), triangle, gain 1, sampleRate 4` produces `0, 1, 0, -1, 0`.")
  } else {
    lines.push("Pass condition: search/filter changes reset `pageIndex` to 0 while page navigation still works.")
  }
  lines.push("")
  lines.push("## Interpretation")
  lines.push("")
  lines.push("- `strict@8000` should trigger on this >8k fixture and redirect the model away from completed full-file reads.")
  lines.push("- `adaptive@8000`, when included, is expected to behave closer to warn on single-full-read tasks.")
  lines.push("- Gate pass/fail is executable and should be treated as the quality signal.")
  lines.push("- Treat token reductions as observed run totals plus plugin estimates, not as a universal guarantee.")
  lines.push("")
  lines.push("## Ledgers")
  lines.push("")
  for (const r of results) {
    if (!r.ledger) continue
    lines.push(`### ${r.name}`)
    lines.push("")
    lines.push("```json")
    lines.push(JSON.stringify(r.ledger.summary ?? r.ledger, null, 2))
    lines.push("```")
    lines.push("")
  }
  lines.push("## Safety")
  lines.push("")
  lines.push("Workspaces were created under the system temp directory. Do not delete the temp root until raw logs are no longer needed.")
  lines.push("")
  return lines.join("\n")
}

ensureFixture()
fs.mkdirSync(logsDir, { recursive: true })
fs.mkdirSync(workspacesDir, { recursive: true })
fs.mkdirSync(evalsDir, { recursive: true })

const plannedRuns = baseMatrix.flatMap((spec) =>
  Array.from({ length: runsPerCell }, (_, i) => ({ spec, index: i + 1 })),
)

if (dryRun || !allowExternalModel) {
  console.log(`Trap Case ${trapCaseUpper} real eval root: ${tmpRoot}`)
  console.log(`Model: ${model}`)
  console.log("Planned runs:")
  for (const run of plannedRuns) {
    console.log(`- ${run.spec.name}-run${run.index}: policy=${run.spec.largeFilePolicy} threshold=${run.spec.threshold}`)
  }
  if (!process.env.REPOLENS_INCLUDE_ADAPTIVE8000 && trapCase !== "v3") {
    console.log("")
    console.log("Set REPOLENS_INCLUDE_ADAPTIVE8000=1 to add adaptive@8000 runs.")
  }
  if (!allowExternalModel) {
    console.log("")
    console.log("Refusing to call external model without REPOLENS_ALLOW_EXTERNAL_MODEL=1.")
    console.log(`This is intentional: the run sends trap-case-${trapCase} fixture code and prompt to the configured model service.`)
  }
  process.exit(dryRun ? 0 : 2)
}

const results: RunSummary[] = []
for (const run of plannedRuns) {
  console.log(`Running ${run.spec.name}-run${run.index}...`)
  results.push(runOne(run.spec, run.index))
  fs.writeFileSync(reportPath, renderReport(results), "utf-8")
}

fs.writeFileSync(reportPath, renderReport(results), "utf-8")
console.log(`Report written: ${reportPath}`)
console.log(`Raw logs: ${path.join(tmpRoot, "logs")}`)
