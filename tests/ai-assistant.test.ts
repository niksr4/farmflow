import { describe, expect, it } from "vitest"

import {
  buildAssistantWorkspaceContextFromModules,
  buildAssistantWorkspaceContextSummary,
  sanitizeAssistantMessages,
} from "../lib/ai-assistant"

describe("ai assistant helpers", () => {
  it("keeps only valid recent chat messages", () => {
    const messages = sanitizeAssistantMessages([
      { role: "system", content: "ignore this" },
      { role: "user", content: "  First question  " },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "" },
      { role: "user", content: "Second question" },
    ])

    expect(messages).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "Answer" },
      { role: "user", content: "Second question" },
    ])
  })

  it("builds a readable workspace summary", () => {
    const summary = buildAssistantWorkspaceContextSummary({
      currentWorkspaceLabel: "Dashboard",
      availableWorkspaces: ["Dashboard", "Inventory", "Sales"],
      workspaceHints: [
        { label: "Inventory", detail: "Use Inventory for stock balances." },
        { label: "Sales", detail: "Use Sales for coffee and other sales." },
      ],
    })

    expect(summary).toContain("Current workspace: Dashboard")
    expect(summary).toContain("Available workspaces in this session: Dashboard, Inventory, Sales")
    expect(summary).toContain("- Inventory: Use Inventory for stock balances.")
    expect(summary).toContain("- Sales: Use Sales for coffee and other sales.")
  })

  it("filters workspace labels based on role-sensitive module visibility", () => {
    const userContext = buildAssistantWorkspaceContextFromModules(["inventory", "sales", "other-sales", "accounts"], "user")
    const adminContext = buildAssistantWorkspaceContextFromModules(["inventory", "sales", "other-sales", "accounts"], "admin")

    expect(userContext.availableWorkspaces).toEqual(["Dashboard", "Inventory", "Accounts", "Settings"])
    expect(adminContext.availableWorkspaces).toEqual(["Dashboard", "Inventory", "Sales", "Accounts", "Settings"])
  })
})
