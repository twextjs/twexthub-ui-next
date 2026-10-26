import { TwextHubError } from "@twextjs/twexthubkit"

import { serverApi } from "@/lib/api.server"
import {
  decodeValue,
  encodeValue,
  type EncodedValue,
  type RpcRequestBody,
} from "@/lib/rpc"
import {
  commitSession,
  destroySession,
  readSession,
} from "@/lib/session.server"

const BLOCKED = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "then",
  "toString",
  "valueOf",
])

function resolveMethod(kit: unknown, path: string[]) {
  if (path.length < 2) {
    throw new Error("Unknown API method.")
  }

  let target: unknown = kit
  for (const segment of path.slice(0, -1)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(segment) || BLOCKED.has(segment)) {
      throw new Error("Unknown API method.")
    }
    const next = (target as Record<string, unknown> | null)?.[segment]
    if (next === null || typeof next !== "object") {
      throw new Error("Unknown API method.")
    }
    target = next
  }

  const name = path[path.length - 1]
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name) || BLOCKED.has(name)) {
    throw new Error("Unknown API method.")
  }

  const method = (target as Record<string, unknown>)[name]
  if (typeof method !== "function") {
    throw new Error("Unknown API method.")
  }

  return (method as (...args: unknown[]) => Promise<unknown>).bind(target)
}

function isSessionPayload(
  value: unknown
): value is { token: string; user: unknown } {
  if (!value || typeof value !== "object") {
    return false
  }
  const candidate = value as { token?: unknown; user?: unknown }
  return typeof candidate.token === "string" && Boolean(candidate.user)
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { error: { message: "Method not allowed.", status: 405 } },
      { status: 405, headers: { allow: "POST" } }
    )
  }

  let body: RpcRequestBody
  try {
    body = (await request.json()) as RpcRequestBody
  } catch {
    return Response.json(
      { error: { message: "Invalid request body.", status: 400 } },
      { status: 400 }
    )
  }

  const path = Array.isArray(body?.path) ? body.path : null
  const encodedArgs: EncodedValue[] = Array.isArray(body?.args) ? body.args : []
  if (!path || path.some((segment) => typeof segment !== "string")) {
    return Response.json(
      { error: { message: "Invalid API path.", status: 400 } },
      { status: 400 }
    )
  }

  const session = await readSession(request)
  const kit = serverApi(session.get("token"))
  const headers = new Headers()
  const revoking = path.join(".") === "sessions.revokeCurrent"

  try {
    const method = resolveMethod(kit, path)
    const args = encodedArgs.map((arg) => decodeValue(arg))
    let result = await method(...args)

    if (isSessionPayload(result)) {
      const { token, ...rest } = result
      session.set("token", token)
      session.unset("remember")
      headers.set("Set-Cookie", await commitSession(session))
      result = rest
    }

    if (revoking) {
      session.unset("token")
      session.unset("remember")
      headers.set("Set-Cookie", await destroySession(session))
    }

    return Response.json({ result: await encodeValue(result) }, { headers })
  } catch (error) {
    if (revoking) {
      session.unset("token")
      session.unset("remember")
      headers.set("Set-Cookie", await destroySession(session))
    }

    const status = error instanceof TwextHubError ? (error.status ?? 502) : 502
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The registry request failed."

    return Response.json(
      { error: { message, status } },
      { status: status >= 400 && status <= 599 ? status : 502, headers }
    )
  }
}
