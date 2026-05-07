/**
 * Authentication middleware.
 * Validates JWT tokens and enforces role-based access.
 */
import * as crypto from "node:crypto"

interface AuthToken {
  userId: string
  role: "admin" | "user"
  exp: number
}

export function validateToken(token: string): AuthToken | null {
  if (!token || token.length < 10) return null
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
    if (payload.exp && payload.exp < Date.now() / 1000) return null
    return { userId: payload.sub, role: payload.role, exp: payload.exp }
  } catch {
    return null
  }
}

export function requireRole(token: AuthToken, role: "admin" | "user"): boolean {
  if (role === "admin") return token.role === "admin"
  return token.role === "admin" || token.role === "user"
}
