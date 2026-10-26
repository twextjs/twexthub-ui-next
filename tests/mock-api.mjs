// A small registry stand-in for the Playwright journeys. The app server calls
// this process, so browser-side route interception can no longer mock the API.
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"

const PORT = Number(process.env.MOCK_API_PORT ?? 3200)
const ORIGIN = `http://127.0.0.1:${PORT}`
const UI_ORIGIN = process.env.MOCK_UI_ORIGIN ?? "http://127.0.0.1:3101"

const account = {
  namespace: "kamixfox",
  displayName: "Testing Account",
  kind: "user",
  role: "admin",
  hasPublished: true,
  termsAcceptedVersion: 1,
  bio: "Testing hello world.",
  avatarUrl: null,
  bannerUrl: null,
  createdAt: "2026-10-25T19:28:20.502Z",
}

const otherAccount = {
  namespace: "otheruser",
  displayName: "Other Account",
  kind: "user",
  role: "normal",
  hasPublished: false,
  bio: "Another publisher.",
  avatarUrl: null,
  bannerUrl: null,
  createdAt: "2026-10-20T10:00:00.000Z",
}

// Mutable so the admin journey can save a document and read it back.
const legal = {
  terms: {
    version: 1,
    body: "Mock document.",
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
  privacy: {
    version: 1,
    body: "Mock document.",
    updatedAt: "2026-10-01T00:00:00.000Z",
  },
}

// Mutable so the admin quota journey can read usage, set a cap, and read it
// back. A null cap means the account follows the registry default.
const quotas = new Map([
  ["kamixfox", { blobBytes: 5 * 1024 * 1024, maxBlobBytes: null }],
  ["otheruser", { blobBytes: 0, maxBlobBytes: null }],
])

// Mutable so the security journey can rename a passkey and read it back.
const passkeys = [
  {
    id: 1,
    label: "Laptop",
    createdAt: "2026-10-01T09:00:00.000Z",
    lastUsedAt: "2026-10-24T18:30:00.000Z",
  },
]

const versions = [
  {
    namespace: "kamixfox",
    id: "myextension",
    version: "0.2.0",
    status: "published",
    name: "Hello",
    license: "MIT",
    description: "A minimal hello world extension.",
    createdAt: "2026-10-26T09:00:00.000Z",
    publishedAt: "2026-10-26T09:01:00.000Z",
    downloads: 1,
    _links: {
      source: `${ORIGIN}/v2/@kamixfox/myextension/versions/0.2.0/source`,
      download: `${ORIGIN}/v2/@kamixfox/myextension/versions/0.2.0/download`,
    },
  },
  {
    namespace: "kamixfox",
    id: "myextension",
    version: "0.1.0",
    status: "published",
    name: "Hello",
    license: "MIT",
    description: "A minimal hello world extension.",
    createdAt: "2026-10-25T19:42:25.808Z",
    publishedAt: "2026-10-25T19:42:56.079Z",
    downloads: 4,
    _links: {
      source: `${ORIGIN}/v2/@kamixfox/myextension/versions/0.1.0/source`,
      download: `${ORIGIN}/v2/@kamixfox/myextension/versions/0.1.0/download`,
    },
  },
]

const pendingVersion = {
  namespace: "kamixfox",
  id: "myextension",
  version: "0.3.0",
  status: "pending",
  ownerNamespace: "kamixfox",
  name: "Hello",
  license: "MIT",
  description: "A minimal hello world extension.",
  createdAt: "2026-10-26T10:00:00.000Z",
  downloads: 0,
  _links: {
    source: `${ORIGIN}/v2/@kamixfox/myextension/versions/0.3.0/source`,
  },
}

const detail = {
  namespace: "kamixfox",
  id: "myextension",
  name: "Hello",
  version: "0.2.0",
  description: "A minimal hello world extension.",
  publishedAt: "2026-10-26T09:01:00.000Z",
  downloads: 5,
  author: "kamixfox",
  license: "MIT",
  color1: "#0070F3",
  isUnsandboxed: false,
  versions,
}

const summary = {
  namespace: "kamixfox",
  id: "myextension",
  name: "Hello",
  version: "0.2.0",
  description: "A minimal hello world extension.",
  publishedAt: "2026-10-26T09:01:00.000Z",
  downloads: 5,
}

const owners = {
  data: [
    {
      namespace: "kamixfox",
      display_name: "Testing Account",
      kind: "user",
      role: "admin",
      added_at: "2026-10-25T19:42:25.812Z",
    },
  ],
  _links: { next: null, prev: null },
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, "utf8")
  header.write("0000644\0", 100, 8)
  header.write("0000000\0", 108, 8)
  header.write("0000000\0", 116, 8)
  header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, 12)
  header.write("00000000000\0", 136, 12)
  header.fill(" ", 148, 156)
  header[156] = 0x30
  header.write("ustar\0", 257, 6)
  header.write("00", 263, 2)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8)
  return header
}

function sourceArchive(files) {
  const parts = []
  for (const [path, text] of Object.entries(files)) {
    const content = Buffer.from(text)
    parts.push(tarHeader(path, content.length), content)
    parts.push(Buffer.alloc((512 - (content.length % 512)) % 512))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

const archives = {
  "0.1.0": sourceArchive({
    "twext.yml": "id: myextension\n",
    "src/index.ts": 'export const greeting = "hello"\n',
  }),
  "0.2.0": sourceArchive({
    "twext.yml": "id: myextension\n",
    "src/index.ts": 'export const greeting = "hello world"\n',
    "src/extra.ts": "export const extra = true\n",
  }),
  "0.3.0": sourceArchive({
    "twext.yml": "id: myextension\n",
    "src/index.ts": 'export const greeting = "hello reviewers"\n',
    "src/extra.ts": "export const extra = true\n",
  }),
}

const builds = {
  "0.1.0": 'var greeting="hello";',
  "0.2.0": 'var greeting="hello world";function add(a,b){return a+b}',
  "0.3.0": 'var greeting="hello reviewers";',
}

const flows = new Map()

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => resolve(body))
  })
}

function cookieValue(req, name) {
  const header = req.headers.cookie ?? ""
  for (const part of header.split(";")) {
    const [key, value] = part.trim().split("=")
    if (key === name) {
      return decodeURIComponent(value ?? "")
    }
  }
  return null
}

function beginFlow(req, res, link, returnToOverride) {
  const url = new URL(req.url, ORIGIN)
  const returnTo =
    returnToOverride ||
    url.searchParams.get("returnTo") ||
    `${UI_ORIGIN}/dashboard`
  const state = randomUUID()
  flows.set(state, { returnTo, link })
  res.setHeader(
    "set-cookie",
    `mock_oidc_flow=${state}; Path=/v2/auth; HttpOnly; SameSite=Lax`
  )

  const authorizationUrl = `${ORIGIN}/idp/authorize?state=${state}`
  if ((req.headers.accept ?? "").includes("application/json")) {
    return json(res, 200, { authorizationUrl })
  }
  res.writeHead(302, { location: authorizationUrl })
  res.end()
}

function handle(req, res) {
  const url = new URL(req.url, ORIGIN)
  const path = url.pathname.replace(/^\/v2/, "")

  if (url.pathname === "/idp/authorize") {
    const state = url.searchParams.get("state") ?? ""
    res.writeHead(302, {
      location: `${ORIGIN}/v2/auth/oidc/callback?state=${encodeURIComponent(state)}&code=test-code`,
    })
    return res.end()
  }

  if (path === "/auth/oidc/callback") {
    const state = url.searchParams.get("state") ?? ""
    const flow = flows.get(state)
    if (!flow || cookieValue(req, "mock_oidc_flow") !== state) {
      res.writeHead(400, { "content-type": "text/plain" })
      return res.end("Missing or invalid identity provider flow")
    }
    flows.delete(state)
    const target = new URL(flow.returnTo)
    if (flow.link) {
      target.searchParams.set("oidc_linked", "1")
    } else {
      target.searchParams.set("oidc_code", "oidc-exchange-code")
    }
    res.writeHead(302, { location: target.toString() })
    return res.end()
  }

  if (path === "/auth" && req.method === "GET") {
    return json(res, 200, {
      passwordAuth: true,
      oidc: { issuer: `${ORIGIN}/idp`, required: false },
      device: null,
    })
  }

  if (path === "/auth/oidc/authorize" && req.method === "GET") {
    return beginFlow(req, res, false)
  }

  if (path === "/auth/oidc/link" && req.method === "POST") {
    if (!req.headers.authorization) {
      return json(res, 401, { detail: "Missing session token" })
    }
    return readBody(req).then((body) => {
      let returnTo
      try {
        returnTo = JSON.parse(body).returnTo
      } catch {
        returnTo = undefined
      }
      return beginFlow(req, res, true, returnTo)
    })
  }

  if (path === "/auth/oidc/exchange" && req.method === "POST") {
    return json(res, 200, { token: "oidc-token", user: account })
  }

  if (path === "/auth/oidc/identities" && req.method === "GET") {
    return json(res, 200, { data: [] })
  }

  if (path === "/sessions" && req.method === "POST") {
    return json(res, 200, { token: "test-token", user: account })
  }

  if (path === "/sessions" && req.method === "GET") {
    return json(res, 200, { data: [], _links: { next: null, prev: null } })
  }

  if (path === "/me") {
    if (!req.headers.authorization) {
      return json(res, 401, { detail: "Missing session token" })
    }
    return json(res, 200, account)
  }

  if (path === "/meta") {
    return json(res, 200, {
      name: "TwextHub",
      tagline: "Extensions for TurboWarp",
    })
  }

  if (path === "/stats") {
    return json(res, 200, { published: 1, authors: 1, downloads: 5, pending: 1 })
  }

  if (path === "/extensions/trending") {
    return json(res, 200, {
      data: [summary],
      _links: { next: null, prev: null },
    })
  }

  if (path === "/extensions" || path === "/search") {
    return json(res, 200, {
      data: [summary],
      _links: { next: null, prev: null },
    })
  }

  if (path === "/notifications") {
    return json(res, 200, {
      data: [],
      unreadCount: 0,
      _links: { next: null, prev: null },
    })
  }

  if (path === "/auth/device/lookup") {
    return json(res, 200, {
      clientName: "Twext CLI",
      expiresAt: "2026-10-25T20:10:00.000Z",
      approved: false,
      denied: false,
    })
  }

  if (path === "/auth/device/approve") {
    return json(res, 200, { approved: true, clientName: "Twext CLI" })
  }

  if (path === "/auth/device/deny") {
    return json(res, 200, { denied: true })
  }

  if (path === "/auth/mfa") {
    return json(res, 200, {
      enabled: passkeys.length > 0,
      passkeys,
      backupCodesRemaining: passkeys.length > 0 ? 8 : 0,
    })
  }

  const passkeyMatch = /^\/auth\/mfa\/passkeys\/(\d+)$/.exec(path)
  if (passkeyMatch && req.method === "PATCH") {
    const target = passkeys.find(
      (passkey) => String(passkey.id) === passkeyMatch[1]
    )
    if (!target) {
      return json(res, 404, { title: "Not Found", status: 404 })
    }
    return readBody(req).then((body) => {
      const payload = body ? JSON.parse(body) : {}
      target.label = payload.label ?? target.label
      return json(res, 200, target)
    })
  }

  if (path === "/feed.atom") {
    res.writeHead(200, { "content-type": "application/atom+xml" })
    return res.end(
      '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>TwextHub</title></feed>'
    )
  }

  if (path === "/users" && req.method === "GET") {
    return json(res, 200, {
      data: [account, otherAccount],
      _links: { next: null, prev: null },
    })
  }

  if (path === "/orgs" && req.method === "GET") {
    return json(res, 200, { data: [], _links: { next: null, prev: null } })
  }

  if (path === "/terms" || path === "/privacy") {
    return json(res, 200, legal[path.slice(1)])
  }

  if (path === "/admin/terms" || path === "/admin/privacy") {
    if (req.method === "PATCH") {
      return readBody(req).then((body) => {
        const payload = body ? JSON.parse(body) : {}
        const kind = path.endsWith("terms") ? "terms" : "privacy"
        legal[kind] = {
          version: legal[kind].version + 1,
          body: payload.body ?? legal[kind].body,
          updatedAt: new Date().toISOString(),
        }
        // Saving a document from the admin journey must not lock the shared
        // test account out of publishing for every later spec.
        account.termsAcceptedVersion = legal.terms.version
        return json(res, 200, legal[kind])
      })
    }
  }

  if (path === "/admin/config" && req.method === "GET") {
    return json(res, 200, {
      editable: true,
      reason: null,
      configPath: "/srv/config.yaml",
      settings: [
        {
          key: "publicBaseUrl",
          label: "Public base URL",
          help: "Used to build download and source links.",
          type: "url",
          min: null,
          max: null,
          restartRequired: false,
          value: ORIGIN,
        },
        {
          key: "limits.maxBlobBytes",
          label: "Maximum release size",
          help: null,
          type: "bytes",
          min: 1024,
          max: 536870912,
          restartRequired: false,
          value: 32 * 1024 * 1024,
        },
        {
          key: "limits.maxAccountBlobBytes",
          label: "Maximum stored bytes per account",
          help: null,
          type: "bytes",
          min: 1024,
          max: 2147483648,
          restartRequired: false,
          value: 64 * 1024 * 1024,
        },
        {
          key: "compiler.minify",
          label: "Minify compiled extensions",
          help: null,
          type: "boolean",
          min: null,
          max: null,
          restartRequired: false,
          value: true,
        },
      ],
    })
  }

  const quotaMatch = /^\/admin\/users\/([^/]+)\/quota$/.exec(path)
  if (quotaMatch) {
    const namespace = quotaMatch[1]
    const current = quotas.get(namespace) ?? {
      blobBytes: 0,
      maxBlobBytes: null,
    }

    if (req.method === "PATCH") {
      return readBody(req).then((body) => {
        const payload = body ? JSON.parse(body) : {}
        const next = {
          blobBytes: current.blobBytes,
          maxBlobBytes: payload.maxBlobBytes ?? null,
        }
        quotas.set(namespace, next)
        return json(res, 200, { namespace, ...next })
      })
    }

    return json(res, 200, { namespace, ...current })
  }

  const userMatch = /^\/users\/([^/]+)$/.exec(path)
  if (userMatch) {
    const target = userMatch[1] === "kamixfox" ? account : otherAccount
    if (req.method === "PATCH") {
      return readBody(req).then((body) => {
        const payload = body ? JSON.parse(body) : {}
        return json(res, 200, {
          ...target,
          displayName: payload.displayName ?? target.displayName,
        })
      })
    }
    return json(res, 200, target)
  }

  if (/^\/users\/[^/]+\/webhooks$/.test(path)) {
    return json(res, 200, { data: [], _links: { next: null, prev: null } })
  }

  if (path === "/tokens" && req.method === "GET") {
    return json(res, 200, { data: [], _links: { next: null, prev: null } })
  }

  if (path === "/tokens" && req.method === "POST") {
    return readBody(req).then((body) => {
      const payload = body ? JSON.parse(body) : {}
      return json(res, 201, {
        id: randomUUID(),
        name: payload.name ?? "Token",
        scopes: payload.scopes ?? ["publish"],
        token: "twexthub_test_secret_value",
        createdAt: new Date().toISOString(),
        expiresAt: null,
        lastUsedAt: null,
      })
    })
  }

  const extensionMatch = /^\/@([^/]+)\/([^/]+)$/.exec(path)
  if (extensionMatch) {
    const [, namespace, id] = extensionMatch
    if (namespace === "kamixfox" && id === "unsandboxed") {
      return json(res, 200, {
        ...detail,
        id: "unsandboxed",
        name: "Unsandboxed",
        isUnsandboxed: true,
      })
    }
    if (namespace === "kamixfox" && id === "myextension") {
      return json(res, 200, detail)
    }
  }

  const extensionSub = /^\/@([^/]+)\/([^/]+)\/([^/]+)(.*)$/.exec(path)
  if (extensionSub) {
    const [, namespace, id, section, rest] = extensionSub
    if (namespace === "kamixfox") {
      if (section === "tags") {
        return json(res, 200, {})
      }
      if (section === "owners") {
        if (rest === "/pending") {
          return json(res, 200, { data: [] })
        }
        return json(res, 200, owners)
      }
      if (section === "versions") {
        if (req.method === "POST") {
          return readBody(req).then(() =>
            json(res, 201, {
              namespace,
              id,
              version: "0.4.0",
              status: "pending",
              ownerNamespace: namespace,
              name: detail.name,
              license: detail.license,
              description: detail.description,
              createdAt: new Date().toISOString(),
              downloads: 0,
              _links: {
                source: `${ORIGIN}/v2/@${namespace}/${id}/versions/0.4.0/source`,
              },
            })
          )
        }

        const match = /^\/([^/]+)\/(source|download)$/.exec(rest)
        if (match) {
          const [, version, kind] = match
          if (kind === "source" && archives[version]) {
            res.writeHead(200, { "content-type": "application/gzip" })
            return res.end(archives[version])
          }
          if (kind === "download" && builds[version]) {
            res.writeHead(200, { "content-type": "application/javascript" })
            return res.end(builds[version])
          }
        }
        const status = url.searchParams.get("status")
        if (status === "pending") {
          // The manage page lists pending releases separately; keep them out of
          // the published table so the first row is the latest release.
          return json(res, 200, {
            data: [],
            _links: { next: null, prev: null },
          })
        }
        if (status === "rejected") {
          return json(res, 200, {
            data: [],
            _links: { next: null, prev: null },
          })
        }
        return json(res, 200, {
          data: versions,
          _links: { next: null, prev: null },
        })
      }
      if (section === "transfers") {
        return json(res, 200, { data: [], _links: { next: null, prev: null } })
      }
      if (section === "webhooks") {
        return json(res, 200, { data: [], _links: { next: null, prev: null } })
      }
    }
  }

  if (path === "/versions") {
    return json(res, 200, {
      data: [pendingVersion],
      _links: { next: null, prev: null },
    })
  }

  if (path.startsWith("/badge/")) {
    res.writeHead(200, { "content-type": "image/svg+xml" })
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
    )
  }

  return json(res, 404, { title: "Not Found", status: 404 })
}

createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((error) => {
    console.error(error)
    json(res, 500, { title: "Mock API failure", detail: String(error) })
  })
}).listen(PORT, "127.0.0.1", () => {
  console.log(`mock registry on ${ORIGIN}`)
})
