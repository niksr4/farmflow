import "server-only"

/**
 * How many kilos are in a bag, for the estate being queried.
 *
 * ⚠ THIS RULE WAS WRITTEN THREE TIMES AND TWO OF THE COPIES DISAGREED, in a way that silently
 * dropped sales. The broken form put the default INSIDE the subquery:
 *
 *   bag AS (SELECT COALESCE(NULLIF(bag_weight_kg, 0), 50) AS kg FROM tenants WHERE id = $1)
 *
 * If no `tenants` row is visible -- and RLS is exactly the thing that can make a row invisible --
 * that CTE has ZERO ROWS. `(SELECT kg FROM bag)` is then NULL, `bags_sold * NULL` is NULL, and
 * every bags-only coffee sale falls out of sold_kg and avg_sell_price. Nothing throws. The other
 * copy put the default outside and returned 50 in the same state, so the two files answered
 * differently for the same estate.
 *
 * The default belongs OUTSIDE, where a missing row still yields a number. Raised by CodeRabbit on
 * PR #123, citing this repo's own instruction: when the same rule is expressed twice, prefer one
 * named definition used twice over two hand-written copies.
 *
 * `app/api/dashboard/cost-per-kg/route.ts` resolves this in JavaScript rather than SQL, which is a
 * different mechanism and correct there; it shares the number below so the two cannot drift.
 */

/** The fallback when an estate has never recorded a bag weight. */
export const DEFAULT_BAG_WEIGHT_KG = 50

/**
 * A scalar SQL expression yielding the tenant's bag weight in kilos, never NULL.
 *
 * Expects the tenant id as `$1`. Inline it into a query; it is a fragment, not a statement.
 */
export const TENANT_BAG_KG_SQL = `COALESCE((SELECT NULLIF(bag_weight_kg, 0) FROM tenants WHERE id = $1 LIMIT 1), ${DEFAULT_BAG_WEIGHT_KG})`
