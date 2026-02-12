import AdminPage from "@/components/admin-page"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function TenantsPage() {
  const sessionUser = await requireSessionUser()
  if (!["owner", "admin"].includes(sessionUser.role)) {
    redirect("/dashboard")
  }

  return <AdminPage />
}
