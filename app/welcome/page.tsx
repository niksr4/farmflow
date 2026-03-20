import { redirect } from "next/navigation"
import WelcomeOnboardingPage from "@/components/welcome-onboarding-page"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { requireSessionUser } from "@/lib/server/auth"

export default async function WelcomePage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role === "owner") {
    redirect("/admin/tenants")
  }
  if (sessionUser.role === "user") {
    redirect("/dashboard")
  }
  if (!shouldForceGuidedSetup(sessionUser)) {
    redirect("/dashboard")
  }

  return <WelcomeOnboardingPage />
}
