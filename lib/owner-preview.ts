export type OwnerPreviewRole = "admin" | "user"

export type OwnerPreviewContext = {
  previewTenantId: string
  previewRole: OwnerPreviewRole
  previewTenantName?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const normalizeValue = (value: string | null | undefined) => String(value || "").trim()

export function normalizeOwnerPreviewContext(input: {
  previewTenantId?: string | null
  previewRole?: string | null
  previewTenantName?: string | null
}): OwnerPreviewContext | null {
  const previewTenantId = normalizeValue(input.previewTenantId)
  const previewRole = normalizeValue(input.previewRole).toLowerCase()
  const previewTenantName = normalizeValue(input.previewTenantName)

  if (!UUID_PATTERN.test(previewTenantId)) {
    return null
  }

  if (previewRole !== "admin" && previewRole !== "user") {
    return null
  }

  return {
    previewTenantId,
    previewRole,
    ...(previewTenantName ? { previewTenantName } : {}),
  }
}

export function appendOwnerPreviewContext(href: string, previewContext?: OwnerPreviewContext | null) {
  const normalizedHref = String(href || "").trim()
  if (!normalizedHref || !previewContext || !normalizedHref.startsWith("/")) {
    return normalizedHref
  }

  const [pathAndQuery, hashFragment] = normalizedHref.split("#", 2)
  const [pathname, queryString = ""] = pathAndQuery.split("?", 2)
  const params = new URLSearchParams(queryString)

  if (!params.has("previewTenantId")) {
    params.set("previewTenantId", previewContext.previewTenantId)
  }
  if (!params.has("previewRole")) {
    params.set("previewRole", previewContext.previewRole)
  }
  if (previewContext.previewTenantName && !params.has("previewTenantName")) {
    params.set("previewTenantName", previewContext.previewTenantName)
  }

  const nextQuery = params.toString()
  const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname
  return hashFragment ? `${nextHref}#${hashFragment}` : nextHref
}
