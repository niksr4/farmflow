"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"

export default function ModuleTabTemplate() {
  const { user } = useAuth()
  const [records, setRecords] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!user?.tenantId) return
    fetch("/api/__MODULE_ID__")
      .then((res) => res.json())
      .then((data) => setRecords(data.records || []))
      .catch(() => setRecords([]))
  }, [user?.tenantId])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await fetch("/api/__MODULE_ID__", {
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
