import ImportPage from "@/components/import-page"
import { requireSessionUser } from "@/lib/server/auth"
import { redirect } from "next/navigation"

export default async function ImportDataPage() {
  const sessionUser = await requireSessionUser()
  if (sessionUser.role === "user") {
    redirect("/dashboard")
  }

  return <ImportPage />
}
