export type ApiErrorShape = {
  success?: boolean
  error?: string
  message?: string
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit & { parseText?: boolean } = {},
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
  const data = text ? JSON.parse(text) : null

  if (!response.ok || (data && data.success === false)) {
    const errorMessage =
      (data as ApiErrorShape)?.error || (data as ApiErrorShape)?.message || response.statusText || "Request failed"
    throw new Error(errorMessage)
  }

  return data as T
}
