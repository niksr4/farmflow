import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = String(request.headers.get("host") || request.nextUrl.hostname || "").toLowerCase()
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").toLowerCase()
  const isLocalHost = host.includes("localhost") || host.startsWith("127.0.0.1")

  if (process.env.NODE_ENV === "production" && forwardedProto && forwardedProto !== "https" && !isLocalHost) {
    const secureUrl = request.nextUrl.clone()
    secureUrl.protocol = "https"
    return NextResponse.redirect(secureUrl, 308)
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

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/admin/:path*", "/api/:path*"],
}
