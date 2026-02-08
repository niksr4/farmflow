# Module Template

Use this as the baseline checklist + skeleton when adding new FarmFlow modules.

## 1) Checklist

- Add a module ID + label in `lib/modules.ts`.
- Add module gating in `components/inventory-system.tsx` (tab visibility + tab content).
- Add the module tab UI component in `components/`.
- Add API routes under `app/api/<module-id>/route.ts` with `requireModuleAccess`.
- Add database tables with `tenant_id`, `location_id` (if relevant), `created_at`, `updated_at`.
- Add RLS policies that key off `app.tenant_id` for tenant isolation.
- Add module copy to the landing page and pricing (optional).

## 2) Data Model Template (SQL)

```sql
-- Example module table
CREATE TABLE IF NOT EXISTS <module_records> (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  record_date DATE NOT NULL,
  metric_a DECIMAL(10,2) DEFAULT 0,
  metric_b DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, location_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_<module_records>_tenant_id ON <module_records>(tenant_id);
CREATE INDEX IF NOT EXISTS idx_<module_records>_location_id ON <module_records>(location_id);
CREATE INDEX IF NOT EXISTS idx_<module_records>_record_date ON <module_records>(record_date);
```

## 3) API Route Template

```ts
import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("<module-id>")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM <module_records>
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY record_date DESC
      `,
    )

    return NextResponse.json({ success: true, records: rows || [] })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("<module-id>")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const payload = await request.json()

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO <module_records> (tenant_id, location_id, record_date, metric_a, metric_b, notes)
        VALUES (${tenantContext.tenantId}, ${payload.location_id}, ${payload.record_date}, ${payload.metric_a}, ${payload.metric_b}, ${payload.notes || ""})
        RETURNING *
      `,
    )

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
```

## 4) UI Component Template

```tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"

export default function ModuleTab() {
  const { user } = useAuth()
  const [records, setRecords] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!user?.tenantId) return
    fetch("/api/<module-id>")
      .then((res) => res.json())
      .then((data) => setRecords(data.records || []))
      .catch(() => setRecords([]))
  }, [user?.tenantId])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await fetch("/api/<module-id>", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record_date: new Date().toISOString().slice(0, 10) }),
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module Title</CardTitle>
        <CardDescription>Describe the purpose and what operators should do here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="metric-a">Metric A</Label>
            <Input id="metric-a" placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric-b">Metric B</Label>
            <Input id="metric-b" placeholder="0" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Metric A</TableHead>
                <TableHead>Metric B</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No records yet.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.record_date}</TableCell>
                    <TableCell>{record.metric_a}</TableCell>
                    <TableCell>{record.metric_b}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
```

## 5) Inventory System Hook

Add the module tab to `components/inventory-system.tsx`:

- import the module component
- add a `canShow<Module>` gate
- add a `TabsTrigger` + `TabsContent`

## 6) Tenant Settings & Pricing

Add a module toggle in `lib/modules.ts`, and the settings UI automatically includes it.
