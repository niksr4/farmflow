import VerifyEmailPage from "@/components/verify-email-page"

type VerifyEmailRouteProps = {
  searchParams: Promise<{
    token?: string | string[]
    email?: string | string[]
    /** "1" when the signup that sent you here kept an earlier password. See the note below. */
    existing?: string | string[]
  }>
}

const pickFirst = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || "" : value || "")

export default async function VerifyEmailRoute({ searchParams }: VerifyEmailRouteProps) {
  const params = await searchParams
  const token = pickFirst(params.token).trim()
  const email = pickFirst(params.email).trim().toLowerCase()
  /**
   * The signup that sent the visitor here found an existing unprovisioned request for this
   * address and KEPT its original password, because the credential on a pending signup is not a
   * later caller's to replace. Told plainly on this screen: otherwise they verify, try the
   * password they just typed, and are locked out of their own estate with no error anywhere.
   */
  const credentialRetained = pickFirst(params.existing).trim() === "1"

  return <VerifyEmailPage initialToken={token} initialEmail={email} credentialRetained={credentialRetained} />
}

