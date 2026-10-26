import "@/lib/env.server"

import { createCookieSessionStorage, type Session } from "react-router"

interface SessionData {
  token: string
  remember: boolean
}

// A deployment should set SESSION_SECRET. The fallback keeps local development
// and `react-router dev` usable without any setup.
const secret =
  process.env.SESSION_SECRET ?? "twexthub-development-session-secret"

const production = process.env.NODE_ENV === "production"

export const sessionStore = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "twexthub_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [secret],
    // Production is expected to terminate TLS in front of the app. Local
    // development is plain HTTP, where a Secure cookie would never be stored.
    secure: production,
  },
})

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30

export function readSession(request: Request): Promise<Session<SessionData>> {
  return sessionStore.getSession(request.headers.get("cookie"))
}

export function commitSession(session: Session<SessionData>): Promise<string> {
  return sessionStore.commitSession(
    session,
    session.get("remember") ? { maxAge: REMEMBER_MAX_AGE } : undefined
  )
}

export function destroySession(session: Session<SessionData>) {
  return sessionStore.destroySession(session)
}

export async function sessionToken(request: Request): Promise<string | null> {
  const session = await readSession(request)
  return session.get("token") ?? null
}

export function requireSessionSecret(): void {
  if (production && !process.env.SESSION_SECRET) {
    throw new Error(
      "SESSION_SECRET must be set in production so sessions survive restarts."
    )
  }
}
