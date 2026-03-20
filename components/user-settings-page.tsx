"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { ArrowLeft } from "lucide-react"
import { AccountLanguageSection } from "@/components/tenant-settings/overview-sections"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocale } from "@/components/locale-provider"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n"

export default function UserSettingsPage() {
  const { user } = useAuth()
  const { update: updateSession } = useSession()
  const { toast } = useToast()
  const { setLocale } = useLocale()
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(normalizeAppLocale(user?.preferredLocale))
  const [isSavingLanguage, setIsSavingLanguage] = useState(false)

  useEffect(() => {
    setPreferredLocale(normalizeAppLocale(user?.preferredLocale))
  }, [user?.preferredLocale])

  const handleSaveLanguage = async () => {
    setIsSavingLanguage(true)
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLocale }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update language")
      }
      setLocale(preferredLocale)
      await updateSession({ preferredLocale })
      toast({ title: "Language updated", description: "Your account language preference has been saved." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update language", variant: "destructive" })
    } finally {
      setIsSavingLanguage(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-start">
        <Button asChild variant="outline" size="sm" className="bg-white/80">
          <Link href="/dashboard" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>

      <Card className="border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-amber-50">
        <CardHeader>
          <CardTitle className="flex items-baseline gap-3">
            Account Settings
            <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">FarmFlow</span>
          </CardTitle>
          <CardDescription>
            Manage your personal account preferences without changing tenant-wide operational settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">User</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{user?.username || "Unknown"}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Role</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{user?.role || "user"}</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white/90 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-700">Workspace</p>
            <p className="mt-1 break-all text-sm font-medium text-foreground">{user?.tenantId || "Unavailable"}</p>
          </div>
        </CardContent>
      </Card>

      <AccountLanguageSection
        preferredLocale={preferredLocale}
        isSaving={isSavingLanguage}
        onPreferredLocaleChange={setPreferredLocale}
        onSave={handleSaveLanguage}
      />
    </div>
  )
}
