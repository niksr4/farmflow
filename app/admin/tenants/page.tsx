import AdminPage from "@/components/admin-page"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function TenantsPage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role !== "owner") {
    redirect("/settings")
  }

  return <AdminPage />
}
