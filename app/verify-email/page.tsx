import VerifyEmailPage from "@/components/verify-email-page"

type VerifyEmailRouteProps = {
  searchParams: Promise<{
    token?: string | string[]
    email?: string | string[]
  }>
}

const pickFirst = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || "" : value || "")

export default async function VerifyEmailRoute({ searchParams }: VerifyEmailRouteProps) {
  const params = await searchParams
  const token = pickFirst(params.token).trim()
  const email = pickFirst(params.email).trim().toLowerCase()

  return <VerifyEmailPage initialToken={token} initialEmail={email} />
}

