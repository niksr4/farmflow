import { describe, expect, it } from "vitest"

import { findAssistantActions } from "../lib/assistant-search"

describe("assistant search shortcuts", () => {
  it("builds deep links for accounts subtabs", () => {
    const actions = findAssistantActions({
      query: "show me fertilizer expenses",
      enabledModules: ["accounts"],
      role: "admin",
    })

    expect(actions[0]).toEqual({
      label: "Open Other Expenses",
      href: "/dashboard?tab=accounts&panel=expenses",
      description: "Log fertilizer, maintenance, diesel, or other account expenses.",
    })
  })

  it("keeps owner-only settings actions away from tenant users", () => {
    const userActions = findAssistantActions({
      query: "where do i add locations",
      enabledModules: ["accounts"],
      role: "user",
    })
    const adminActions = findAssistantActions({
      query: "where do i add locations",
      enabledModules: ["accounts"],
      role: "admin",
    })

    expect(userActions).toEqual([])
    expect(adminActions[0]?.href).toBe("/settings#locations")
  })

  it("links imports to the correct settings section", () => {
    const actions = findAssistantActions({
      query: "bulk import csv",
      enabledModules: ["accounts"],
      role: "admin",
    })

    expect(actions[0]?.href).toBe("/settings#data-import")
  })
})
