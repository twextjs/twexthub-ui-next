import type TwextHubKit from "@twextjs/twexthubkit"
import type { ExtensionDetail, ExtensionOwner } from "@twextjs/twexthubkit"

export interface ExtensionData {
  extension: ExtensionDetail
  tags: Record<string, string>
  owners: Array<ExtensionOwner & { avatarUrl?: string | null }>
  isOrgOwner: boolean
}

export async function loadExtensionData(
  kit: TwextHubKit,
  namespace: string,
  id: string,
  viewerNamespace: string | undefined,
  signal?: AbortSignal
): Promise<ExtensionData> {
  const extension = await kit.extensions.get(namespace, id, { signal })
  const [tags, owners] = await Promise.all([
    kit.extensions.tags.get(namespace, id, { signal }).catch(() => null),
    kit.extensions.owners.list(namespace, id, { signal }).catch(() => null),
  ])

  // Owner rows carry no image, so resolve each account's avatar for the
  // sidebar; a failed lookup still leaves a usable initials fallback.
  const ownerRows = owners?.data ?? []
  const ownersWithAvatars = await Promise.all(
    ownerRows.map(async (owner) => {
      try {
        const account = await kit.users.get(owner.namespace, { signal })
        return { ...owner, avatarUrl: account.avatarUrl }
      } catch {
        return owner
      }
    })
  )

  // An organization owner can manage the extension even when the extension
  // owner list only names the organization itself.
  const isListedOwner = ownerRows.some(
    (owner) => owner.namespace === viewerNamespace
  )
  const isOrgExtension = ownerRows.some(
    (owner) => owner.kind === "organization"
  )
  let isOrgOwner = false
  if (
    isOrgExtension &&
    viewerNamespace &&
    !isListedOwner &&
    viewerNamespace !== namespace
  ) {
    try {
      const orgOwners = await kit.orgs.listOwners(namespace, { signal })
      isOrgOwner = orgOwners.data.some(
        (owner) => owner.namespace === viewerNamespace
      )
    } catch {
      // Personal namespaces have no organization owner list.
    }
  }

  return {
    extension,
    tags: tags ?? {},
    owners: ownersWithAvatars,
    isOrgOwner,
  }
}
