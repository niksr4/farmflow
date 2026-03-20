import "server-only"

type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number
}

const combineSignals = (signals: Array<AbortSignal | null | undefined>) => {
  const activeSignals = signals.filter(Boolean) as AbortSignal[]
  if (activeSignals.length === 0) return undefined
  if (activeSignals.length === 1) return activeSignals[0]
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(activeSignals)
  }

  const controller = new AbortController()
  const abort = () => controller.abort()

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener("abort", abort, { once: true })
  }

  return controller.signal
}

export async function fetchWithTimeout(input: RequestInfo | URL, options: FetchWithTimeoutOptions = {}) {
  const { timeoutMs = 10_000, signal, ...init } = options
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(new Error("Request timed out")), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: combineSignals([signal, timeoutController.signal]),
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

