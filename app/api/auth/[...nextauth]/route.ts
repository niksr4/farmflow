import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// In Next.js 15+, dynamic route params are async Promises.
// NextAuth v4 expects to receive the params synchronously via context.params.nextauth
// (App Router convention). Without passing context, it falls back to the Pages Router
// pattern (req.query.nextauth) which doesn't exist in App Router and crashes.
type Context = { params: Promise<{ nextauth: string[] }> }

type HandlerFn = (req: NextRequest, ctx: { params: { nextauth: string[] } }) => Promise<Response>
const handler = NextAuth(authOptions) as HandlerFn

export async function GET(req: NextRequest, context: Context) {
  const params = await context.params
  return handler(req, { params })
}

export async function POST(req: NextRequest, context: Context) {
  const params = await context.params
  return handler(req, { params })
}
