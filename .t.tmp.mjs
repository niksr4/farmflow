import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"
const url = readFileSync(".env.local","utf8").match(/^DATABASE_URL_DEV=["']?([^"'\n]+)/m)[1]
const sql = neon(url)
await sql`ALTER VIEW public.rainfall_daily SET (security_invoker = false)`
const r = await sql`
  SELECT COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                   WHERE option_name='security_invoker'),'NOT SET') AS si
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='v' AND n.nspname='public' AND c.relname='rainfall_daily'`
if (r[0].si === 'true') { console.error("TAMPER DID NOT LAND"); process.exit(9) }
console.log(`tamper landed on dev: rainfall_daily security_invoker=${r[0].si}`)
