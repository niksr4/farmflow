import TenantSettingsPage from "@/components/tenant-settings-page"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role === "user" || sessionUser.role === "viewer") {
    redirect("/dashboard")
  }

  return <TenantSettingsPage />
}
