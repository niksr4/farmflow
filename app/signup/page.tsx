import type { Metadata } from "next"

import SignupRouteClient from "./page-client"
import { seoFor } from "@/lib/site-url"

/**
 * ⚠ A CLIENT COMPONENT CANNOT EXPORT `metadata`, AND NOTHING TYPE-CHECKS THAT.
 *
 * This page's body is "use client", so Next ignores a metadata export in it entirely -- the page
 * would ship with the root layout's generic title and `tsc` would say nothing, because it is a
 * framework constraint rather than a type error. I made exactly that mistake here and only caught
 * it by listing which pages carry "use client".
 *
 * So the body lives in ./page-client.tsx and this server wrapper owns the metadata.
 */
export const metadata: Metadata = seoFor("/signup")

export default function Page() {
  return <SignupRouteClient />
}
