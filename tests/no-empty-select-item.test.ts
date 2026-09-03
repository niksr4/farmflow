import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * `<SelectItem value="">` takes the whole tab down.
 *
 * Radix rejects an empty-string item value during render — the Select's value is set to "" to mean
 * "nothing chosen", so an item claiming that value is ambiguous and it throws rather than guess.
 * The throw happens in render, so the error boundary swallows the entire screen, and it happens
 * whether or not the tenant has a single row of data.
 *
 * THIS HAS NOW TAKEN A TAB OFFLINE TWICE.
 *
 * Picking and the Ledger were both disabled on 2026-07-25 for "crashing for some tenants". Picking
 * was repaired with an ALL_WORKERS sentinel and came back. The Ledger kept its empty-string item
 * and stayed dark for six weeks — during which `worker_ledger`'s emptiness was read as "nobody uses
 * advances and deductions" rather than "nobody can open the screen".
 *
 * On 2026-09-03 I re-enabled it after finding a date-serialisation fix already in the route and
 * verifying the data path end to end. It crashed again on the first click. That fix was real and
 * was a DIFFERENT bug; stopping at the first plausible cause is what cost the second attempt.
 *
 * A grep would have found it in a second. That is the whole argument for this file: the failure is
 * mechanical, invisible to typecheck, invisible to any test that does not render, and identical
 * every time. Counting the sites is worth more than testing the behaviour.
 */
const ROOTS = ["components", "app"]

const walk = (dir: string): string[] => {
  const out: string[] = []
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = resolve(d, entry)
      if (statSync(p).isDirectory()) visit(p)
      else if (/\.tsx$/.test(entry)) out.push(p)
    }
  }
  visit(resolve(__dirname, "..", dir))
  return out
}

describe("no Select offers an empty-string value", () => {
  it("nowhere in components/ or app/", () => {
    const offenders: string[] = []
    for (const dir of ROOTS) {
      for (const file of walk(dir)) {
        // Comments stripped first. The first run of this test failed on three files whose only
        // offence was explaining the bug in prose -- including this fix's own notes. A guard that
        // cannot tell code from the comment describing it will be deleted by the next person who
        // trips over it.
        const source = readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "")
        // Both quote styles, and the JSX-expression form that reads as innocent.
        if (/<SelectItem\s[^>]*value=(""|''|\{""\}|\{''\})/.test(source)) {
          offenders.push(file.slice(file.indexOf(dir)))
        }
      }
    }
    expect(
      offenders,
      'Radix throws on <SelectItem value="">, taking the whole tab down. Use a sentinel like ALL_WORKERS = "all".',
    ).toEqual([])
  })

  it("the two tabs it has already broken both use a sentinel", () => {
    for (const file of ["components/picking-log-tab.tsx", "components/worker-ledger-tab.tsx"]) {
      const source = readFileSync(resolve(__dirname, "..", file), "utf8")
      expect(source, `${file} should define a non-empty sentinel`).toContain('const ALL_WORKERS = "all"')
      expect(source).toContain("<SelectItem value={ALL_WORKERS}>")
    }
  })

  it("the sentinel is not left to falsiness once it stops being an empty string", () => {
    // "all" is truthy where "" was not, so `if (filterWorker)` silently starts meaning "always".
    // In the ledger that would have sent workerId=all to a route that drops it on a UUID check —
    // a filter that looks applied and does nothing, which is worse than the crash it replaced.
    const ledger = readFileSync(resolve(__dirname, "../components/worker-ledger-tab.tsx"), "utf8")
    expect(ledger).toContain('filterWorker !== ALL_WORKERS) params.set("workerId", filterWorker)')
    expect(ledger).not.toMatch(/if \(filterWorker\) params\.set/)
  })
})
