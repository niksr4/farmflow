"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { AccountLanguageSection } from "@/components/tenant-settings/overview-sections"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLocale } from "@/components/locale-provider"
import { useAuth } from "@/hooks/use-auth"
import { useToast } from "@/hooks/use-toast"
import { normalizeAppLocale, type AppLocale } from "@/lib/i18n"
import WorkspaceNavigatorBackButton from "@/components/workspace-navigator-back-button"

export default function UserSettingsPage() {
  const { user } = useAuth()
  const { update: updateSession } = useSession()
  const { toast } = useToast()
  const { setLocale } = useLocale()
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(normalizeAppLocale(user?.preferredLocale))
  const [isSavingLanguage, setIsSavingLanguage] = useState(false)

  const [whatsappPhone, setWhatsappPhone] = useState("")
  const [isSavingPhone, setIsSavingPhone] = useState(false)

  useEffect(() => {
    setPreferredLocale(normalizeAppLocale(user?.preferredLocale))
  }, [user?.preferredLocale])

  useEffect(() => {
    fetch("/api/account/whatsapp-phone")
      .then((r) => r.json())
      .then((d) => { if (d.success && d.phone) setWhatsappPhone(d.phone) })
      .catch(() => {})
  }, [])

  const handleSavePhone = async () => {
    const normalized = whatsappPhone.trim().replace(/\s+/g, "")
    if (normalized && !/^\+\d{7,15}$/.test(normalized)) {
      toast({ title: "Invalid number", description: "Use international format, e.g. +919876543210", variant: "destructive" })
      return
    }
    setIsSavingPhone(true)
    try {
      const response = await fetch("/api/account/whatsapp-phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized || null }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to save")
      toast({ title: "WhatsApp number saved", description: "You can now log farm data via WhatsApp." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save phone", variant: "destructive" })
    } finally {
      setIsSavingPhone(false)
    }
  }

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
        <WorkspaceNavigatorBackButton />
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

      <Card className="border-emerald-200/80">
        <CardHeader>
          <CardTitle className="text-base">WhatsApp Bot</CardTitle>
          <CardDescription>
            Register your WhatsApp number to log farm data by message — cherry intake, labor, expenses, inventory — without opening the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp-phone">WhatsApp Number</Label>
            <Input
              id="whatsapp-phone"
              type="tel"
              placeholder="+919876543210"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              className="max-w-xs font-mono"
            />
            <p className="text-xs text-muted-foreground">
              International format required. Your number must be active on WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={handleSavePhone}
              disabled={isSavingPhone}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSavingPhone ? "Saving..." : "Save Number"}
            </Button>
            {whatsappPhone && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setWhatsappPhone(""); handleSavePhone() }}
                className="text-muted-foreground"
              >
                Remove
              </Button>
            )}
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-800 space-y-1">
            <p className="font-medium">Example messages you can send:</p>
            <p>• "Cherry intake 280kg block A today"</p>
            <p>• "50kg urea for fertilizing, 3 laborers, ₹500 each"</p>
            <p>• "How much urea do we have?"</p>
            <p>• "What was logged today?"</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
