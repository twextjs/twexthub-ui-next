import { loaderApi } from "@/lib/loader-api.server"
import { manageKeys } from "@/lib/preload"

export { ExtensionManagePage as default } from "@/pages/extension-manage-page"

export async function loader({
  request,
  params,
}: {
  request: Request
  params: Record<string, string | undefined>
}) {
  const handle = params.namespace ?? ""
  const namespace = handle.startsWith("@") ? handle.slice(1) : ""
  const id = params.id ?? ""
  const context = await loaderApi(request)
  if (!namespace || !id || !context) {
    return { preload: {} }
  }

  const { kit, user } = context
  const isAdmin = user.role === "admin"
  const preload: Record<string, unknown> = {}

  async function put(key: string, load: () => Promise<unknown>) {
    try {
      preload[key] = await load()
    } catch {
      // The tab will fetch and render its own error state.
    }
  }

  try {
    const extension = await kit.extensions.get(namespace, id)
    let allowed = isAdmin || extension.namespace === user.namespace

    if (!allowed) {
      await put("owners-for-access", () =>
        kit.extensions.owners.list(namespace, id)
      )
      const owners = preload["owners-for-access"] as
        { data: Array<{ namespace: string }> } | undefined
      allowed = Boolean(
        owners?.data.some((owner) => owner.namespace === user.namespace)
      )
      delete preload["owners-for-access"]

      if (!allowed && extension.namespace !== user.namespace) {
        await put("org-owners-for-access", () =>
          kit.orgs.listOwners(extension.namespace)
        )
        const orgOwners = preload["org-owners-for-access"] as
          { data: Array<{ namespace: string }> } | undefined
        allowed = Boolean(
          orgOwners?.data.some((owner) => owner.namespace === user.namespace)
        )
        delete preload["org-owners-for-access"]
      }
    }

    preload[manageKeys.access(namespace, id, user.namespace, isAdmin)] = {
      extension,
      allowed,
    }

    if (allowed) {
      await Promise.all([
        put(manageKeys.hidden(namespace, id), async () => {
          const [pending, rejected] = await Promise.all([
            kit.extensions.versions.list(namespace, id, { status: "pending" }),
            kit.extensions.versions.list(namespace, id, { status: "rejected" }),
          ])
          return [...pending.data, ...rejected.data]
        }),
        put(manageKeys.tags(namespace, id), () =>
          kit.extensions.tags.get(namespace, id)
        ),
        put(manageKeys.owners(namespace, id), async () => {
          const [owners, invites] = await Promise.all([
            kit.extensions.owners.list(namespace, id),
            kit.extensions.owners.listInvites(namespace, id),
          ])
          return { owners: owners.data, invites: invites.data }
        }),
        put(manageKeys.transfers(namespace, id), () =>
          kit.extensions.transfers.list(namespace, id)
        ),
        put(manageKeys.webhooks(namespace, id), () =>
          kit.extensions.webhooks.list(namespace, id)
        ),
      ])
    }
  } catch {
    return { preload: {} }
  }

  return { preload }
}
