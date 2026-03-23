"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { appendOwnerPreviewContext, normalizeOwnerPreviewContext } from "@/lib/owner-preview"
import { cn } from "@/lib/utils"

type WorkspaceNavigatorBackButtonProps = {
  href?: string
  label?: string
  className?: string
}

export default function WorkspaceNavigatorBackButton({
  href = "/dashboard?tab=launcher",
  label = "Back to Workspace Navigator",
  className,
}: WorkspaceNavigatorBackButtonProps) {
  const searchParams = useSearchParams()
  const previewContext = useMemo(
    () =>
      normalizeOwnerPreviewContext({
        previewTenantId: searchParams.get("previewTenantId"),
        previewRole: searchParams.get("previewRole"),
        previewTenantName: searchParams.get("previewTenantName"),
      }),
    [searchParams],
  )
  const resolvedHref = useMemo(() => appendOwnerPreviewContext(href, previewContext), [href, previewContext])

  return (
    <Button asChild variant="outline" size="sm" className={cn("bg-white/80", className)}>
      <Link href={resolvedHref} className="inline-flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  )
}
