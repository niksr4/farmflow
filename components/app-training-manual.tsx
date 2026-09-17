import Link from "next/link"
import { BookOpen, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import WorkspaceNavigatorBackButton from "@/components/workspace-navigator-back-button"
import { DEFAULT_TENANT_PLAN_ID, getPlanModuleIds } from "@/lib/modules"

import { firstWeekLessons, glossary, quickJumpSections } from "@/components/app-training-manual/content"
import type { AppTrainingManualProps, ManualGroup } from "@/components/app-training-manual/types"
import {
  buildDailyRoutines,
  buildDecisionRules,
  buildManualGroups,
  buildSettingsManualGroups,
  buildStartHereSteps,
  toPlanLabel,
  unique,
} from "@/components/app-training-manual/build"

function ManualGroupCard({ group }: { group: ManualGroup }) {
  const GroupIcon = group.icon
  return (
    <Card className="border-slate-200 bg-white/95">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={group.badgeClassName}>
            <GroupIcon className="mr-1.5 h-3.5 w-3.5" />
            {group.title}
          </Badge>
        </div>
        <CardTitle className="text-lg">{group.title}</CardTitle>
        <CardDescription>{group.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {group.items.map((item) => (
          <div key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-slate-900">{item.name}</p>
            <p className="mt-2 text-sm text-slate-700">
              <span className="font-medium">What it is: </span>
              {item.whatItIs}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-slate-700">Open it when: </span>
              {item.openItWhen}
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              <span className="font-medium">Done looks like: </span>
              {item.doneLooksLike}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function AppTrainingManual({
  enabledModules,
  isTailored = false,
  planId = DEFAULT_TENANT_PLAN_ID,
  userRole = null,
}: AppTrainingManualProps) {
  const resolvedPlanId = planId || DEFAULT_TENANT_PLAN_ID
  const visibleModules = unique(
    enabledModules?.length ? enabledModules : getPlanModuleIds(resolvedPlanId),
  )

  const startHereSteps = buildStartHereSteps(visibleModules)
  const decisionRules = buildDecisionRules(visibleModules, { isTailored, userRole })
  const dailyRoutines = buildDailyRoutines(visibleModules, { isTailored, userRole })
  const manualGroups = buildManualGroups(visibleModules, { isTailored, userRole })
  const settingsManualGroups = buildSettingsManualGroups({ isTailored, userRole })
  const planLabel = toPlanLabel(resolvedPlanId)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(207,238,228,0.85),transparent_28%),linear-gradient(180deg,#f8fbfa_0%,#eef5f2_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="overflow-hidden border-white/70 bg-white/92 shadow-[0_35px_90px_-50px_rgba(14,93,82,0.45)]">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Beginner-friendly manual
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {isTailored ? `${planLabel} workspace guide` : "Core workspace focus"}
              </Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                Only enabled tabs shown
              </Badge>
            </div>
            <div className="space-y-2">
              <CardTitle className="font-display text-3xl text-slate-900">FarmFlow Training Manuals</CardTitle>
              <CardDescription className="max-w-3xl text-sm text-slate-600">
                Plain-language guidance for first-time users. This explains what each major area does, when to open it,
                and what a good record looks like. Tabs that are not enabled for this workspace stay out of this guide.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-950">
              If you remember only one rule, remember this: when stock changes, use Operations. When money changes,
              use Finance. When you are only reviewing trends or health, use Reports.
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <WorkspaceNavigatorBackButton className="border-emerald-200 bg-white" />
              <Button asChild variant="outline" className="bg-white">
                <Link href="/welcome">Open welcome setup</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/92">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-[0.2em] text-slate-600">Quick jump</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {quickJumpSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {section.label}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card id="start-here" className="scroll-mt-24 border-emerald-100 bg-white/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-4 w-4 text-emerald-700" />
              Start here
            </CardTitle>
            <CardDescription>These are the first things a new tenant admin should understand.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {startHereSteps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Step {index + 1}</p>
                <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="where-to-go" className="scroll-mt-24 border-slate-200 bg-white/95">
          <CardHeader>
            <CardTitle className="text-lg">Where do I click?</CardTitle>
            <CardDescription>Use these simple rules when you are confused about which tab to open.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {decisionRules.map((rule) => (
              <div key={rule.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{rule.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{rule.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div id="settings-guide" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Settings, step by step</h2>
            <p className="text-sm text-muted-foreground">
              Settings is organised into six groups. They are ordered the way most estates should actually use them —
              start with Profile and Estate, add People and Locations, and only open Privacy or Advanced when you have
              a specific reason to.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-950">
            <span className="font-semibold">Recommended order:</span> Estate Identity → Locations → People and Roles
            (get the basics running) — then Estate Footprint, Data Import, Language, and Account Security (useful
            context) — then Thresholds, Dashboard Preferences, Allowed Modules, Per-User Exceptions, Tenant Experience,
            and Audit Log (tune only when you have a clear reason to).
          </div>
          {settingsManualGroups.map((group) => (
            <ManualGroupCard key={group.id} group={group} />
          ))}
        </div>

        <div id="daily-routines" className="scroll-mt-24 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daily routines</h2>
            <p className="text-sm text-muted-foreground">Role-based cheat sheets for common users.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dailyRoutines.map((routine) => (
              <Card key={routine.title} className="border-slate-200 bg-white/95">
                <CardHeader>
                  <CardTitle className="text-base">{routine.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                    {routine.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div id="tab-manuals" className="scroll-mt-24 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Every major tab explained</h2>
            <p className="text-sm text-muted-foreground">
              Each card answers three beginner questions: what is it, when do I open it, and what does “done” look like?
            </p>
          </div>
          {manualGroups.map((group) => (
            <ManualGroupCard key={group.id} group={group} />
          ))}
        </div>

        <Card id="learning-module" className="scroll-mt-24 border-emerald-100 bg-white/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-4 w-4 text-emerald-700" />
              First week lessons
            </CardTitle>
            <CardDescription>
              Five short lessons that walk you through the most important things to do in your first week on FarmFlow.
              Each lesson takes 5–10 minutes and builds on the previous one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {firstWeekLessons.map((lesson) => (
              <div key={lesson.number} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">
                    {lesson.number}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{lesson.title}</p>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-600">
                        {lesson.duration}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-slate-700">Goal: </span>
                      {lesson.goal}
                    </p>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">How</p>
                      <ol className="space-y-1">
                        {lesson.how.map((step, index) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-slate-700">
                            <span className="mt-0.5 text-xs font-semibold text-slate-400">{index + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                      <p className="text-xs text-emerald-800">
                        <span className="font-semibold">Done looks like: </span>
                        {lesson.doneLooksLike}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card id="glossary" className="scroll-mt-24 border-slate-200 bg-white/95">
          <CardHeader>
            <CardTitle className="text-lg">Plain words</CardTitle>
            <CardDescription>Short definitions for terms users commonly trip over.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {glossary.map((entry) => (
              <div key={entry.term} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{entry.term}</p>
                <p className="mt-2 text-sm text-muted-foreground">{entry.meaning}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Final beginner rule
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-emerald-950">
            Do not try to use every tab on day one. Start with the few tabs that match your real work today, keep the
            records honest, and add more detail only after the team is comfortable.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
