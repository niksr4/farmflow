"use client"

import { useAuth } from "@/hooks/use-auth"
import { useRouter } from "next/navigation"
import { Leaf, Mail, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function TrialExpiredPage() {
  const { logout } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await logout()
    router.replace("/")
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-8 shadow-xl shadow-emerald-100/50 text-center">
        {/* Logo mark */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
          <Leaf className="h-7 w-7 text-white" />
        </div>

        <h1 className="font-display text-2xl font-bold text-neutral-900">Your free trial has ended</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          Thanks for giving FarmFlow a try. Your data is safe — reach out and we&#39;ll get you set up to continue.
        </p>

        <div className="mt-8 space-y-3">
          <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
            <a href="mailto:nikhil@thefarmflow.in?subject=FarmFlow subscription">
              <Mail className="mr-2 h-4 w-4" />
              Contact us to continue
            </a>
          </Button>
          <Button
            variant="ghost"
            className="w-full text-neutral-500 hover:text-neutral-700"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>

        <p className="mt-6 text-[11px] text-neutral-400">
          Your season records, accounts, and inventory are all preserved and ready when you subscribe.
        </p>
      </div>
    </div>
  )
}
