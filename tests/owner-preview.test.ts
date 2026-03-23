import { describe, expect, it } from "vitest"
import { appendOwnerPreviewContext, normalizeOwnerPreviewContext } from "../lib/owner-preview"

describe("owner preview navigation", () => {
  it("normalizes valid owner preview context", () => {
    expect(
      normalizeOwnerPreviewContext({
        previewTenantId: "0905ea0c-46dc-42be-8a72-e0b29c10cbea",
        previewRole: "admin",
        previewTenantName: "Laxmi",
      }),
    ).toEqual({
      previewTenantId: "0905ea0c-46dc-42be-8a72-e0b29c10cbea",
      previewRole: "admin",
      previewTenantName: "Laxmi",
    })
  })

  it("rejects invalid preview context", () => {
    expect(
      normalizeOwnerPreviewContext({
        previewTenantId: "not-a-uuid",
        previewRole: "owner",
      }),
    ).toBeNull()
  })

  it("appends preview params to internal links", () => {
    const href = appendOwnerPreviewContext("/manuals", {
      previewTenantId: "0905ea0c-46dc-42be-8a72-e0b29c10cbea",
      previewRole: "user",
      previewTenantName: "Laxmi",
    })

    expect(href).toBe(
      "/manuals?previewTenantId=0905ea0c-46dc-42be-8a72-e0b29c10cbea&previewRole=user&previewTenantName=Laxmi",
    )
  })

  it("preserves existing query params when appending preview params", () => {
    const href = appendOwnerPreviewContext("/dashboard?tab=launcher", {
      previewTenantId: "0905ea0c-46dc-42be-8a72-e0b29c10cbea",
      previewRole: "admin",
    })

    expect(href).toBe("/dashboard?tab=launcher&previewTenantId=0905ea0c-46dc-42be-8a72-e0b29c10cbea&previewRole=admin")
  })
})
