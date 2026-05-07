export interface ScenarioResult {
  scenario: string
  recorded_reads: number
  recorded_writes: number
  recorded_blocks: number
  recorded_tokens: number
  expected_reads: number
  expected_writes: number
  expected_tokens: number
  expected_repeated_blocks: number
  calls_total: number
  calls_blocked: number
  cerebrum_warnings: number
  baseline_tokens: number
  actual_tokens_consumed: number
  tokens_blocked_full: number
  tokens_blocked_conservative: number
  ledger_consistent: boolean
  ledger_mismatches?: string[]
  _debug?: string[]
}

export function generateReport(results: ScenarioResult[]): string {
  const lines: string[] = []

  lines.push("═".repeat(88))
  lines.push("                    RepoLens Quantification Report")
  lines.push("═".repeat(88))
  lines.push(`Report generated: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`)
  lines.push("Plugin version: 1.0.1")
  lines.push("")
  lines.push("Scenario               Calls  Blocked  Warned  Baseline(tok)  Saved(opt)  Opt%  Saved(cons)  Cons%")
  lines.push("─".repeat(88))

  let grandCalls = 0
  let grandBlocked = 0
  let grandWarned = 0
  let grandBaseline = 0
  let grandSavedOpt = 0
  let grandSavedCons = 0

  for (const r of results) {
    const optPct = r.baseline_tokens > 0
      ? `${Math.round((r.tokens_blocked_full / r.baseline_tokens) * 100)}%`
      : "—"
    const consPct = r.baseline_tokens > 0
      ? `${Math.round((r.tokens_blocked_conservative / r.baseline_tokens) * 100)}%`
      : "—"

    const name = r.scenario.padEnd(22)
    const calls = String(r.calls_total).padStart(5)
    const blocked = String(r.calls_blocked).padStart(7)
    const warned = String(r.cerebrum_warnings).padStart(6)
    const baseline = String(r.baseline_tokens).padStart(13)
    const savedOpt = String(r.tokens_blocked_full).padStart(10)
    const optPctStr = optPct.padStart(4)
    const savedCons = String(r.tokens_blocked_conservative).padStart(12)
    const consPctStr = consPct.padStart(5)

    lines.push(`${name} ${calls}  ${blocked}  ${warned}  ${baseline}  ${savedOpt}  ${optPctStr}  ${savedCons}  ${consPctStr}`)

    grandCalls += r.calls_total
    grandBlocked += r.calls_blocked
    grandWarned += r.cerebrum_warnings
    grandBaseline += r.baseline_tokens
    grandSavedOpt += r.tokens_blocked_full
    grandSavedCons += r.tokens_blocked_conservative
  }

  lines.push("─".repeat(88))
  const grandOptPct = grandBaseline > 0
    ? `${Math.round((grandSavedOpt / grandBaseline) * 100)}%`
    : "—"
  const grandConsPct = grandBaseline > 0
    ? `${Math.round((grandSavedCons / grandBaseline) * 100)}%`
    : "—"
  lines.push(
    `TOTAL                    ${String(grandCalls).padStart(5)}  ${String(grandBlocked).padStart(7)}  ` +
    `${String(grandWarned).padStart(6)}  ${String(grandBaseline).padStart(13)}  ` +
    `${String(grandSavedOpt).padStart(10)}  ${grandOptPct.padStart(4)}  ${String(grandSavedCons).padStart(12)}  ${grandConsPct}`,
  )
  lines.push("═".repeat(88))
  lines.push("")

  const consistent = results.every((r) => r.ledger_consistent)
  lines.push(`Token-ledger consistency: ${consistent ? "✓ All scenarios match expected values." : "✗ Mismatch detected."}`)
  for (const r of results) {
    if (!r.ledger_consistent && r.ledger_mismatches?.length) {
      lines.push(`  - ${r.scenario}: ${r.ledger_mismatches.join("; ")}`)
    }
  }
  lines.push("")

  lines.push("Key findings:")
  lines.push(`  • ${grandBlocked} of ${grandCalls} total tool calls were intercepted by RepoLens`)
  lines.push(`  • Optimistic: ~${grandSavedOpt} tokens saved (${grandOptPct}) — AI skips blocked reads entirely`)
  lines.push(`  • Conservative: ~${grandSavedCons} tokens saved (${grandConsPct}) — AI uses grep at 20% cost`)
  if (grandWarned > 0) {
    lines.push(`  • Cerebrum write protection warned on ${grandWarned} attempted write(s)`)
  }

  lines.push("")
  lines.push("═".repeat(88))
  lines.push("                      Notes & Limitations")
  lines.push("═".repeat(88))
  lines.push("This test simulates plugin-level interception, not AI behavioral changes.")
  lines.push("Token estimates use a character-count / 4 approximation.")
  lines.push("'Saved(opt)' = tokens from blocked reads (AI skips entirely).")
  lines.push("'Saved(cons)' = tokens_blocked * 0.8 (AI uses grep at 20% cost).")
  lines.push("Actual savings depend on whether the AI follows plugin guidance.")
  lines.push("═".repeat(88))

  return lines.join("\n")
}
