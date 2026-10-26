import { redirect } from "react-router"

import { readSession } from "@/lib/session.server"

export { LoginPage as default } from "@/pages/login-page"

export async function loader({ request }: { request: Request }) {
  const session = await readSession(request)
  if (!session.get("token")) {
    return null
  }

  const next = new URL(request.url).searchParams.get("next")
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"
  throw redirect(target)
}
