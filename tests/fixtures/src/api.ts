/**
 * API module entry point.
 * Handles request routing and middleware chain setup.
 */
import { createServer } from "./server"
import type { LensConfig } from "./types"

export function createAPI(config: LensConfig) {
  const server = createServer(config)

  function handleRequest(method: string, path: string, body: unknown) {
    if (method === "GET" && path === "/health") {
      return { status: 200, body: { ok: true, uptime: process.uptime() } }
    }
    if (method === "POST" && path === "/data") {
      return server.process(body)
    }
    return { status: 404, body: { error: "not found" } }
  }

  function getRoutes() {
    return ["GET /health", "POST /data"]
  }

  function shutdown() {
    server.dispose()
  }

  return { handleRequest, getRoutes, shutdown }
}

export type { LensConfig } from "./types"
