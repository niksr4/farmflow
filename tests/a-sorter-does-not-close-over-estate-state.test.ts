/**
 * useListControls memoises its sorted list WITHOUT `sorters` in the dep array. So a sorter that
 * reads changing state out of its closure goes stale silently: the state moves, the list does not
 * re-sort, and the screen shows a confident wrong order.
 *
 * tests/render/list-controls-notices-a-changed-sorter.test.tsx proves both halves of that against
 * the real hook. This guard is the other half of the job: it pins the REAL call sites, because
 * that render test drives toy components and would stay green if processing-tab regressed.
 *
 * #66 shipped exactly this bug -- `bags: (r) => bagsProducedOnRoute(..., processingRoute).total`
 * -- and the fix was to resolve the route-dependent figure into the rows, so the dependence
 * travels through `items`, which the memo DOES track.
 *
 * The file set is DERIVED by finding every caller in the tree, so a tab added tomorrow is covered
 * tomorrow. The forbidden names are derived too: whatever that file declares with useState or
 * useMemo. No hand-kept list of either.
 */
import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "..")

/** Comments are stripped first: this guard's own explanation names the forbidden pattern. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const callers = () =>
  execFileSync("git", ["grep", "-l", "useListControls", "--", "components", "app", "hooks"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && !f.includes("use-list-controls") && !f.includes("filter-bar"))

/** Returns the source between the brace that opens at `from` and its match. */
const balanced = (src: string, from: number): string => {
  const open = src.indexOf("{", from)
  if (open === -1) return ""
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1
    else if (src[i] === "}") {
      depth -= 1
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return ""
}

/**
 * The sorter KEYS are dropped before scanning. A key is a sort option's name, not a reference --
 * `date: (r) => ...` sits next to `const [date, setDate] = useState()` in several tabs, and
 * reading the key as a closure reference flagged six files that were all correct.
 */
const bodiesOnly = (block: string) =>
  block
    .replace(/(^|,)\s*([A-Za-z_$][\w$]*)\s*:/g, "$1")
    // ...and so are property accesses. `r.inches` is a column on the row, and rainfall-tab also
    // holds `const [inches, setInches] = useState()` for its entry form -- unrelated things that
    // happen to share a name. Three more tabs failed this way before the member access was
    // stripped, which is the "regex pinned to names in the current code" trap from CLAUDE.md.
    .replace(/\??\.\s*[A-Za-z_$][\w$]*/g, "")

/** Every `sorters: { ... }` object literal in a file. */
const sorterBlocks = (src: string): string[] => {
  const blocks: string[] = []
  const re = /\bsorters\s*:/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) blocks.push(balanced(src, m.index + m[0].length))
  return blocks
}

/**
 * Anything declared INSIDE the component. A sorter may legitimately reference its own parameter
 * and module-level or imported helpers; everything else it reads is a closure over a value that
 * can change while `items` stays put, which is the bug.
 *
 * ⚠ THIS PREDICATE WAS WRONG ON ITS FIRST ATTEMPT AND THE TAMPER CAUGHT IT. It matched only
 * useState and useMemo bindings, with a comment claiming plain consts "do not change without a
 * re-render that also rebuilds items". They do: `processingRoute` is
 * `const processingRoute = resolveProcessingRoute(settings.estateProfile?.processingRoute)`,
 * a plain const off a PROP, while `items` is useState and does not move at all. Reinstating the
 * real #66 bug left the guard green. Indentation is the test for "inside a component" because
 * Prettier puts module-level declarations at column 0 in every file here.
 */
const declaredInsideComponent = (src: string): string[] => {
  const names: string[] = []
  for (const m of src.matchAll(/^[ \t]+(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) names.push(m[1])
  for (const m of src.matchAll(/^[ \t]+(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*,/gm)) names.push(m[1])
  return [...new Set(names)]
}

describe("a useListControls sorter does not close over estate state", () => {
  const files = callers()

  it("finds the call sites at all", () => {
    // If the grep stops matching, every assertion below passes over nothing.
    expect(files.length).toBeGreaterThanOrEqual(10)
    expect(files).toContain("components/processing-tab.tsx")
  })

  it.each(files)("%s", (file) => {
    const src = stripComments(readFileSync(path.join(ROOT, file), "utf8"))
    const blocks = sorterBlocks(src)
    expect(blocks.length, `no sorters block parsed out of ${file}`).toBeGreaterThan(0)

    const reactive = declaredInsideComponent(src)
    for (const block of blocks) {
      const bodies = bodiesOnly(block)
      // A sorter's own parameter is not a closure. worker-profiles-tab names it `w` and also
      // holds an indented `const w`, which is a name collision rather than a leak.
      const params = new Set(
        [...block.matchAll(/\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>/g)].map((m) => m[1]),
      )
      const leaked = reactive
        .filter((name) => !params.has(name))
        .filter((name) => new RegExp(`\\b${name}\\b`).test(bodies))
      expect(
        leaked,
        `${file}: sorter reads changing state (${leaked.join(", ")}) from its closure. ` +
          `useListControls does not track its sorters, so the list will keep the previous value's ` +
          `order. Resolve the figure into the rows instead and sort on that field.`,
      ).toEqual([])
    }
  })
})
