import { spawnSync } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { scenarios } from "./scenarios.ts"
import { generateReport, type ScenarioResult } from "./reporter.ts"

const projectRoot = path.resolve(import.meta.dirname!, "..")
const fixturesSource = path.join(projectRoot, "tests", "fixtures")
const harnessPath = path.join(projectRoot, "tests", "harness.ts")
const tsxBin = path.join(projectRoot, "node_modules", ".bin", "tsx")

console.log("RepoLens Quantification Test Suite")
console.log("=".repeat(50))

const results: ScenarioResult[] = []
const tempDirs: string[] = []

for (const scenario of scenarios) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pl-test-${scenario.name.replace(/[.\s]/g, "-")}-`))
  tempDirs.push(tempDir)

  fs.cpSync(fixturesSource, tempDir, { recursive: true })

  if (scenario.fixtureConfig) {
    const overrideSrc = path.join(fixturesSource, ".lens", scenario.fixtureConfig)
    const overrideDest = path.join(tempDir, ".lens", "config.json")
    if (fs.existsSync(overrideSrc)) {
      fs.copyFileSync(overrideSrc, overrideDest)
    }
  }

  console.log(`\nRunning: ${scenario.name}`)
  console.log(`  Fixture: ${tempDir}`)

  const proc = spawnSync(
    tsxBin,
    [harnessPath, scenario.name, tempDir],
    {
      cwd: projectRoot,
      timeout: 60000,
      encoding: "utf-8",
    },
  )

  if (proc.error) {
    console.error(`  ERROR: ${proc.error.message}`)
    continue
  }

  const stderr = proc.stderr?.trim()
  if (stderr) {
    console.error(`  STDERR: ${stderr.slice(0, 200)}`)
  }

  const stdout = proc.stdout?.trim()
  if (!stdout) {
    console.error(`  NO OUTPUT (exit code: ${proc.status})`)
    continue
  }

  try {
    const result = JSON.parse(stdout) as ScenarioResult
    results.push(result)

    const status = result.ledger_consistent ? "✓" : "✗"
    const expB = (result as Record<string, unknown>).expected_blocks as number
    const expC = (result as Record<string, unknown>).expected_cerebrum as number
    console.log(`  ${status} blocks=${result.calls_blocked}/${expB ?? "?"} ` +
      `cerebrum=${result.cerebrum_warnings}/${expC ?? "?"} tokens=${result.baseline_tokens}→${result.actual_tokens_consumed}`)
    if (!result.ledger_consistent && result.ledger_mismatches?.length) {
      console.error(`    ledger mismatch: ${result.ledger_mismatches.join("; ")}`)
    }
  } catch {
    console.error(`  PARSE ERROR. Raw output:`)
    console.error(`  ${stdout.slice(0, 500)}`)
  }
}

if (results.length === 0) {
  console.error("\nNo scenarios completed successfully.")
  process.exit(1)
}

console.log("\n")
console.log(generateReport(results))

const consistent = results.every((r) => r.ledger_consistent)
const passed = results.filter((r) => r.ledger_consistent).length

console.log(`\nResult: ${passed}/${results.length} scenarios pass consistency check.`)

process.on("exit", () => {
  for (const d of tempDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch {}
  }
})

process.exit(consistent ? 0 : 1)
