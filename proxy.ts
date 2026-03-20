import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { formatBodyLimit, parseContentLengthHeader, resolveApiBodyLimit } from "@/lib/request-limits"
import { assertCoreRuntimeConfig } from "@/lib/runtime-config"

export async function proxy(request: NextRequest) {
  assertCoreRuntimeConfig()

  const { pathname } = request.nextUrl
  const host = String(request.headers.get("host") || request.nextUrl.hostname || "").toLowerCase()
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").toLowerCase()
  const isLocalHost = host.includes("localhost") || host.startsWith("127.0.0.1")

  // We trust x-forwarded-proto only when the app is deployed behind a trusted TLS-terminating proxy/load balancer.
  if (process.env.NODE_ENV === "production" && forwardedProto && forwardedProto !== "https" && !isLocalHost) {
    const secureUrl = request.nextUrl.clone()
    secureUrl.protocol = "https"
    return NextResponse.redirect(secureUrl, 308)
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && pathname.startsWith("/api/")) {
    const contentLength = parseContentLengthHeader(request.headers.get("content-length"))
    const limit = resolveApiBodyLimit(pathname, request.headers.get("content-type"))
    if (limit && contentLength !== null && contentLength > limit) {
      return NextResponse.json(
        { success: false, error: `Request body too large. Limit is ${formatBodyLimit(limit)}.` },
        { status: 413 },
      )
    }
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/register-interest") ||
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/ops/error-ingest")
  ) {
    return NextResponse.next()
  }

  if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  const passwordResetRequired = Boolean((token as any).passwordResetRequired)
  if (passwordResetRequired) {
    if (pathname === "/settings/reset-password" || pathname.startsWith("/api/account/password")) {
      return NextResponse.next()
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Password reset required" }, { status: 403 })
    }

    const url = request.nextUrl.clone()
    url.pathname = "/settings/reset-password"
    return NextResponse.redirect(url)
  }

  if (
    shouldForceGuidedSetup({
      role: (token as any).role,
      requiresGuidedSetup: (token as any).requiresGuidedSetup,
      setupCompleted: (token as any).setupCompleted,
    })
  ) {
    if (pathname === "/welcome" || pathname.startsWith("/api/onboarding/setup")) {
      return NextResponse.next()
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Guided setup required" }, { status: 403 })
    }

    const url = request.nextUrl.clone()
    url.pathname = "/welcome"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/admin/:path*", "/api/:path*"],
}
