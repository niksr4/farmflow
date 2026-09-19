import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, afterEach } from "vitest"
import { useMediaQuery } from "@/hooks/use-media-query"

/**
 * useSyncExternalStore tears down and resubscribes whenever the `subscribe` function it was
 * given changes identity. The original implementation passed inline arrow functions
 * (`(callback) => subscribe(query, callback)`) with no memoization, so every render of every
 * component calling this hook — not just a query change — re-ran `matchMedia(query)` and
 * re-attached a `change` listener. Ten call sites across the app (worker-profiles-tab,
 * inventory-system, and others) use this hook, several of them re-rendering frequently, so this
 * was live, repeated DOM work on every keystroke/state update in those components, not just on
 * mount.
 *
 * This test proves the fix holds: an unrelated re-render of the host component must not touch
 * the matchMedia subscription at all.
 */

type Listener = () => void

function makeMatchMediaMock(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<Listener>()
  let addCalls = 0
  let removeCalls = 0

  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_type: string, listener: Listener) => {
      addCalls += 1
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: Listener) => {
      removeCalls += 1
      listeners.delete(listener)
    },
  }

  return {
    matchMediaFn: (() => mql) as unknown as typeof window.matchMedia,
    fireChange: (next: boolean) => {
      matches = next
      listeners.forEach((l) => l())
    },
    get addCalls() {
      return addCalls
    },
    get removeCalls() {
      return removeCalls
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

function Probe({ query }: { query: string }) {
  const matches = useMediaQuery(query)
  return <span data-testid="matches">{String(matches)}</span>
}

function Host({ query }: { query: string }) {
  const [tick, setTick] = useState(0)
  return (
    <div>
      <Probe query={query} />
      <span data-testid="tick">{tick}</span>
      <button onClick={() => setTick((t) => t + 1)}>bump</button>
    </div>
  )
}

describe("useMediaQuery", () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it("subscribes once on mount and does not resubscribe on an unrelated re-render", async () => {
    const mock = makeMatchMediaMock(false)
    window.matchMedia = mock.matchMediaFn

    render(<Host query="(min-width: 768px)" />)
    expect(mock.addCalls, "one subscription on mount").toBe(1)

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "bump" }))
    await user.click(screen.getByRole("button", { name: "bump" }))

    expect(screen.getByTestId("tick").textContent).toBe("2")
    expect(mock.addCalls, "a re-render with the same query must not resubscribe").toBe(1)
    expect(mock.removeCalls, "and must not tear the subscription down either").toBe(0)
  })

  it("reflects a matchMedia change event", async () => {
    const mock = makeMatchMediaMock(false)
    window.matchMedia = mock.matchMediaFn

    render(<Probe query="(min-width: 768px)" />)
    expect(screen.getByTestId("matches").textContent).toBe("false")

    mock.fireChange(true)

    expect(await screen.findByText("true")).toBeInTheDocument()
  })

  it("unsubscribes on unmount", () => {
    const mock = makeMatchMediaMock(false)
    window.matchMedia = mock.matchMediaFn

    const { unmount } = render(<Probe query="(min-width: 768px)" />)
    expect(mock.listenerCount).toBe(1)
    unmount()
    expect(mock.listenerCount, "unmount must remove the change listener").toBe(0)
  })
})
