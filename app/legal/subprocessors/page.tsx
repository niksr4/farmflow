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
    name: "Email provider",
    purpose: "System emails (not enabled yet)",
    location: "TBD",
  },
  {
    name: "Analytics provider",
    purpose: "Product analytics (not enabled yet)",
    location: "TBD",
  },
]

export default function SubprocessorsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Subprocessor List</h1>
        <p className="text-sm text-muted-foreground">Updated: 2026-02-09</p>
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
