import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowLeft, CheckCircle2, Target, Eye, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const PRINCIPLES = [
  "Traceability over guesswork: every lot, bag, and transaction should be explainable.",
  "Operational clarity over dashboard noise: signals must help teams act quickly.",
  "Governance by design: roles, audit logs, and controls are built in from day one.",
  "Practical adoption first: workflows should fit estates already operating at pace.",
]

export default function StandardsPage() {
  return (
    <div
      className={`${body.className} min-h-[100svh] bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-slate-900`}
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
          <h1 className={`${display.className} mt-2 text-3xl font-semibold sm:text-4xl`}>What We Stand For</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            The principles guiding how we build FarmFlow for coffee estates, operators, and buyers.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Target className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Mission</CardTitle>
              <CardDescription>
                Help coffee estates improve margins, protect quality, and build durable buyer trust through
                Arabica/Robusta and Cherry/Parchment traceability.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              FarmFlow replaces fragmented tools with one operating system that reconciles every bag, lot, and cost.
              Teams move faster, reduce leakage, and document the practices that reward quality.
            </CardContent>
          </Card>

          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                <Eye className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Vision</CardTitle>
              <CardDescription>
                Transparent coffee supply chains where quality and operational discipline are rewarded.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              We are building a future where every estate runs with real-time tracking, verified quality, and
              instant visibility for managers, buyers, and auditors.
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border border-white/70 bg-white/85">
            <CardHeader>
              <div className="mb-1 h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <Layers className="h-5 w-5" />
              </div>
              <CardTitle className={`${display.className} text-2xl`}>Operating Principles</CardTitle>
              <CardDescription>
                How these standards translate into day-to-day product and workflow decisions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PRINCIPLES.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
