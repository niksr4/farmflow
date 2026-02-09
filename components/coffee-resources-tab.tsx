"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BookOpen, Coffee, AlertTriangle, Leaf, TrendingUp, Search, ExternalLink } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const COFFEE_VARIETIES = [
  {
    name: "Arabica",
    scientificName: "Coffea arabica",
    description: "Premium coffee with complex flavors, grown at high altitudes (600-2000m). Accounts for 60-70% of global production.",
    characteristics: [
      "Sweeter, softer taste with fruity and floral notes",
      "Lower caffeine content (1.2-1.5%)",
      "More delicate, requires specific growing conditions",
      "Higher market price due to quality"
    ],
    idealConditions: "15-24°C temperature, high altitude, volcanic soil, shade-grown",
  },
  {
    name: "Robusta",
    scientificName: "Coffea canephora",
    description: "Hardy coffee variety with strong, bold flavor. Grown at lower altitudes (200-800m). More resistant to pests and diseases.",
    characteristics: [
      "Stronger, harsher taste with earthy, nutty notes",
      "Higher caffeine content (2.2-2.7%)",
      "More resistant to pests and diseases",
      "Lower production costs, more affordable"
    ],
    idealConditions: "20-30°C temperature, lower altitude, full sun tolerance, humid climate",
  },
]

const PROCESSING_METHODS = [
  {
    name: "Washed (Wet) Processing",
    description: "Cherries are depulped, fermented, and washed before drying. Produces clean, bright flavors.",
    steps: [
      "Cherry harvesting at peak ripeness",
      "Depulping to remove outer skin",
      "Fermentation (12-48 hours) to remove mucilage",
      "Washing to clean beans",
      "Drying to 10-12% moisture content",
      "Hulling to remove parchment"
    ],
    yield: "Typically 18-20% by weight (cherry to green bean)",
    waterUsage: "High - requires 10-20 liters per kg of green coffee",
  },
  {
    name: "Natural (Dry) Processing",
    description: "Whole cherries dried in the sun before removing the dried fruit. Creates fruity, full-bodied flavors.",
    steps: [
      "Cherry harvesting at peak ripeness",
      "Sorting to remove defects",
      "Drying whole cherries (3-4 weeks)",
      "Turning regularly for even drying",
      "Hulling to remove dried cherry and parchment"
    ],
    yield: "Typically 20-22% by weight (cherry to green bean)",
    waterUsage: "Minimal - environmentally friendly method",
  },
  {
    name: "Honey/Pulped Natural",
    description: "Cherry skin removed but some mucilage left during drying. Balanced sweetness and body.",
    steps: [
      "Cherry harvesting and sorting",
      "Depulping with mucilage retention control",
      "Drying with sticky mucilage (10-20 days)",
      "Regular monitoring to prevent mold",
      "Hulling to remove parchment"
    ],
    yield: "Typically 19-21% by weight",
    waterUsage: "Medium - less than washed, more than natural",
  },
]

const COMMON_ISSUES = [
  {
    category: "Harvesting Errors",
    problems: [
      {
        issue: "Picking unripe cherries",
        impact: "Results in sour, astringent coffee with poor quality",
        solution: "Train pickers on color identification. Implement quality checks and payment incentives for ripe cherries only.",
      },
      {
        issue: "Mixing ripe and unripe cherries",
        impact: "Inconsistent flavor profile and reduced lot value",
        solution: "Separate picking rounds. Use flotation to sort by density before processing.",
      },
      {
        issue: "Delaying processing after harvest",
        impact: "Fermentation starts prematurely, leading to off-flavors",
        solution: "Process within 4-6 hours of harvesting. Keep cherries in shade and well-ventilated.",
      },
    ],
  },
  {
    category: "Processing Mistakes",
    problems: [
      {
        issue: "Over-fermentation",
        impact: "Vinegar, rotten flavors that ruin the batch",
        solution: "Monitor fermentation time (12-24 hours typically). Check pH levels. Use clean water and equipment.",
      },
      {
        issue: "Uneven drying",
        impact: "Mold growth, inconsistent moisture content, quality loss",
        solution: "Dry on raised beds with good airflow. Turn regularly (every 30-60 minutes). Aim for uniform 10-12% moisture.",
      },
      {
        issue: "Excessive moisture retention",
        impact: "Mold and mycotoxin development during storage",
        solution: "Use moisture meters. Ensure 10-11% final moisture content. Store in dry, cool, well-ventilated conditions.",
      },
    ],
  },
  {
    category: "Storage & Quality",
    problems: [
      {
        issue: "Improper storage conditions",
        impact: "Rapid quality degradation, loss of aromatics",
        solution: "Use jute or grain pro bags. Maintain 20-25°C temperature, 60-70% humidity. Protect from direct sunlight.",
      },
      {
        issue: "Mixing different lots",
        impact: "Loss of traceability and inability to command premium prices",
        solution: "Label all lots with harvest date, variety, and location. Use FarmFlow for digital tracking.",
      },
      {
        issue: "Not cupping before sale",
        impact: "Missing quality defects that reduce negotiating power",
        solution: "Cup sample from each lot. Grade according to SCA standards. Document quality metrics.",
      },
    ],
  },
]

const YIELD_BENCHMARKS = [
  {
    stage: "Cherry to Parchment",
    typical: "50-55%",
    good: "55-60%",
    description: "Weight retention after depulping and drying"
  },
  {
    stage: "Parchment to Green Bean",
    typical: "80-85%",
    good: "85-88%",
    description: "Weight retention after hulling parchment"
  },
  {
    stage: "Cherry to Green Bean (Overall)",
    typical: "18-20%",
    good: "20-22%",
    description: "Total yield from fresh cherry to export-ready green bean"
  },
]

const SUSTAINABILITY_PRACTICES = [
  {
    title: "Water Conservation",
    practices: [
      "Use natural processing when possible to minimize water usage",
      "Recycle processing water through constructed wetlands",
      "Install water meters to track and reduce consumption",
      "Collect rainwater for processing and irrigation"
    ],
  },
  {
    title: "Soil Health",
    practices: [
      "Apply organic compost from coffee pulp and parchment",
      "Plant nitrogen-fixing shade trees (e.g., Inga, Erythrina)",
      "Use cover crops between coffee plants to prevent erosion",
      "Test soil regularly and apply only necessary amendments"
    ],
  },
  {
    title: "Biodiversity & Shade",
    practices: [
      "Maintain 30-40% shade cover with native trees",
      "Create wildlife corridors connecting forest fragments",
      "Avoid chemical pesticides to protect pollinators",
      "Plant diverse crop species for ecosystem resilience"
    ],
  },
  {
    title: "Energy Efficiency",
    practices: [
      "Use solar dryers or improved parabolic dryers",
      "Install solar panels for processing equipment",
      "Optimize pulper and huller settings to reduce energy waste",
      "Time energy-intensive operations during off-peak hours"
    ],
  },
]

export default function CoffeeResourcesTab() {
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Coffee Knowledge Base</h2>
          <p className="text-muted-foreground">
            Essential resources for coffee farming, processing, and quality control
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search resources..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="varieties" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          <TabsTrigger value="varieties">
            <Coffee className="h-4 w-4 mr-2" />
            Varieties
          </TabsTrigger>
          <TabsTrigger value="processing">
            <Leaf className="h-4 w-4 mr-2" />
            Processing
          </TabsTrigger>
          <TabsTrigger value="issues">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Common Issues
          </TabsTrigger>
          <TabsTrigger value="yields">
            <TrendingUp className="h-4 w-4 mr-2" />
            Yield Benchmarks
          </TabsTrigger>
          <TabsTrigger value="sustainability">
            <Leaf className="h-4 w-4 mr-2" />
            Sustainability
          </TabsTrigger>
        </TabsList>

        <TabsContent value="varieties" className="space-y-4">
          {COFFEE_VARIETIES.map((variety) => (
            <Card key={variety.name}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{variety.name}</CardTitle>
                    <CardDescription className="text-sm italic">{variety.scientificName}</CardDescription>
                  </div>
                  <Badge variant="secondary">{variety.name}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{variety.description}</p>
                
                <div>
                  <h4 className="font-semibold mb-2">Key Characteristics:</h4>
                  <ul className="space-y-2">
                    {variety.characteristics.map((char, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Coffee className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                        <span className="text-sm">{char}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Ideal Growing Conditions:</h4>
                  <p className="text-sm text-muted-foreground">{variety.idealConditions}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          {PROCESSING_METHODS.map((method) => (
            <Card key={method.name}>
              <CardHeader>
                <CardTitle>{method.name}</CardTitle>
                <CardDescription>{method.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-3">Processing Steps:</h4>
                  <ol className="space-y-2">
                    {method.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Badge variant="outline" className="mt-0.5">{idx + 1}</Badge>
                        <span className="text-sm">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-4">
                    <h4 className="font-semibold text-sm mb-1 text-emerald-900 dark:text-emerald-100">Expected Yield</h4>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{method.yield}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <h4 className="font-semibold text-sm mb-1 text-blue-900 dark:text-blue-100">Water Usage</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400">{method.waterUsage}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <Accordion type="single" collapsible className="space-y-4">
            {COMMON_ISSUES.map((category, catIdx) => (
              <Card key={catIdx}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    {category.category}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    {category.problems.map((problem, probIdx) => (
                      <AccordionItem key={probIdx} value={`item-${catIdx}-${probIdx}`}>
                        <AccordionTrigger className="text-left">
                          <span className="font-semibold">{problem.issue}</span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3">
                          <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3">
                            <h5 className="font-semibold text-sm mb-1 text-red-900 dark:text-red-100">Impact:</h5>
                            <p className="text-sm text-red-700 dark:text-red-400">{problem.impact}</p>
                          </div>
                          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
                            <h5 className="font-semibold text-sm mb-1 text-green-900 dark:text-green-100">Solution:</h5>
                            <p className="text-sm text-green-700 dark:text-green-400">{problem.solution}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </Accordion>
        </TabsContent>

        <TabsContent value="yields" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Coffee Processing Yield Benchmarks</CardTitle>
              <CardDescription>
                Use these benchmarks to evaluate your processing efficiency and identify improvement opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {YIELD_BENCHMARKS.map((benchmark, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{benchmark.stage}</h4>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Typical</p>
                        <p className="font-semibold text-amber-600">{benchmark.typical}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Good</p>
                        <p className="font-semibold text-green-600">{benchmark.good}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{benchmark.description}</p>
                </div>
              ))}

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Track Your Yields
                </h4>
                <p className="text-sm text-muted-foreground">
                  Use FarmFlow's processing module to automatically calculate and track your yield percentages at each stage. 
                  Identify inefficiencies and optimize your operations to reach or exceed "good" benchmarks.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sustainability" className="space-y-4">
          {SUSTAINABILITY_PRACTICES.map((practice, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-green-600" />
                  {practice.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {practice.practices.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-semibold text-green-700 dark:text-green-400">{itemIdx + 1}</span>
                      </div>
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-900 dark:text-green-100">
                <Leaf className="h-5 w-5" />
                Why Sustainability Matters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-green-800 dark:text-green-200">
              <p>
                Sustainable practices aren't just good for the environment—they're good for business. Coffee farms that 
                implement these practices often see:
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>30-40% premium prices from specialty buyers seeking ethically sourced coffee</span>
                </li>
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Reduced input costs from efficient water and energy use</span>
                </li>
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Better long-term yields from healthier soil and ecosystems</span>
                </li>
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Access to certification programs (Fair Trade, Rainforest Alliance, etc.)</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <BookOpen className="h-8 w-8 text-primary flex-shrink-0" />
            <div className="space-y-2">
              <h4 className="font-semibold">Want to add your own resources?</h4>
              <p className="text-sm text-muted-foreground">
                This knowledge base grows with your team's experience. Contact support to add farm-specific 
                resources, local best practices, or region-specific coffee information.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
