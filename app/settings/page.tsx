import TenantSettingsPage from "@/components/tenant-settings-page"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser()
  if (shouldForceGuidedSetup(sessionUser)) {
    redirect("/welcome")
  }

  // Writers (role=user) have no settings surface — their locale and password
  // are managed by the estate admin. Keep the pared app pared.
  if (sessionUser.role === "user") {
    redirect("/dashboard")
  }

  return <TenantSettingsPage />
}
