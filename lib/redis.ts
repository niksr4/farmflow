// Redis stub for backward compatibility
// All Redis functionality has been moved to Neon PostgreSQL

export const redis = null

export const KEYS = {
  INVENTORY: "inventory",
  TRANSACTIONS: "transactions",
  LABOR: "labor",
  CONSUMABLES: "consumables",
  LAST_UPDATE: "lastUpdate",
}

export async function getRedisAvailability(): Promise<boolean> {
  return false
}

export async function checkRedisConnection(): Promise<{
  available: boolean
  message: string
}> {
  return {
    available: false,
    message: "Redis is no longer used. All data is stored in Neon PostgreSQL.",
  }
}
