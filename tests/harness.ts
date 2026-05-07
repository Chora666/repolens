import * as fs from "node:fs"
import * as path from "node:path"
import RepoLensPlugin from "../src/plugin.ts"
import { scenarios, type SimCall } from "./scenarios.ts"

const scenarioName = process.argv[2]
const fixtureDir = process.argv[3]

if (!scenarioName || !fixtureDir) {
  console.error("Usage: harness.ts <scenarioName> <fixtureDir>")
  process.exit(1)
}

const scenario = scenarios.find((s) => s.name === scenarioName)
if (!scenario) {
  console.error(`Scenario not found: ${scenarioName}`)
  process.exit(1)
}

function estimateToken(filePath: string): number {
  try {
    const stat = fs.statSync(path.join(fixtureDir, filePath))
    return Math.ceil(stat.size / 4)
  } catch {
    return 0
  }
}

async function run() {
  const debugLog: string[] = []
  function LOG(msg: string) {
    debugLog.push(msg)
  }

  LOG(`Harness starting: scenario=${scenarioName} fixture=${fixtureDir}`)

  const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: fixtureDir })
  const sessionID = "test-session"

  const eventHook = (handlers as Record<string, unknown>)["event"] as ((ev: Record<string, unknown>) => Promise<void>) | undefined
  if (eventHook) {
    await eventHook({ event: { type: "session.created", properties: { info: { id: sessionID } } } })
    LOG("session.created done")
  } else {
    LOG("session.created skipped (plugin disabled)")
  }

  let callsBlocked = 0
  let cerebrumWarnings = 0
  let baselineTokens = 0
  let actualTokens = 0
  let tokensBlockedFull = 0
  let readCalls = 0
  let writeCalls = 0
  let totalCalls = 0
  let expectedLedgerReads = 0
  let expectedLedgerWrites = 0
  let expectedLedgerTokens = 0
  let expectedLedgerRepeatedBlocks = 0

  for (let i = 0; i < scenario.calls.length; i++) {
    const call = scenario.calls[i]
    totalCalls++

    const beforeInput = { tool: call.tool, sessionID }
    const beforeOutput = { args: { ...call.args } }
    const afterInput = { tool: call.tool, sessionID, args: { ...call.args } }
    const afterOutput = {}

    if (call.tool === "Read") {
      readCalls++
      baselineTokens += estimateToken(call.args.filePath as string)
    }
    if (call.tool === "Write" || call.tool === "Edit") {
      writeCalls++
    }

    let blocked = false
    let blockReason = ""

    const beforeHook = handlers["tool.execute.before"]
    if (beforeHook) {
      try {
        await beforeHook(beforeInput as unknown as Record<string, unknown>, beforeOutput as unknown as Record<string, unknown>)
      } catch (e: unknown) {
        blocked = true
        blockReason = e instanceof Error ? e.message : String(e)
        callsBlocked++
        LOG(`  call #${i} BLOCKED: ${call.label} — ${blockReason.slice(0, 80)}`)

        if (blockReason.includes("Cerebrum")) {
          cerebrumWarnings++
        }

        if (call.tool === "Read") {
          tokensBlockedFull += estimateToken(call.args.filePath as string)
          expectedLedgerRepeatedBlocks++
        }

        if (call.retry_if_blocked) {
          LOG(`  call #${i} retrying...`)
          try {
            await beforeHook(beforeInput as unknown as Record<string, unknown>, beforeOutput as unknown as Record<string, unknown>)
            blocked = false
            LOG(`  call #${i} retry SUCCESS`)
          } catch (e2: unknown) {
            LOG(`  call #${i} retry also BLOCKED`)
          }
        }
      }
    }

    if (!blocked) {
      if (call.tool === "Read") {
        actualTokens += estimateToken(call.args.filePath as string)
      }
      if (handlers["tool.execute.after"]) {
        await handlers["tool.execute.after"]!(afterInput as unknown as Record<string, unknown>, afterOutput as unknown as Record<string, unknown>)
        if (call.tool === "Read") {
          expectedLedgerReads++
          if (call.args.offset === undefined && call.args.limit === undefined) {
            expectedLedgerTokens += estimateToken(call.args.filePath as string)
          }
        } else if (call.tool === "Write" || call.tool === "Edit") {
          expectedLedgerWrites++
          expectedLedgerTokens += estimateToken(call.args.filePath as string)
        } else if (call.tool === "Bash") {
          expectedLedgerTokens += 200
        }
      }
    }

    LOG(`  call #${i} DONE: ${call.label} blocked=${blocked}`)
  }

  if (eventHook) {
    await eventHook({ event: { type: "session.idle", properties: { sessionID } } })
    LOG("session.idle done")
  }

  const ledgerPath = path.join(fixtureDir, ".lens", "token-ledger.json")
  let ledger: Record<string, unknown> | null = null
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf-8"))
  } catch {
  }

  let recordedBlocks = 0
  let recordedReads = 0
  let recordedWrites = 0
  let recordedTokens = 0

  if (ledger) {
    const lt = (ledger as Record<string, unknown>).lifetime as Record<string, number> | undefined
    if (lt) {
      recordedBlocks = lt.repeated_reads_blocked ?? 0
      recordedTokens = lt.total_tokens_estimated ?? 0
      recordedReads = lt.total_reads ?? 0
      recordedWrites = lt.total_writes ?? 0
    }
  }

  const tokensBlockedConservative = Math.floor(tokensBlockedFull * 0.8)
  const ledgerChecks = [
    ["reads", recordedReads, expectedLedgerReads],
    ["writes", recordedWrites, expectedLedgerWrites],
    ["tokens", recordedTokens, expectedLedgerTokens],
    ["repeated_blocks", recordedBlocks, expectedLedgerRepeatedBlocks],
  ] as const
  const ledgerMismatches = ledgerChecks
    .filter(([, recorded, expected]) => recorded !== expected)
    .map(([field, recorded, expected]) => `${field}: recorded=${recorded} expected=${expected}`)

  const result = {
    scenario: scenario.name,
    recorded_reads: recordedReads,
    recorded_writes: recordedWrites,
    recorded_blocks: recordedBlocks,
    recorded_tokens: recordedTokens,
    expected_reads: expectedLedgerReads,
    expected_writes: expectedLedgerWrites,
    expected_tokens: expectedLedgerTokens,
    expected_repeated_blocks: expectedLedgerRepeatedBlocks,
    calls_total: totalCalls,
    calls_blocked: callsBlocked,
    cerebrum_warnings: cerebrumWarnings,
    baseline_tokens: baselineTokens,
    actual_tokens_consumed: actualTokens,
    tokens_blocked_full: tokensBlockedFull,
    tokens_blocked_conservative: tokensBlockedConservative,
    expected_blocks: scenario.expectedBlocks,
    expected_cerebrum: scenario.expectedCerebrum,
    ledger_consistent: ledgerMismatches.length === 0,
    ledger_mismatches: ledgerMismatches,
    _debug: debugLog,
  }

  process.stdout.write(JSON.stringify(result) + "\n")
}

run().catch((err) => {
  console.error("Harness crash:", err)
  process.exit(1)
})
