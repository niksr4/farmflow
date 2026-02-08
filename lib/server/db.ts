import "server-only"

import { neon } from "@neondatabase/serverless"

const baseUrl = process.env.DATABASE_URL
if (!baseUrl) {
  throw new Error("DATABASE_URL environment variable is not set")
}

export const sql = neon(baseUrl)
export const inventorySql = sql
export const accountsSql = sql
export const processingSql = sql
