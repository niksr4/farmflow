import TenantSettingsPage from "@/components/tenant-settings-page"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function SettingsPage() {
  const sessionUser = await requireSessionUser()
  if (shouldForceGuidedSetup(sessionUser)) {
    redirect("/welcome")
  }

  // Writers used to be redirected away entirely, on the reasoning that their locale and password
  // were "managed by the estate admin". Both endpoints have always been self-service --
  // /api/account/preferences and /api/account/password gate on requireSessionUser and nothing
  // more -- so the only thing the redirect achieved was that a Kannada-speaking writer could not
  // set the app to Kannada, and nobody could rotate their own password without asking their boss.
  //
  // The page itself is already role-aware: every estate section is behind isAdminOrOwner, and
  // Language and Security are marked "visible to everyone". A writer now sees those two and
  // nothing else -- no People, no Locations, no Import, no modules, no billing.

  return <TenantSettingsPage />
}
