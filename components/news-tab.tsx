"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TrendingUp, TrendingDown, Activity, ExternalLink } from "lucide-react"
import { formatDateOnly } from "@/lib/date-utils"

interface NewsArticle {
  title: string
  description: string
  url: string
  image?: string
  publishedAt: string
  source: string
}

interface PriceSignal {
  title: string
  value: string
  source: string
}

interface NewsResponse {
  success: boolean
  articles: NewsArticle[]
  trend: "Bullish" | "Bearish" | "Neutral"
  trendScore: number
  priceSignals: PriceSignal[]
  error?: string
}

export default function NewsTab() {
  const [data, setData] = useState<NewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/coffee-news")
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Failed to fetch market news.")
        }
        setData(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred.")
      } finally {
        setLoading(false)
      }
    }

    fetchNews()
  }, [])

  const trendBadge = useMemo(() => {
    if (!data) return null
    if (data.trend === "Bullish") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
          <TrendingUp className="h-3.5 w-3.5 mr-1" /> Bullish
        </Badge>
      )
    }
    if (data.trend === "Bearish") {
      return (
        <Badge className="bg-rose-100 text-rose-700 border-rose-200">
          <TrendingDown className="h-3.5 w-3.5 mr-1" /> Bearish
        </Badge>
      )
    }
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-200">
        <Activity className="h-3.5 w-3.5 mr-1" /> Neutral
      </Badge>
    )
  }, [data])

  if (loading) {
    return <NewsSkeleton />
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market News</CardTitle>
          <CardDescription>Latest coffee market headlines and pricing signals.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Unable to load news</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Market Pulse</CardTitle>
            <CardDescription>Headline sentiment for Arabica & Robusta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              {trendBadge}
              <span className="text-sm text-muted-foreground">Score: {data.trendScore}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              This is a headline-based signal, not a direct price feed.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Price Mentions</CardTitle>
            <CardDescription>Headlines that include price references.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.priceSignals.length ? (
              data.priceSignals.map((signal, index) => (
                <div key={`price-${index}`} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="text-sm font-medium">{signal.title}</p>
                    <p className="text-xs text-muted-foreground">{signal.source}</p>
                  </div>
                  <Badge variant="outline">{signal.value}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No explicit price quotes found in recent headlines.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest Coffee Market News</CardTitle>
          <CardDescription>Arabica, Robusta, and coffee trade updates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.articles.length ? (
            data.articles.map((article, index) => (
              <div key={`article-${index}`} className="flex flex-col md:flex-row md:items-center gap-4 border-b pb-4">
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {formatDateOnly(article.publishedAt)} • {article.source}
                  </p>
                  <h3 className="text-base font-semibold">{article.title}</h3>
                  <p className="text-sm text-muted-foreground">{article.description}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="md:self-start">
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    Read <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent articles found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const NewsSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </CardContent>
    </Card>
  </div>
)
