import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendAgentAlertEmail, logAppErrorEvent, logServerWarning } = vi.hoisted(() => ({
  sendAgentAlertEmail: vi.fn(),
  logAppErrorEvent: vi.fn(),
  logServerWarning: vi.fn(),
}))

vi.mock("@/lib/server/agents/alert-email", () => ({ sendAgentAlertEmail }))
vi.mock("@/lib/server/error-events", () => ({ logAppErrorEvent }))
vi.mock("@/lib/server/safe-logging", () => ({ logServerWarning }))

// Static import is safe here: vitest hoists vi.mock above the import graph.
import {
  sendOwnerSignupRequestedAlert,
  sendOwnerTenantCreatedAlert,
} from "@/lib/server/onboarding/owner-alerts"

beforeEach(() => {
  sendAgentAlertEmail.mockReset()
  logAppErrorEvent.mockReset()
  logServerWarning.mockReset()
})

describe("sendOwnerSignupRequestedAlert", () => {
  const input = {
    signupRequestId: "req-1",
    name: "Harish",
    email: "harish@example.com",
    estateName: "Tirtha Estate",
    source: "signup-page",
    ipAddress: "1.2.3.4",
  }

  it("sends an alert email with the signup details in the subject and body", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: true })
    await sendOwnerSignupRequestedAlert(input)

    expect(sendAgentAlertEmail).toHaveBeenCalledTimes(1)
    const call = sendAgentAlertEmail.mock.calls[0][0]
    expect(call.subject).toContain("Tirtha Estate")
    expect(call.text).toContain("req-1")
    expect(call.text).toContain("harish@example.com")
    expect(logServerWarning).not.toHaveBeenCalled()
    expect(logAppErrorEvent).not.toHaveBeenCalled()
  })

  it("logs a warning and an app-error event, but does not throw, when the alert email fails to send", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: false, reason: "provider down" })

    await expect(sendOwnerSignupRequestedAlert(input)).resolves.toBeUndefined()

    expect(logServerWarning).toHaveBeenCalledTimes(1)
    expect(logAppErrorEvent).toHaveBeenCalledTimes(1)
    const errorEvent = logAppErrorEvent.mock.calls[0][0]
    expect(errorEvent.errorCode).toBe("signup_requested_email_failed")
    expect(errorEvent.severity).toBe("warning")
    expect(errorEvent.metadata).toMatchObject({ signupRequestId: "req-1" })
  })

  it("falls back to a generic failure message when the email result has no reason", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: false })
    await sendOwnerSignupRequestedAlert(input)
    const errorEvent = logAppErrorEvent.mock.calls[0][0]
    expect(errorEvent.message).toBe("Owner signup request alert failed")
  })
})

describe("sendOwnerTenantCreatedAlert", () => {
  const input = {
    tenantId: "tenant-1",
    tenantName: "Tirtha Estate",
    origin: "self-serve-signup" as const,
    actorName: "Harish",
    actorEmail: "harish@example.com",
    username: "harish",
    createdBy: "harish",
    source: "signup-page",
  }

  it("sends an alert email naming the new tenant", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: true })
    await sendOwnerTenantCreatedAlert(input)

    const call = sendAgentAlertEmail.mock.calls[0][0]
    expect(call.subject).toContain("Tirtha Estate")
    expect(call.text).toContain("tenant-1")
    expect(call.text).toContain("self-serve-signup")
  })

  it("logs a warning and app-error event when the alert email fails, without throwing", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: false, reason: "provider down" })
    await expect(sendOwnerTenantCreatedAlert(input)).resolves.toBeUndefined()

    expect(logAppErrorEvent).toHaveBeenCalledTimes(1)
    const errorEvent = logAppErrorEvent.mock.calls[0][0]
    expect(errorEvent.errorCode).toBe("tenant_created_email_failed")
    expect(errorEvent.metadata).toMatchObject({ tenantId: "tenant-1", tenantName: "Tirtha Estate" })
  })

  it("renders '-' placeholders for optional fields that are absent", async () => {
    sendAgentAlertEmail.mockResolvedValueOnce({ sent: true })
    await sendOwnerTenantCreatedAlert({
      tenantId: "tenant-2",
      tenantName: "Citrus Grove",
      origin: "owner-console",
    })
    const call = sendAgentAlertEmail.mock.calls[0][0]
    expect(call.text).toContain("Actor Name: -")
    expect(call.text).toContain("Created By: -")
  })
})
