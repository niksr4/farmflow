export const DAY_MS = 24 * 60 * 60 * 1000

export const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

export const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export const safeDivide = (num: number, den: number) => (den > 0 ? num / den : 0)

export const clampSeverity = (value: string) => {
  const normalized = String(value || "").toLowerCase()
  if (normalized === "critical") return "critical" as const
  if (normalized === "high") return "high" as const
  if (normalized === "medium") return "medium" as const
  return "low" as const
}

export const normalizeMessage = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()

export const buildErrorFingerprint = (input: {
  source: string
  code?: string | null
  endpoint?: string | null
  message?: string | null
}) => {
  const source = String(input.source || "app").toLowerCase()
  const code = String(input.code || "unknown").toLowerCase()
  const endpoint = String(input.endpoint || "none").toLowerCase()
  const message = normalizeMessage(input.message || "")
  const shortMessage = message.split(" ").slice(0, 10).join(" ")
  return `${source}|${code}|${endpoint}|${shortMessage}`
}

export const parseBooleanLike = (value: unknown) => {
  const normalized = String(value || "").toLowerCase().trim()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}
