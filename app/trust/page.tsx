import Link from "next/link"
import { ArrowLeft, Shield, KeyRound, FileText, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const PRIVACY_COMMITMENTS = [
  "We do not sell your operational data. Your estate records stay private and are never shared with third parties.",
  "Access is role-based — you control who sees what, with an audit trail showing every change.",
  "Your data belongs to you. You can export it or revoke access to any user at any time.",
]

const TERMS_SUMMARY = [
  "FarmFlow gives you operational tools and reports — not financial or legal advice. Your judgement runs your estate.",
  "Your team admins are responsible for data accuracy and who they invite inside your account.",
  "We communicate any service changes in advance and design updates to preserve your data continuity.",
]

export default function TrustPage() {
  return (
    <div
      className="min-h-[100svh] bg-[#07110f] text-stone-100 font-body"
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.1),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
            <Link href="/signup">Start free trial</Link>
          </Button>
        </div>

        <section className="rounded-3xl border border-white/10 bg-[#0a1714]/92 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.6)] sm:p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-200">FarmFlow</p>
          <h1 className="font-display mt-2 text-3xl font-semibold text-stone-50 sm:text-4xl">Trust, Privacy & Governance</h1>
          <p className="mt-3 max-w-3xl text-sm text-stone-300 sm:text-base">
            Clear commitments for data ownership, access control, and accountability.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border border-white/10 bg-[#0a1714]/92">
            <CardHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-200">
                <Shield className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-2xl text-stone-50">Privacy Commitments</CardTitle>
              <CardDescription className="text-stone-300">Your estate data stays private, isolated, and under your control.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PRIVACY_COMMITMENTS.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-stone-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-[#0a1714]/92">
            <CardHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-stone-200">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-2xl text-stone-50">Terms Summary</CardTitle>
              <CardDescription className="text-stone-300">Transparent usage with clear responsibilities for both sides.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {TERMS_SUMMARY.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-stone-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border border-white/10 bg-[#0a1714]/92">
            <CardHeader>
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-300/10 text-sky-200">
                <KeyRound className="h-5 w-5" />
              </div>
              <CardTitle className="font-display text-2xl text-stone-50">Legal Documents</CardTitle>
              <CardDescription className="text-stone-300">Detailed policy pages and agreements.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/privacy">Privacy Notice</Link>
              </Button>
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/legal/privacy">Privacy Policy</Link>
              </Button>
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/legal/terms">MSA / ToS</Link>
              </Button>
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/legal/dpa">DPA</Link>
              </Button>
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/legal/billing">Billing / Cancellation</Link>
              </Button>
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/legal/subprocessors">Subprocessors</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
