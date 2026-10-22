/**
 * The manual's fixed copy — the bits that do not depend on which modules a tenant has.
 *
 * Moved out of components/app-training-manual.tsx verbatim. This is prose, not logic: it belongs
 * beside the component rather than inside it, and it is the reason that file was the largest
 * pure-content file in the repo.
 */

export const quickJumpSections = [
  { id: "start-here", label: "Start here" },
  { id: "where-to-go", label: "Where do I click?" },
  { id: "settings-guide", label: "Settings, step by step" },
  { id: "daily-routines", label: "Daily routines" },
  { id: "tab-manuals", label: "Every tab" },
  { id: "learning-module", label: "First week lessons" },
  { id: "glossary", label: "Plain words" },
]

export const firstWeekLessons = [
  {
    number: 1,
    title: "Check your activity codes",
    duration: "5 min",
    goal: "Make sure the codes you label work and spending with match how your estate talks about them.",
    how: [
      "Open the Costs tab from the sidebar.",
      "Go to the Cost Codes section.",
      "Your estate already has a full set, taken from a real coffee and pepper estate. Rename anything that does not match your words, add what is missing, and remove what you will never use.",
    ],
    doneLooksLike: "The codes you see are ones you recognise. You will pick from this list every time you record work or a cost.",
  },
  {
    number: 2,
    title: "Record your first expense",
    duration: "5–10 min",
    goal: "Log a real cost: wages paid, materials bought, or anything the estate spent money on.",
    how: [
      "Open Costs → Non-Labour Expenses.",
      "Enter the amount, date, and select an activity code (e.g. LABOR or SUPPLIES).",
      "Add a short note so you remember what this was for.",
      "Save the record.",
    ],
    doneLooksLike: "The expense appears in the list with the correct code, amount, and date.",
  },
  {
    number: 3,
    title: "Mark your first muster",
    duration: "5–10 min",
    goal: "Record who turned up today and what they worked on, which is how every labour cost reaches your reports.",
    how: [
      "Open the Muster tab and pick today's date.",
      "Tick the people who came in. Anyone missing from the list needs adding under Workers first, with their daily rate.",
      "For each person or gang, choose what work they did and which block they did it on.",
      "The day rate comes from the worker's record. For a contract job, enter the price for the whole job instead.",
      "Save the muster.",
    ],
    doneLooksLike: "The day shows a cost for each person, and that cost appears in Costs and in the P&L without you entering it twice.",
  },
  {
    number: 4,
    title: "Add your first inventory item",
    duration: "5 min",
    goal: "Create an item to track: coffee cherry, fertiliser, bags, or any stock your estate holds.",
    how: [
      "Open the Stock & Inventory tab.",
      "Click Add item, give it a name and unit (e.g. kg, bags, litres).",
      "Record the opening quantity so your current stock is correct from day one.",
    ],
    doneLooksLike: "The item shows in the inventory list with the right quantity. Stock movements will update it automatically and show up in Transaction History.",
  },
  {
    number: 5,
    title: "Review your accounts summary",
    duration: "5 min",
    goal: "Check that costs are being captured correctly before the week ends.",
    how: [
      "Open Costs and open the Smart Cost Patterns panel.",
      "Look at the cost breakdown by activity code.",
      "Check that labour and expense totals make sense for the work done this week.",
    ],
    doneLooksLike: "You can see totals by activity code. Any missing or miscoded records are visible and easy to fix.",
  },
]

export const glossary = [
  {
    term: "Location",
    meaning: "A real place in your business, like an estate block, store, or processing point.",
  },
  {
    term: "Lot",
    meaning: "A traceable batch of product you want to keep separate from others.",
  },
  {
    term: "Dispatch",
    meaning: "Stock physically left one place and went somewhere else.",
  },
  {
    term: "Receivable",
    meaning: "Money a customer still owes you.",
  },
  {
    term: "Journal",
    meaning: "A simple note record for important context that does not need a complex form.",
  },
  {
    term: "Module",
    meaning: "One major area of the app, like Processing, Costs, or Rainfall. Your plan and your workspace settings decide which modules are turned on.",
  },
  {
    term: "Subtab",
    meaning: "A smaller view living inside a main tab. For example, Transaction History lives inside Stock & Inventory, and Payroll lives inside Accounts.",
  },
]
