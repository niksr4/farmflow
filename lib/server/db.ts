import "server-only"

import { neon } from "@neondatabase/serverless"

const isProd = process.env.NODE_ENV === "production"
const baseUrl = isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV

const createUnavailableClient = (): ReturnType<typeof neon> => {
  const throwUnavailable = () => {
    throw new Error("Database not configured")
  }
  const unavailable = ((..._args: any[]) => {
    throwUnavailable()
  }) as unknown as ReturnType<typeof neon>
  unavailable.query = ((() => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.query
  unavailable.transaction = ((async () => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.transaction
  unavailable.unsafe = (((_rawSql: string) => {
    throwUnavailable()
  }) as unknown) as typeof unavailable.unsafe
  return unavailable
}

export const sql = baseUrl ? neon(baseUrl) : createUnavailableClient()
export const inventorySql = sql
export const accountsSql = sql
export const processingSql = sql
export const isDbConfigured = Boolean(baseUrl)
