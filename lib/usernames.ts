export const normalizeUsername = (value: unknown) => String(value || "").trim()

export const normalizeUsernameLookup = (value: unknown) => normalizeUsername(value).toLowerCase()

export const isSameUsername = (left: unknown, right: unknown) =>
  normalizeUsernameLookup(left) === normalizeUsernameLookup(right)

export const isSystemUsername = (value: unknown) => {
  const normalized = normalizeUsernameLookup(value)
  return normalized === "system" || normalized.startsWith("system_") || normalized.startsWith("system-")
}

export const isReservedPlatformUsername = (value: unknown) => normalizeUsernameLookup(value) === "owner"
