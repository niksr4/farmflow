import TenantSettingsPage from "@/components/tenant-settings-page"
import UserSettingsPage from "@/components/user-settings-page"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser()
  if (shouldForceGuidedSetup(sessionUser)) {
    redirect("/welcome")
  }

  if (sessionUser.role === "user") {
    return <UserSettingsPage />
  }

  return <TenantSettingsPage />
}
