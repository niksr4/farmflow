"use client"

import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BookOpen, Leaf, Droplets, Sprout, SunMedium, CheckCircle2 } from "lucide-react"

const highlightCards = [
  {
    title: "Selective picking",
    description: "Capture ripeness standards and picking passes so each lot stays consistent.",
    bullets: [
      "Log ripeness cues used by your team (color, firmness, float tests).",
      "Record each pass date to track ripeness windows per block.",
      "Tag lots by plot + picker team so quality notes map cleanly to yield.",
    ],
    image: "/resources/coffee-harvest.jpg",
    alt: "Hands harvesting ripe coffee cherries",
    tag: "Harvest",
  },
  {
    title: "Drying & storage",
    description: "Track drying intent, turning cadence, and storage readiness by lot.",
    bullets: [
      "Note drying method (raised beds, patio, mechanical) and daily turns.",
      "Record shade or cover changes to explain moisture shifts.",
      "Log storage move-in date and bag type to retain quality context.",
    ],
    image: "/resources/coffee-drying.jpg",
    alt: "Coffee beans drying on a bed",
    tag: "Processing",
  },
  {
    title: "Coffee plant anatomy",
    description: "Keep agronomy notes consistent by referring to the same plant parts.",
    bullets: [
      "Use the diagram to label pruning notes or disease observations.",
      "Tie flowering/fruiting notes to the same node terminology.",
      "Map pest issues to branches, nodes, or cherries for clean analysis.",
    ],
    image: "/resources/coffee-plant-diagram.jpg",
    alt: "Diagram of the Coffea arabica plant",
    tag: "Field Guide",
  },
  {
    title: "Pepper intercrop",
    description: "Capture pepper cycles alongside coffee without losing estate context.",
    bullets: [
      "Note support tree condition and vine pruning windows.",
      "Record harvest rounds and drying notes like coffee lots.",
      "Track pepper yield separately to compare ROI by block.",
    ],
    image: "/resources/black-pepper.jpg",
    alt: "Black pepper plant with clusters",
    tag: "Pepper",
  },
]

const checklistItems = [
  {
    title: "Fertilizer & soil log",
    icon: Sprout,
    points: [
      "Record fertilizer brand, composition, and application rate per block.",
      "Attach soil test results and the decision you made from them.",
      "Track weather on application day for context in yield analysis.",
    ],
  },
  {
    title: "Arabica vs Robusta notes",
    icon: Leaf,
    points: [
      "Capture cultivar, shade level, and flowering windows separately by type.",
      "Note picking cadence differences so pricing and quality stay clear.",
      "Store cup profile notes alongside the lot for buyer conversations.",
    ],
  },
  {
    title: "Quality & storage readiness",
    icon: CheckCircle2,
    points: [
      "Log moisture checks and defect sorting with the lot date.",
      "Record where lots are stored so dispatch stays traceable.",
      "Document any re-drying or re-sorting events for the same lot.",
    ],
  },
]

const climateNotes = [
  {
    title: "Rainfall + irrigation",
    icon: Droplets,
    detail: "Use the Rainfall + Journal tabs to correlate irrigation, spray, and yield shifts.",
  },
  {
    title: "Sun & shade",
    icon: SunMedium,
    detail: "Log shade adjustments and canopy work to connect sunlight changes to ripening speed.",
  },
]

export default function ResourcesTab() {
  return (
    <div className="space-y-6">
      <Card className="border-emerald-100 bg-emerald-50/50">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-700" />
              Estate Resources
            </CardTitle>
            <CardDescription>
              Field-ready guides, checklists, and visuals for coffee estates and pepper blocks.
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200">
            Owner-enabled module
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use these guides as a reference while you log inventory, processing, and journal notes. Keep them
          estate-specific by adding your own thresholds and SOPs in the Journal tab.
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {highlightCards.map((card) => (
          <Card key={card.title} className="overflow-hidden border-emerald-100 bg-white/95">
            <div className="relative h-44 w-full">
              <Image
                src={card.image}
                alt={card.alt}
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover"
                priority={card.title === "Selective picking"}
              />
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{card.title}</CardTitle>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  {card.tag}
                </Badge>
              </div>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                {card.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {checklistItems.map((item) => (
          <Card key={item.title} className="border-slate-200 bg-white/95">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <item.icon className="h-4 w-4 text-emerald-700" />
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc ml-4 space-y-1 text-sm text-muted-foreground">
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 bg-white/95">
        <CardHeader>
          <CardTitle className="text-base">Climate & context reminders</CardTitle>
          <CardDescription>Small signals to capture that explain yield swings over time.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          {climateNotes.map((note) => (
            <div key={note.title} className="flex items-start gap-3 rounded-xl border border-slate-100 p-4">
              <note.icon className="mt-0.5 h-4 w-4 text-emerald-700" />
              <div>
                <p className="font-medium text-slate-700">{note.title}</p>
                <p>{note.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-dashed border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Image credits</CardTitle>
          <CardDescription>Source imagery used in this resource library.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Harvest photo: <a href="https://unsplash.com/photos/ktooMlqG28c" target="_blank" rel="noreferrer" className="underline">Unsplash</a>.
          </p>
          <p>
            Drying beans photo: <a href="https://commons.wikimedia.org/wiki/File:Coffee_Beans_Drying_(11586771164).jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>.
          </p>
          <p>
            Coffee plant diagram: <a href="https://commons.wikimedia.org/wiki/File:Diagram_of_Coffea_arabica-cropped.jpg" target="_blank" rel="noreferrer" className="underline">Wikimedia Commons</a>.
          </p>
          <p>
            Pepper plant photo: <a href="https://pixabay.com/photos/black-peppercorn-pepper-spice-8337819/" target="_blank" rel="noreferrer" className="underline">Pixabay</a>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
