import * as path from "node:path"
import { pathToFileURL } from "node:url"

const workspace = process.argv[2]

if (!workspace) {
  console.error("Usage: tsx tests/trap-case-v3-quality-gate.ts <workspace>")
  process.exit(2)
}

const targetPath = path.resolve(workspace, "src", "dashboard-state-large.tsx")
const moduleUrl = pathToFileURL(targetPath).href

interface Customer {
  id: string
  name: string
  segment: "vip" | "standard" | "trial"
  region: "na" | "eu" | "apac"
  status: "active" | "paused"
  score: number
}

const customers: Customer[] = [
  { id: "acct-001", name: "VIP North", segment: "vip", region: "na", status: "active", score: 92 },
  { id: "acct-002", name: "Standard West", segment: "standard", region: "na", status: "active", score: 61 },
  { id: "acct-003", name: "VIP Europe", segment: "vip", region: "eu", status: "active", score: 88 },
  { id: "acct-004", name: "Trial APAC", segment: "trial", region: "apac", status: "paused", score: 45 },
  { id: "acct-005", name: "VIP APAC", segment: "vip", region: "apac", status: "active", score: 83 },
]

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

try {
  const mod = await import(`${moduleUrl}?cacheBust=${Date.now()}`)
  const createInitialDashboardState = mod.createInitialDashboardState as ((customers: Customer[]) => Record<string, unknown>) | undefined
  const reduceDashboardState = mod.reduceDashboardState as ((state: Record<string, unknown>, action: Record<string, unknown>) => Record<string, unknown>) | undefined
  const selectVisibleCustomers = mod.selectVisibleCustomers as ((state: Record<string, unknown>) => Customer[]) | undefined

  assert(createInitialDashboardState, "createInitialDashboardState export is missing")
  assert(reduceDashboardState, "reduceDashboardState export is missing")
  assert(selectVisibleCustomers, "selectVisibleCustomers export is missing")

  let state = createInitialDashboardState(customers)
  state = reduceDashboardState(state, { type: "SET_PAGE", value: 2 })
  state = reduceDashboardState(state, { type: "SET_SEARCH", value: "vip" })

  assert(state.pageIndex === 0, `SET_SEARCH should reset pageIndex to 0, got ${String(state.pageIndex)}`)
  const searchVisible = selectVisibleCustomers(state).map((customer) => customer.id)
  assert(
    JSON.stringify(searchVisible) === JSON.stringify(["acct-001", "acct-003"]),
    `SET_SEARCH visible page mismatch: ${JSON.stringify(searchVisible)}`,
  )

  state = reduceDashboardState(state, { type: "SET_PAGE", value: 1 })
  assert(state.pageIndex === 1, `SET_PAGE should preserve requested page, got ${String(state.pageIndex)}`)

  state = reduceDashboardState(state, { type: "SET_SEGMENT", value: "standard" })
  assert(state.pageIndex === 0, `SET_SEGMENT should reset pageIndex to 0, got ${String(state.pageIndex)}`)

  state = reduceDashboardState(state, { type: "SET_PAGE", value: 1 })
  state = reduceDashboardState(state, { type: "SET_REGION", value: "eu" })
  assert(state.pageIndex === 0, `SET_REGION should reset pageIndex to 0, got ${String(state.pageIndex)}`)

  console.log("PASS: dashboard search/filter changes reset pagination while page navigation still works")
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
