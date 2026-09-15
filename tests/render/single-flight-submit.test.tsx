import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { useSingleFlight, useSingleFlightSubmit } from "@/hooks/use-single-flight"

/**
 * A dropped submit must still stop the browser submitting.
 *
 * THE DEFECT, raised by Greptile on PR #17. Guarding a form's submit handler the obvious way
 * makes a double-tap WORSE than it was unguarded:
 *
 *     const handleSubmitUnguarded = async (e: React.FormEvent) => { e.preventDefault(); … }
 *     const handleSubmit = useSingleFlight(handleSubmitUnguarded)
 *     <form onSubmit={handleSubmit}>
 *
 * The guard drops the second call — that is the whole point of it — so the second call never
 * reaches `e.preventDefault()`, and the browser performs a native form submit: a full page
 * navigation while the first POST is still in flight. The form blanks itself mid-save and the
 * user has no way to tell whether the record was written.
 *
 * This is the exact damage lib/abortable.ts forbids ("never abort a mutation"), arrived at from
 * the other direction — not by cancelling the request, but by cancelling the page around it.
 *
 * ⚠ WHY THIS TEST HAD TO WAIT FOR THE RENDER NET. The bug is a three-way interaction between a
 * React hook, a DOM event's default action and the browser's form behaviour. In
 * `environment: "node"` there is no form, no event and no default to prevent — the only
 * available assertion was that the source contains the right words. Six files had the wrong
 * words for weeks.
 */

function CountingForm({ guard }: { guard: "correct" | "the-old-trap" }) {
  const submits = useSubmitCounter()
  const save = async () => {
    submits.started()
    await new Promise((resolve) => setTimeout(resolve, 50))
    submits.finished()
  }

  // The shape this hook exists to make unwriteable, kept here so the test can prove the
  // difference rather than just assert the fix.
  const trap = useSingleFlight(async (event: React.FormEvent) => {
    event.preventDefault()
    await save()
  })
  const correct = useSingleFlightSubmit(save)

  return (
    <form onSubmit={guard === "correct" ? correct : trap}>
      <button type="submit">Save</button>
    </form>
  )
}

/** Shared counters, reset per render by useState's initialiser. */
const counters = { started: 0, finished: 0 }
function useSubmitCounter() {
  return {
    started: () => {
      counters.started += 1
    },
    finished: () => {
      counters.finished += 1
    },
  }
}

/**
 * Whether each submit event escaped with its default action intact.
 *
 * ⚠ THE FIRST VERSION OF THIS WATCHED console.error, on the reasoning that jsdom reports
 * unimplemented navigation there. Its negative control failed — the trap shape produced zero
 * console errors — so the detector was measuring nothing, and the two tests above it were
 * passing against a signal that never fires either way. That is the whole reason to write a
 * negative control: it is the only thing that can tell a working assertion from a vacuous one.
 *
 * `defaultPrevented`, read on `document`, is the property itself rather than a proxy for it.
 * Listener placement is load-bearing: React 19 attaches its handlers to the container root, and
 * events bubble from the form THROUGH that root and on to document — so a document-level bubble
 * listener is the first place the flag can be read after React has had its chance to set it. A
 * listener on the form itself would run before React's and always report false.
 */
function watchForNativeSubmit() {
  const escaped: boolean[] = []
  const listener = (event: Event) => {
    escaped.push(!event.defaultPrevented)
    // jsdom would otherwise log "Not implemented: HTMLFormElement.prototype.submit".
    event.preventDefault()
  }
  document.addEventListener("submit", listener)
  return {
    get nativeSubmits() {
      return escaped.filter(Boolean)
    },
    get total() {
      return escaped.length
    },
    restore: () => document.removeEventListener("submit", listener),
  }
}

describe("useSingleFlightSubmit", () => {
  it("runs the save exactly once for a double-tap", async () => {
    counters.started = 0
    counters.finished = 0
    const user = userEvent.setup()
    render(<CountingForm guard="correct" />)

    const button = screen.getByRole("button", { name: "Save" })
    await user.click(button)
    await user.click(button)

    expect(counters.started, "the second tap must not start a second write").toBe(1)
    await waitFor(() => expect(counters.finished).toBe(1))
  })

  it("prevents the browser's own submit on the tap it DROPS", async () => {
    /**
     * The assertion the whole hook exists for. The first tap is prevented because the handler
     * runs; the question is the second, which the guard refuses.
     */
    counters.started = 0
    counters.finished = 0
    const watcher = watchForNativeSubmit()
    const user = userEvent.setup()
    render(<CountingForm guard="correct" />)

    const button = screen.getByRole("button", { name: "Save" })
    await user.click(button)
    await user.click(button)

    expect(watcher.total, "both taps must reach the form as submit events").toBe(2)
    expect(watcher.nativeSubmits, "a dropped submit escaped to the browser").toEqual([])
    watcher.restore()
  })

  it("and the old shape does not — which is why the hook exists", async () => {
    /**
     * A negative control. Without it, the test above passes just as well against a component
     * that never submits at all, and this file would be guarding nothing.
     */
    counters.started = 0
    counters.finished = 0
    const watcher = watchForNativeSubmit()
    const user = userEvent.setup()
    render(<CountingForm guard="the-old-trap" />)

    const button = screen.getByRole("button", { name: "Save" })
    await user.click(button)
    await user.click(button)

    expect(counters.started, "the guard still does its own job in both shapes").toBe(1)
    expect(
      watcher.nativeSubmits.length,
      "the trap shape is supposed to leak a native submit — if this is 0 the test above proves nothing",
    ).toBeGreaterThan(0)
    watcher.restore()
  })

  it("takes no event, so the broken shape cannot be written by accident", () => {
    // A compile-time property asserted at runtime: the guarded action is called with nothing.
    let receivedArgs: unknown[] = ["not called"]
    function Probe() {
      const submit = useSingleFlightSubmit(async (...args: unknown[]) => {
        receivedArgs = args
      })
      return <form onSubmit={submit}><button type="submit">Go</button></form>
    }
    render(<Probe />)
    screen.getByRole("button", { name: "Go" }).click()
    expect(receivedArgs).toEqual([])
  })
})

describe("every form in the app uses it", () => {
  /**
   * The six that had the trap are fixed; this is what stops a seventh arriving. Kept as a source
   * sweep on purpose — it is asking a question about the whole repository, which no single render
   * can answer, and it is cheap enough to run on every commit.
   */
  it("no form binds onSubmit straight to a useSingleFlight-guarded handler", async () => {
    const { readFileSync } = await import("node:fs")
    const { execSync } = await import("node:child_process")
    const files = execSync("git ls-files 'components/**/*.tsx' 'app/**/*.tsx'", { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)

    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(/const (\w+) = useSingleFlight\(/g)) {
        if (source.includes(`onSubmit={${match[1]}}`)) offenders.push(`${file} :: onSubmit={${match[1]}}`)
      }
    }

    expect(offenders, "use useSingleFlightSubmit for a <form>, not useSingleFlight").toEqual([])
  })
})
