const KB = 1024
const MB = 1024 * KB

type RouteBodyLimit = {
  pattern: RegExp
  bytes: number
}

const EXPLICIT_API_BODY_LIMITS: RouteBodyLimit[] = [
  { pattern: /^\/api\/auth\/signup$/, bytes: 32 * KB },
  { pattern: /^\/api\/auth\/resend-verification$/, bytes: 16 * KB },
  { pattern: /^\/api\/auth\/verify-email$/, bytes: 16 * KB },
  { pattern: /^\/api\/auth\/forgot-password$/, bytes: 16 * KB },
  { pattern: /^\/api\/auth\/reset-password$/, bytes: 16 * KB },
  { pattern: /^\/api\/account\/password$/, bytes: 16 * KB },
  { pattern: /^\/api\/register-interest$/, bytes: 64 * KB },
  { pattern: /^\/api\/ops\/error-ingest$/, bytes: 256 * KB },
  { pattern: /^\/api\/documents$/, bytes: 11 * MB },
  { pattern: /^\/api\/plant-health$/, bytes: 9 * MB },
  { pattern: /^\/api\/import-bulk$/, bytes: 2 * MB },
]

const DEFAULT_JSON_BODY_LIMIT_BYTES = 512 * KB
const DEFAULT_MULTIPART_BODY_LIMIT_BYTES = 12 * MB

export const formatBodyLimit = (bytes: number) => {
  if (bytes >= MB) {
    return `${Math.round((bytes / MB) * 10) / 10} MB`
  }
  if (bytes >= KB) {
    return `${Math.round(bytes / KB)} KB`
  }
  return `${bytes} bytes`
}

export const parseContentLengthHeader = (value: string | null | undefined) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.floor(parsed)
}

export function resolveApiBodyLimit(pathname: string, contentType: string | null | undefined) {
  for (const entry of EXPLICIT_API_BODY_LIMITS) {
    if (entry.pattern.test(pathname)) {
      return entry.bytes
    }
  }

  const normalizedContentType = String(contentType || "").toLowerCase()
  if (normalizedContentType.includes("multipart/form-data")) {
    return DEFAULT_MULTIPART_BODY_LIMIT_BYTES
  }

  if (pathname.startsWith("/api/")) {
    return DEFAULT_JSON_BODY_LIMIT_BYTES
  }

  return null
}

