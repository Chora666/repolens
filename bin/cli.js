#!/usr/bin/env node
import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)
const command = args[0]

if (command !== "init") {
  console.log([
    "RepoLens — Repo-aware context for OpenCode",
    "",
    "Usage:",
    "  repolens init               Initialize in current directory (skip existing)",
    "  repolens init --force        Overwrite existing files",
    "  repolens init --dry-run      Preview what would be written",
    "  repolens init --dir <path>   Initialize in a specific directory",
    "",
  ].join("\n"))
  process.exit(0)
}

const dirIndex = args.indexOf("--dir")
const projectDir = dirIndex !== -1 ? path.resolve(args[dirIndex + 1] || ".") : process.cwd()
const forceMode = args.includes("--force")
const dryRun = args.includes("--dry-run")
const pkgDir = path.resolve(__dirname, "..")

const templatesSrc = path.join(pkgDir, "templates")
const pluginSrc = path.join(pkgDir, "src", "plugin.ts")
const lensDir = path.join(projectDir, ".lens")
const pluginsDir = path.join(projectDir, ".opencode", "plugins")
const pluginDest = path.join(pluginsDir, "repolens.ts")
const guideDest = path.join(projectDir, "REPOLENS.md")

console.log(`RepoLens: Initializing in ${projectDir}`)
if (dryRun) console.log("  (dry run — no files will be written)")

let wrote = 0
let skipped = 0

function maybeCopy(src, dest, label) {
  if (fs.existsSync(dest) && !forceMode) {
    console.log(`  ~ SKIP (already exists): ${label}`)
    skipped++
  } else if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    console.log(`  + ${label}`)
    wrote++
  } else {
    console.log(`  + ${label} (dry run)`)
    wrote++
  }
}

try {
  maybeCopy(pluginSrc, pluginDest, ".opencode/plugins/repolens.ts")

  if (fs.existsSync(templatesSrc)) {
    for (const entry of fs.readdirSync(templatesSrc, { withFileTypes: true })) {
      const srcPath = path.join(templatesSrc, entry.name)
      if (entry.name === "REPOLENS.md") {
        maybeCopy(srcPath, guideDest, "REPOLENS.md")
      } else if (entry.isFile()) {
        maybeCopy(srcPath, path.join(lensDir, entry.name), `.lens/${entry.name}`)
      }
    }
  }

  if (dryRun) {
    console.log(`\nDry run complete. ${wrote} file(s) would be written, ${skipped} skipped.`)
  } else {
    console.log(`\nRepoLens initialized: ${wrote} written, ${skipped} skipped.`)
    if (wrote > 0) {
      console.log("Restart OpenCode to activate.")
      console.log("The plugin will auto-scan your project on the first session.")
    }
    if (skipped > 0) {
      console.log("Use --force to overwrite existing files.")
    }
  }
} catch (err) {
  console.error("RepoLens init failed:", err)
  process.exit(1)
}
