import "server-only"

import { neon } from "@neondatabase/serverless"

const isProd = process.env.NODE_ENV === "production"
const baseUrl = isProd ? process.env.DATABASE_URL : process.env.DATABASE_URL_DEV

export const sql = baseUrl ? neon(baseUrl) : null
export const inventorySql = sql
export const accountsSql = sql
export const processingSql = sql
export const isDbConfigured = Boolean(baseUrl)
