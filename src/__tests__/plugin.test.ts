import { describe, it } from "node:test"
import assert from "node:assert"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { pathToFileURL } from "node:url"
import RepoLensPlugin from "../plugin.ts"

const helperModuleDir = fs.mkdtempSync(path.join(os.tmpdir(), "repolens-helper-module-"))
const helperModulePath = path.join(helperModuleDir, "plugin-with-test-exports.ts")
const pluginSource = fs.readFileSync(new URL("../plugin.ts", import.meta.url), "utf-8")
fs.writeFileSync(
  helperModulePath,
  `${pluginSource}

export {
  estimateTokens,
  isIgnored,
  generateFileDescription,
  extractApplyPatchPaths,
  extractSections,
  parseAnatomy,
  parseCerebrum,
}
`,
  "utf-8",
)

const {
  estimateTokens,
  isIgnored,
  extractApplyPatchPaths,
  extractSections,
  parseAnatomy,
  parseCerebrum,
} = await import(pathToFileURL(helperModulePath).href) as typeof import("../plugin.ts") & {
  estimateTokens: (content: string, ratio: number) => number
  isIgnored: (relPath: string, config: typeof defaultConfig) => boolean
  extractApplyPatchPaths: (patchText: string, projectDir: string) => string[]
  extractSections: (filePath: string) => string[]
  parseAnatomy: (projectDir: string) => Map<string, { desc: string; tokens: number; sections: string[] }>
  parseCerebrum: (projectDir: string) => string[]
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repolens-test-"))
const lensDir = path.join(tmpDir, ".lens")
fs.mkdirSync(lensDir, { recursive: true })

function makeFile(relPath: string, content: string) {
  const absPath = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, content, "utf-8")
}

const defaultConfig = {
  version: "1.0.0",
  enabled: true,
  token_estimation_ratio: 4,
  ignore_patterns: ["node_modules", ".git", "dist", "build", ".lens"],
  ignore_extensions: [".png", ".jpg", ".lock", ".log"],
  auto_scan_on_init: true,
  auto_update_anatomy: true,
  max_scan_files: 1000,
}

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    assert.strictEqual(estimateTokens("", 4), 0)
  })
  it("returns char count / ratio", () => {
    assert.strictEqual(estimateTokens("hello", 1), 5)
    assert.strictEqual(estimateTokens("hello world", 4), 3)
  })
  it("rounds up", () => {
    assert.strictEqual(estimateTokens("abc", 4), 1)
    assert.strictEqual(estimateTokens("abcd", 4), 1)
    assert.strictEqual(estimateTokens("abcde", 4), 2)
  })
})

describe("isIgnored", () => {
  it("ignores known directory patterns", () => {
    assert.strictEqual(isIgnored("node_modules/pkg.js", defaultConfig), true)
    assert.strictEqual(isIgnored("dist/bundle.js", defaultConfig), true)
    assert.strictEqual(isIgnored(".lens/config.json", defaultConfig), true)
    assert.strictEqual(isIgnored("src/app.ts", defaultConfig), false)
  })
  it("ignores binary/image extensions", () => {
    assert.strictEqual(isIgnored("assets/logo.png", defaultConfig), true)
    assert.strictEqual(isIgnored("assets/photo.jpg", defaultConfig), true)
    assert.strictEqual(isIgnored("assets/sprite.webp", {
      ...defaultConfig,
      ignore_extensions: [...defaultConfig.ignore_extensions, ".webp"],
    }), true)
    assert.strictEqual(isIgnored("debug.log", defaultConfig), true)
  })
  it("does not ignore lock files by extension (extension is .json)", () => {
    assert.strictEqual(isIgnored("package-lock.json", defaultConfig), false)
  })
  it("ignores hidden files unless inside .lens directory", () => {
    assert.strictEqual(isIgnored(".env", defaultConfig), true)
    assert.strictEqual(isIgnored(".gitignore", defaultConfig), true)
  })
  it("allows normal source files", () => {
    assert.strictEqual(isIgnored("src/index.ts", defaultConfig), false)
    assert.strictEqual(isIgnored("main.rs", defaultConfig), false)
    assert.strictEqual(isIgnored("app.py", defaultConfig), false)
  })
  it("ignores nested known patterns", () => {
    assert.strictEqual(isIgnored("packages/app/node_modules/pkg.js", defaultConfig), true)
    assert.strictEqual(isIgnored("packages/app/dist/bundle.js", defaultConfig), true)
  })

  it("ignores native build artifacts", () => {
    const nativeConfig = {
      ...defaultConfig,
      ignore_patterns: [...defaultConfig.ignore_patterns, "Builds", "DerivedData"],
      ignore_extensions: [...defaultConfig.ignore_extensions, ".o", ".d", ".dia", ".resp", ".dat"],
    }

    assert.strictEqual(isIgnored("native-app/Builds/MacOSX/DerivedData/foo.o", nativeConfig), true)
    assert.strictEqual(isIgnored("native-app/src/engine.d", nativeConfig), true)
    assert.strictEqual(isIgnored("native-app/src/compile.dia", nativeConfig), true)
    assert.strictEqual(isIgnored("native-app/src/link.resp", nativeConfig), true)
    assert.strictEqual(isIgnored("native-app/src/cache.dat", nativeConfig), true)
    assert.strictEqual(isIgnored("native-app/src/engine.cpp", nativeConfig), false)
  })
})

describe("extractSections", () => {
  it("extracts JS function declarations", () => {
    makeFile("temp/js-fn.ts", `
function hello() {}
export function world() {}
export async function fetch() {}
function _private() {}
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/js-fn.ts"))
    assert.ok(result.some((s) => s.includes("hello()")))
    assert.ok(result.some((s) => s.includes("world()")))
    assert.ok(result.some((s) => s.includes("fetch()")))
  })

  it("extracts arrow function constants", () => {
    makeFile("temp/arrows.ts", `
const handler = (x: number) => x * 2
export const createUser = async (name: string) => ({ name })
const plain = 42
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/arrows.ts"))
    assert.ok(result.some((s) => s.includes("handler()")))
    assert.ok(result.some((s) => s.includes("createUser()")))
    assert.ok(!result.some((s) => s.includes("plain")))
  })

  it("extracts classes, interfaces, and types with correct suffix", () => {
    makeFile("temp/types.ts", `
export class TokenLedger { lifetime: object }
export interface LensConfig { version: string }
export type Result = { ok: boolean }
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/types.ts"))
    assert.ok(result.some((s) => s.includes("class TokenLedger")))
    assert.ok(result.some((s) => s.includes("type LensConfig")))
    assert.ok(result.some((s) => s.includes("type Result")))
    assert.ok(!result.some((s) => s.includes("class") && s.includes("()")))
  })

  it("extracts Python functions and classes", () => {
    makeFile("temp/app.py", `
def hello():
    pass

async def fetch_data():
    pass

class UserModel:
    pass
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/app.py"))
    assert.ok(result.some((s) => s.includes("hello()")))
    assert.ok(result.some((s) => s.includes("fetch_data()")))
    assert.ok(result.some((s) => s.includes("class UserModel")))
  })

  it("extracts Go functions and types", () => {
    makeFile("temp/handler.go", `
func Handle(w http.ResponseWriter, r *http.Request) {}
func (s *Server) Start() error {}
type Config struct {}
type Handler interface {}
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/handler.go"))
    assert.ok(result.some((s) => s.includes("Handle()")))
    assert.ok(result.some((s) => s.includes("type Config")))
    assert.ok(result.some((s) => s.includes("type Handler")))
  })

  it("extracts C++ classes and qualified methods", () => {
    makeFile("temp/panel.cpp", `
class WidgetPanel {};
WidgetPanel::WidgetPanel() {}
void WidgetPanel::initControls() {}
Framework::ParameterLayout ExampleProcessor::createParameterLayout() {}
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/panel.cpp"))
    assert.ok(result.some((s) => s.includes("class WidgetPanel")))
    assert.ok(result.some((s) => s.includes("WidgetPanel::WidgetPanel()")))
    assert.ok(result.some((s) => s.includes("WidgetPanel::initControls()")))
    assert.ok(result.some((s) => s.includes("ExampleProcessor::createParameterLayout()")))
  })

  it("extracts Rust fn, struct, enum, trait, impl", () => {
    makeFile("temp/core.rs", `
fn main() {}
pub fn public_fn() {}
pub async fn async_fn() {}
pub struct User {}
pub enum Status {}
pub trait Handler {}
pub impl Handler for Server {}
`.trim())
    const result = extractSections(path.join(tmpDir, "temp/core.rs"))
    assert.ok(result.some((s) => s.includes("main()")))
    assert.ok(result.some((s) => s.includes("public_fn()")))
    assert.ok(result.some((s) => s.includes("async_fn()")))
    assert.ok(result.some((s) => s.includes("type User")))
    assert.ok(result.some((s) => s.includes("type Status")))
    assert.ok(result.some((s) => s.includes("type Handler")))
  })

  it("caps at 15 sections", () => {
    const bigFile = Array.from({ length: 30 }, (_, i) => `function fn${i}() {}\n`).join("")
    makeFile("temp/big.ts", bigFile)
    const result = extractSections(path.join(tmpDir, "temp/big.ts"))
    assert.strictEqual(result.length, 15)
  })
})

describe("extractApplyPatchPaths", () => {
  it("extracts all file paths from OpenCode apply_patch patchText markers", () => {
    const patchText = `*** Begin Patch
*** Add File: src/new.ts
+export const n = 1
*** Update File: src/api.ts
@@
-old
+new
*** Move to: src/api-renamed.ts
*** Delete File: src/old.ts
*** End Patch`

    assert.deepStrictEqual(
      extractApplyPatchPaths(patchText, tmpDir),
      ["src/new.ts", "src/api.ts", "src/api-renamed.ts", "src/old.ts"],
    )
  })
})

describe("parseAnatomy", () => {
  it("parses anatomy.md into a file→description+token map", () => {
    makeFile(".lens/anatomy.md", `# Anatomy — Project File Map
*Auto-generated.*

## root
- \`README.md\` — Project docs (~500 tok)
- \`package.json\` — Project config (~200 tok)

## src
- \`index.ts\` — Main entry point (~180 tok)
- \`plugin.ts\` — OpenCode plugin (~9000 tok)
  sections:
  - class RepoLens at L10
  - parseAnatomy() at L200

## src/__tests__
- \`plugin.test.ts\` — Test file (~1200 tok)
`.trim())
    const map = parseAnatomy(tmpDir)
    assert.strictEqual(map.size, 5)
    assert.strictEqual(map.get("README.md")?.tokens, 500)
    assert.strictEqual(map.get("src/index.ts")?.tokens, 180)
    assert.strictEqual(map.get("package.json")?.tokens, 200)
    assert.deepStrictEqual(map.get("src/plugin.ts")?.sections, [
      "class RepoLens at L10",
      "parseAnatomy() at L200",
    ])
  })

  it("handles missing anatomy.md gracefully", () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "pl-no-anatomy-"))
    fs.mkdirSync(path.join(emptyTmp, ".lens"), { recursive: true })
    const map = parseAnatomy(emptyTmp)
    assert.strictEqual(map.size, 0)
    fs.rmSync(emptyTmp, { recursive: true, force: true })
  })
})

describe("parseCerebrum", () => {
  it("extracts Do-Not-Repeat entries", () => {
    makeFile(".lens/cerebrum.md", `# Cerebrum

## Do-Not-Repeat

- 2026-01-01: Never use var — always const or let
- 2026-01-02: Fix template literal syntax in JSX

## User Preferences

- Prefers functional components
`.trim())
    const warnings = parseCerebrum(tmpDir)
    assert.strictEqual(warnings.length, 2)
    assert.ok(warnings[0].includes("Never use var"))
    assert.ok(warnings[1].includes("template literal"))
  })

  it("skips comment markers and hints", () => {
    makeFile(".lens/cerebrum.md", `# Cerebrum

## Do-Not-Repeat

- 2026-01-01: Valid warning
- _This section is checked before writes_
<!-- - This is a comment -->
- 2026-01-02: Another warning
`.trim())
    const warnings = parseCerebrum(tmpDir)
    assert.strictEqual(warnings.length, 2)
  })

  it("handles missing cerebrum.md gracefully", () => {
    const emptyTmp = fs.mkdtempSync(path.join(os.tmpdir(), "pl-no-cerebrum-"))
    fs.mkdirSync(path.join(emptyTmp, ".lens"), { recursive: true })
    const warnings = parseCerebrum(emptyTmp)
    assert.strictEqual(warnings.length, 0)
    fs.rmSync(emptyTmp, { recursive: true, force: true })
  })
})

describe("RepoLensPlugin lifecycle", () => {
  it("keeps updating a session after idle and finalizes without duplicating ledger totals", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-lifecycle-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/a.ts"), "export function a() { return 1 }\n", "utf-8")
    fs.writeFileSync(path.join(projectDir, "src/b.ts"), "export function b() { return 2 }\n", "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-a"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)

      async function read(filePath: string, callID: string) {
        await handlers["tool.execute.before"]!(
          { tool: "Read", sessionID, callID } as never,
          { args: { filePath } } as never,
        )
        await handlers["tool.execute.after"]!(
          { tool: "Read", sessionID, callID, args: { filePath } } as never,
          { title: "", output: "", metadata: {} } as never,
        )
      }

      await read("src/a.ts", "1")
      await handlers.event!({ event: { type: "session.idle", properties: { sessionID } } } as never)

      await read("src/b.ts", "2")
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      const ledger = JSON.parse(
        fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"),
      )

      assert.strictEqual(ledger.sessions.length, 1)
      assert.strictEqual(ledger.sessions[0].session_id, sessionID)
      assert.strictEqual(ledger.sessions[0].reads, 2)
      assert.strictEqual(ledger.sessions[0].full_reads, 2)
      assert.strictEqual(ledger.sessions[0].range_reads, 0)
      assert.strictEqual(ledger.sessions[0].summary.full_reads, 2)
      assert.strictEqual(ledger.sessions[0].summary.range_reads, 0)
      assert.strictEqual(ledger.sessions[0].events.filter((event: { tool: string }) => event.tool === "read").length, 2)
      assert.strictEqual(ledger.lifetime.total_sessions, 1)
      assert.strictEqual(ledger.lifetime.total_reads, 2)
      assert.strictEqual(ledger.lifetime.full_reads, 2)

      const memory = fs.readFileSync(path.join(projectDir, ".lens", "memory.md"), "utf-8")
      assert.match(memory, /Session session-a ended/)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("reloads config changes during a running session", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-config-reload-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/a.ts"), "export function a() { return 1 }\n", "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-config"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)
      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/a.ts" } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/a.ts" } } as never,
        {} as never,
      )

      const configPath = path.join(projectDir, ".lens", "config.json")
      fs.writeFileSync(configPath, JSON.stringify({
        ...defaultConfig,
        ignore_patterns: ["node_modules", ".git", "dist", "build"],
        mode: "warn",
      }), "utf-8")
      const future = new Date(Date.now() + 1000)
      fs.utimesSync(configPath, future, future)

      const originalWarn = console.warn
      const warnings: unknown[][] = []
      console.warn = (...args: unknown[]) => { warnings.push(args) }
      try {
        await handlers["tool.execute.before"]!(
          { tool: "Read", sessionID } as never,
          { args: { filePath: "src/a.ts" } } as never,
        )
      } finally {
        console.warn = originalWarn
      }
      assert.strictEqual(warnings.length, 1)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("warns on first large full-file read and migrates ledger counters", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-large-warn-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/big.ts"), `export const big = "${"x".repeat(40000)}"\n`, "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "config.json"), JSON.stringify({
      ...defaultConfig,
      large_file_policy: "warn",
      large_file_threshold_tokens: 8000,
    }), "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "token-ledger.json"), JSON.stringify({
      lifetime: {
        total_tokens_estimated: 0,
        total_reads: 0,
        total_writes: 0,
        total_sessions: 0,
        anatomy_hits: 0,
        repeated_reads_blocked: 0,
      },
      sessions: [],
    }), "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-large-warn"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)

      const originalWarn = console.warn
      const warnings: unknown[][] = []
      console.warn = (...args: unknown[]) => { warnings.push(args) }
      try {
        await handlers["tool.execute.before"]!(
          { tool: "Read", sessionID } as never,
          { args: { filePath: "src/big.ts" } } as never,
        )
      } finally {
        console.warn = originalWarn
      }

      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/big.ts" } } as never,
        {} as never,
      )
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      assert.strictEqual(warnings.length, 1)
      assert.match(String(warnings[0][0]), /Large file read/)

      const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"))
      assert.strictEqual(ledger.sessions[0].full_reads, 1)
      assert.strictEqual(ledger.sessions[0].range_reads, 0)
      assert.strictEqual(ledger.sessions[0].large_full_reads_warned, 1)
      assert.strictEqual(ledger.sessions[0].large_full_reads_blocked, 0)
      assert.strictEqual(ledger.sessions[0].summary.large_full_reads_warned, 1)
      assert.strictEqual(ledger.sessions[0].events.some((event: { outcome: string; reason: string }) =>
        event.outcome === "warned" && event.reason === "large_file",
      ), true)
      assert.strictEqual(ledger.lifetime.large_full_reads_warned, 1)
      assert.strictEqual(ledger.lifetime.large_full_reads_blocked, 0)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("blocks first large full-file read in strict policy but allows exact retry", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-large-strict-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/big.ts"), [
      "export class BigEngine {",
      "  process() { return 1 }",
      "}",
      "export function triangleWave() { return 0 }",
      `export const big = "${"x".repeat(5000)}"`,
    ].join("\n"), "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "config.json"), JSON.stringify({
      ...defaultConfig,
      large_file_policy: "strict",
      large_file_threshold_tokens: 5,
      large_file_allow_globs: [],
    }), "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-large-strict"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)

      await assert.rejects(
        handlers["tool.execute.before"]!(
          { tool: "Read", sessionID } as never,
          { args: { filePath: "src/big.ts" } } as never,
        ),
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          assert.match(message, /Large file read/)
          assert.match(message, /Known sections/)
          assert.match(message, /class BigEngine at L1/)
          assert.match(message, /triangleWave\(\) at L4/)
          assert.match(message, /Suggested range reads/)
          return true
        },
      )

      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/big.ts" } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/big.ts" } } as never,
        {} as never,
      )
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"))
      assert.strictEqual(ledger.sessions[0].full_reads, 1)
      assert.strictEqual(ledger.sessions[0].large_full_reads_warned, 0)
      assert.strictEqual(ledger.sessions[0].large_full_reads_blocked, 1)
      assert.strictEqual(ledger.sessions[0].summary.estimated_tokens_intercepted > 0, true)
      assert.strictEqual(ledger.sessions[0].summary.estimated_tokens_avoided, 0)
      assert.strictEqual(ledger.lifetime.large_full_reads_blocked, 1)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("adaptive large-file policy warns first, blocks the next full read, then allows one retry", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-large-adaptive-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/big.ts"), [
      "export class BigEngine {",
      "  process() { return 1 }",
      "}",
      `export const big = "${"x".repeat(5000)}"`,
    ].join("\n"), "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "config.json"), JSON.stringify({
      ...defaultConfig,
      mode: "adaptive",
      adaptive_threshold: 5,
      large_file_policy: "adaptive",
      large_file_threshold_tokens: 5,
      large_file_allow_globs: [],
    }), "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-large-adaptive"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)

      const originalWarn = console.warn
      const warnings: unknown[][] = []
      console.warn = (...args: unknown[]) => { warnings.push(args) }
      try {
        await handlers["tool.execute.before"]!(
          { tool: "Read", sessionID } as never,
          { args: { filePath: "src/big.ts" } } as never,
        )
      } finally {
        console.warn = originalWarn
      }
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/big.ts" } } as never,
        {} as never,
      )

      assert.strictEqual(warnings.length, 1)
      assert.match(String(warnings[0][0]), /Large file read/)

      await assert.rejects(
        handlers["tool.execute.before"]!(
          { tool: "Read", sessionID } as never,
          { args: { filePath: "src/big.ts" } } as never,
        ),
        /Large file read/,
      )

      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/big.ts" } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/big.ts" } } as never,
        {} as never,
      )
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"))
      assert.strictEqual(ledger.sessions[0].full_reads, 2)
      assert.strictEqual(ledger.sessions[0].large_full_reads_warned, 1)
      assert.strictEqual(ledger.sessions[0].large_full_reads_blocked, 1)
      assert.strictEqual(ledger.sessions[0].repeated_reads_blocked, 0)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("does not apply the large-file guard to range reads", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-large-range-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/big.ts"), `export const big = "${"x".repeat(200)}"\n`, "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "config.json"), JSON.stringify({
      ...defaultConfig,
      large_file_policy: "strict",
      large_file_threshold_tokens: 5,
    }), "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-large-range"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)
      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/big.ts", offset: 1, limit: 20 } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/big.ts", offset: 1, limit: 20 } } as never,
        {} as never,
      )
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"))
      assert.strictEqual(ledger.sessions[0].full_reads, 0)
      assert.strictEqual(ledger.sessions[0].range_reads, 1)
      assert.strictEqual(ledger.sessions[0].large_full_reads_blocked, 0)
      assert.strictEqual(ledger.sessions[0].summary.range_reads, 1)
      assert.strictEqual(ledger.sessions[0].events[0].read_kind, "range")
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("allows a first full-file read after earlier range reads", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-range-then-full-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/api.ts"), "export function api() { return 1 }\n", "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "config.json"), JSON.stringify({
      ...defaultConfig,
      mode: "strict",
      large_file_policy: "off",
    }), "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-range-then-full"

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)
      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/api.ts", offset: 1, limit: 5 } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/api.ts", offset: 1, limit: 5 } } as never,
        {} as never,
      )

      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/api.ts" } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/api.ts" } } as never,
        {} as never,
      )
      await handlers.event!({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } } as never)

      const ledger = JSON.parse(fs.readFileSync(path.join(projectDir, ".lens", "token-ledger.json"), "utf-8"))
      assert.strictEqual(ledger.sessions[0].full_reads, 1)
      assert.strictEqual(ledger.sessions[0].range_reads, 1)
      assert.strictEqual(ledger.sessions[0].repeated_reads_blocked, 0)
      assert.strictEqual(ledger.sessions[0].events.some((event: { reason?: string }) => event.reason === "repeated_read"), false)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("lazily creates anatomy when OpenCode does not emit session.created", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-lazy-anatomy-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/a.ts"), "export function a() { return 1 }\n", "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)

      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID: "session-lazy" } as never,
        { args: { filePath: "src/a.ts" } } as never,
      )

      const anatomy = fs.readFileSync(path.join(projectDir, ".lens", "anatomy.md"), "utf-8")
      assert.match(anatomy, /a\.ts/)
      assert.ok(fs.existsSync(path.join(projectDir, ".lens", "session-briefing.md")))
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it("uses apply_patch patchText paths for cerebrum warnings and cache clearing", async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "pl-apply-patch-"))
    fs.mkdirSync(path.join(projectDir, "src"), { recursive: true })
    fs.mkdirSync(path.join(projectDir, ".lens"), { recursive: true })
    fs.writeFileSync(path.join(projectDir, "src/api.ts"), "export function api() { return 1 }\n", "utf-8")
    fs.writeFileSync(path.join(projectDir, ".lens", "cerebrum.md"), `# Cerebrum

## Do-Not-Repeat

- 2026-05-06: API file needs extra care. (file: src/api.ts)
`, "utf-8")

    try {
      const handlers = await RepoLensPlugin({ project: { name: "test" }, directory: projectDir } as never)
      const sessionID = "session-patch"
      const patchText = `*** Begin Patch
*** Update File: src/api.ts
@@
-export function api() { return 1 }
+export function api() { return 2 }
*** End Patch`

      await handlers.event!({ event: { type: "session.created", properties: { info: { id: sessionID } } } } as never)
      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/api.ts" } } as never,
      )
      await handlers["tool.execute.after"]!(
        { tool: "Read", sessionID, args: { filePath: "src/api.ts" } } as never,
        {} as never,
      )

      await assert.rejects(
        handlers["tool.execute.before"]!(
          { tool: "apply_patch", sessionID } as never,
          { args: { patchText } } as never,
        ),
        /Cerebrum/,
      )

      await handlers["tool.execute.before"]!(
        { tool: "apply_patch", sessionID } as never,
        { args: { patchText } } as never,
      )
      fs.writeFileSync(path.join(projectDir, "src/api.ts"), "export function api() { return 2 }\n", "utf-8")
      await handlers["tool.execute.after"]!(
        { tool: "apply_patch", sessionID, args: { patchText } } as never,
        {} as never,
      )

      await handlers["tool.execute.before"]!(
        { tool: "Read", sessionID } as never,
        { args: { filePath: "src/api.ts" } } as never,
      )

      const anatomy = fs.readFileSync(path.join(projectDir, ".lens", "anatomy.md"), "utf-8")
      assert.match(anatomy, /api\.ts/)
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
  })
})

process.on("exit", () => {
  fs.rmSync(helperModuleDir, { recursive: true, force: true })
  fs.rmSync(tmpDir, { recursive: true, force: true })
})
