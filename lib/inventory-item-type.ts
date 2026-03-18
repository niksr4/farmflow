export const normalizeInventoryItemType = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ")
