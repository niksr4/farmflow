import VerifyEmailChangePage from "@/components/verify-email-change-page"

type VerifyEmailChangeRouteProps = {
  searchParams: Promise<{
    token?: string | string[]
  }>
}

const pickFirst = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || "" : value || "")

// Public by construction: proxy.ts only matches /dashboard, /settings, /admin and /api, so this
// path needs no allowlist entry. That matters — the link is opened from the NEW mailbox, often
// on a device with no session.
export default async function VerifyEmailChangeRoute({ searchParams }: VerifyEmailChangeRouteProps) {
  const params = await searchParams
  const token = pickFirst(params.token).trim()

  return <VerifyEmailChangePage initialToken={token} />
}
