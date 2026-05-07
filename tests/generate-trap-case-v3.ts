import * as fs from "node:fs"
import * as path from "node:path"

const projectRoot = path.resolve(import.meta.dirname!, "..")
const fixtureRoot = path.join(projectRoot, "tests", "fixtures", "trap-case-v3")
const srcDir = path.join(fixtureRoot, "src")

const header = `// Trap Case V3: dashboard state fixture with an executable pagination oracle.
// The file is intentionally over 8k estimated tokens so RepoLens' default
// strict threshold can be tested on a non-audio, app-state style bug.

export interface Customer {
  id: string
  name: string
  segment: "vip" | "standard" | "trial"
  region: "na" | "eu" | "apac"
  status: "active" | "paused"
  score: number
}

export interface DashboardState {
  customers: Customer[]
  searchTerm: string
  segment: "all" | Customer["segment"]
  region: "all" | Customer["region"]
  pageIndex: number
  pageSize: number
  selectedIds: string[]
}

export type DashboardAction =
  | { type: "SET_SEARCH"; value: string }
  | { type: "SET_SEGMENT"; value: DashboardState["segment"] }
  | { type: "SET_REGION"; value: DashboardState["region"] }
  | { type: "SET_PAGE"; value: number }
  | { type: "TOGGLE_SELECTED"; id: string }

export function createInitialDashboardState(customers: Customer[]): DashboardState {
  return {
    customers,
    searchTerm: "",
    segment: "all",
    region: "all",
    pageIndex: 0,
    pageSize: 2,
    selectedIds: [],
  }
}

export function reduceDashboardState(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "SET_SEARCH":
      return {
        ...state,
        searchTerm: action.value,
        // BUG: changing search should reset pagination to the first page.
        pageIndex: state.pageIndex,
      }

    case "SET_SEGMENT":
      return {
        ...state,
        segment: action.value,
        // BUG: changing filters should reset pagination to the first page.
        pageIndex: state.pageIndex,
      }

    case "SET_REGION":
      return {
        ...state,
        region: action.value,
        // BUG: changing filters should reset pagination to the first page.
        pageIndex: state.pageIndex,
      }

    case "SET_PAGE":
      return {
        ...state,
        pageIndex: Math.max(0, action.value),
      }

    case "TOGGLE_SELECTED": {
      const selected = new Set(state.selectedIds)
      if (selected.has(action.id)) selected.delete(action.id)
      else selected.add(action.id)
      return {
        ...state,
        selectedIds: [...selected],
      }
    }
  }
}

export function selectFilteredCustomers(state: DashboardState): Customer[] {
  const query = state.searchTerm.trim().toLowerCase()
  return state.customers.filter((customer) => {
    if (query && !customer.name.toLowerCase().includes(query) && !customer.id.toLowerCase().includes(query)) {
      return false
    }
    if (state.segment !== "all" && customer.segment !== state.segment) return false
    if (state.region !== "all" && customer.region !== state.region) return false
    return true
  })
}

export function selectVisibleCustomers(state: DashboardState): Customer[] {
  const filtered = selectFilteredCustomers(state)
  const start = state.pageIndex * state.pageSize
  return filtered.slice(start, start + state.pageSize)
}

`

function makeFillerModule(index: number): string {
  return `
export interface DashboardMetric${index} {
  id: string
  label: string
  current: number
  previous: number
  trend: "up" | "down" | "flat"
  weight: number
}

export function normalizeMetric${index}(metric: DashboardMetric${index}): DashboardMetric${index} {
  const delta = metric.current - metric.previous
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  return {
    id: metric.id,
    label: metric.label.trim(),
    current: Number.isFinite(metric.current) ? metric.current : 0,
    previous: Number.isFinite(metric.previous) ? metric.previous : 0,
    trend,
    weight: Math.max(0, Math.min(1, metric.weight)),
  }
}

export function scoreMetric${index}(metric: DashboardMetric${index}): number {
  const normalized = normalizeMetric${index}(metric)
  const direction = normalized.trend === "up" ? 1 : normalized.trend === "down" ? -1 : 0
  return (normalized.current * normalized.weight) + direction * ${(index % 11) + 1}
}
`
}

function makePackageJson(): string {
  return `${JSON.stringify({
    name: "repolens-trap-case-v3",
    version: "1.0.0",
    type: "module",
    private: true,
  }, null, 2)}\n`
}

function makePrompt(): string {
  return `Find and fix the bug in src/dashboard-state-large.tsx where changing the dashboard search term or filters can leave the user on an empty or stale pagination page.

Expected behavior: changing search, segment, or region must reset pageIndex to 0. Page navigation itself should still respect the requested page.

Make the smallest safe code change in src/dashboard-state-large.tsx, then briefly explain what you changed. No test run is required; do not search dependency directories or test directories.
`
}

fs.rmSync(fixtureRoot, { recursive: true, force: true })
fs.mkdirSync(srcDir, { recursive: true })

let source = header
for (let i = 1; i <= 60; i++) {
  source += makeFillerModule(i)
}

fs.writeFileSync(path.join(srcDir, "dashboard-state-large.tsx"), source)
fs.writeFileSync(path.join(fixtureRoot, "package.json"), makePackageJson())
fs.writeFileSync(path.join(fixtureRoot, "PROMPT.md"), makePrompt())

const bytes = Buffer.byteLength(source, "utf8")
const tokens = Math.ceil(bytes / 4)

console.log(`Generated ${path.relative(projectRoot, fixtureRoot)}`)
console.log(`dashboard-state-large.tsx: ${bytes} bytes, ~${tokens} estimated tokens`)
