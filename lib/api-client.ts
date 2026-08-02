export type ApiErrorShape = {
  success?: boolean
  error?: string
  message?: string
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials ?? "same-origin",
  })

  const text = await response.text()

  // Parsed defensively. A gateway error, an auth redirect or a Vercel error page all return
  // HTML, and an unguarded JSON.parse turned those into "Unexpected token '<' is not valid
  // JSON" — thrown BEFORE the status was ever inspected, so the real failure (a 502, a 401)
  // was replaced by a message that tells the caller nothing. lib/abortable.ts's fetchJson
  // already guarded this exact case; this brings the two into line.
  let data: unknown = null
  let bodyWasUnparseable = false
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      bodyWasUnparseable = true
    }
  }

  const payload = data as ApiErrorShape | null

  if (!response.ok || payload?.success === false) {
    const errorMessage =
      payload?.error || payload?.message || response.statusText || "Request failed"
    throw new Error(errorMessage)
  }

  // A 2xx carrying a non-JSON body must still fail. Returning null here would hand the caller
  // an object whose every field is undefined instead of an error — quieter than the old
  // SyntaxError, and considerably worse.
  if (bodyWasUnparseable) {
    throw new Error("The server returned an unexpected response. Please try again.")
  }

  return data as T
}
