import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowLeft, Shield, KeyRound, FileText, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const PRIVACY_COMMITMENTS = [
  "We do not sell operational data. Every estate runs in its own tenant-isolated workspace.",
  "Access is role-based with audit trails showing who changed what and when.",
  "Exports and backups remain under tenant control, and user access can be revoked at any time.",
]

const TERMS_SUMMARY = [
  "FarmFlow provides operational tooling and reporting, not financial or legal advice.",
  "Tenant admins are responsible for data quality and user access inside their estate workspace.",
  "Service updates are communicated in advance and designed to preserve data continuity.",
]

export default function TrustPage() {
  return (
    <div
      className={`${body.className} min-h-[100svh] bg-gradient-to-br from-emerald-50 via-white to-slate-100 text-slate-900`}
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Request Access</Link>
          </Button>
        </div>

        <section className="rounded-3xl border border-emerald-200/60 bg-white/85 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)] sm:p-8">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-700">FarmFlow</p>
          <h1 className={`${display.className} mt-2 text-3xl font-semibold sm:text-4xl`}>Trust, Privacy & Governance</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            Clear commitments for data ownership, access control, and accountability.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Shield className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Privacy Commitments</CardTitle>
              <CardDescription>Your estate data stays private, isolated, and under your control.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PRIVACY_COMMITMENTS.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <FileText className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Terms Summary</CardTitle>
              <CardDescription>Transparent usage with clear responsibilities for both sides.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {TERMS_SUMMARY.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <KeyRound className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Legal Documents</CardTitle>
              <CardDescription>Detailed policy pages and agreements.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/privacy">Privacy Notice</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/legal/privacy">Privacy Policy</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/legal/terms">MSA / ToS</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/legal/dpa">DPA</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/legal/subprocessors">Subprocessors</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
