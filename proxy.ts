import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/register-interest")) {
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
