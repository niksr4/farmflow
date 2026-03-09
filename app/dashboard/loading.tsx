import Image from "next/image"

export default function DashboardLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 via-white to-white px-6">
      <div className="flex w-full max-w-xs flex-col items-center rounded-3xl border border-emerald-100 bg-white/90 p-6 text-center shadow-sm backdrop-blur">
        <Image src="/brand-mark.svg" alt="FarmFlow" width={64} height={64} className="h-16 w-16" priority />
        <p className="mt-3 text-sm font-semibold text-emerald-900">Opening FarmFlow</p>
        <p className="mt-1 text-xs text-emerald-700/80">Loading your workspace and latest records...</p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-emerald-500" />
        </div>
      </div>
    </main>
  )
}
