import ResetPasswordPage from "@/components/reset-password-page"

type ResetPasswordRouteProps = {
  searchParams: Promise<{
    token?: string | string[]
  }>
}

const pickFirst = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] || "" : value || "")

export default async function ResetPasswordRoute({ searchParams }: ResetPasswordRouteProps) {
  const params = await searchParams
  const token = pickFirst(params.token).trim()

  return <ResetPasswordPage initialToken={token} />
}
