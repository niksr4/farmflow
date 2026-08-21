// Kept in sync with the subprocessor list in section 5 of app/legal/privacy/page.tsx --
// update both together. This is the page that list is supposed to be the "full list" for,
// so drifting out of sync with it defeats the point of having a separate page at all.
const SUBPROCESSORS = [
  {
    name: "Vercel",
    purpose: "Application hosting and edge delivery",
    location: "Global (region selected by deployment)",
  },
  {
    name: "Neon",
    purpose: "Postgres database hosting",
    location: "AWS ap-southeast-1 (Singapore)",
  },
  {
    name: "Resend",
    purpose: "Transactional email delivery (verification codes, weekly digests, account alerts)",
    location: "United States",
  },
  {
    name: "Anthropic",
    purpose: "AI assistant and analysis features (relevant context only; not used for training without consent)",
    location: "United States",
  },
  {
    name: "PostHog",
    purpose: "Product analytics (pages visited, features used, click events)",
    location: "EU (routed via our own domain, /ingest/)",
  },
  {
    name: "Google Analytics (GA4)",
    purpose: "Website traffic and acquisition analytics",
    location: "United States",
  },
  {
    name: "Sentry",
    purpose: "Error and performance monitoring",
    location: "EU (de.sentry.io)",
  },
]

export default function SubprocessorsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Subprocessor List</h1>
        <p className="text-sm text-muted-foreground">Updated: 2026-08-21</p>
      </div>

      <div className="space-y-3">
        {SUBPROCESSORS.map((sub) => (
          <div key={sub.name} className="rounded-md border bg-white/80 p-4 text-sm text-muted-foreground">
            <p className="text-base font-medium text-foreground">{sub.name}</p>
            <p>Purpose: {sub.purpose}</p>
            <p>Location: {sub.location}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
