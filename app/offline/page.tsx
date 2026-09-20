import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-6 py-10">
      <Card className="w-full border-emerald-100 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle>No signal here</CardTitle>
          <CardDescription>
            What you have already opened will keep working. Anything you write now waits on the
            phone and goes up by itself when a bar comes back.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Dispatch, pulping, sales and store entries are all held until then. None of it is lost.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="bg-transparent">
              <Link href="/">Go to login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
