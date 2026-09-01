import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL)
for (const name of ["HoneyFarm","Seshagiri","Medappa Estates"]) {
  const [t] = await sql`SELECT id FROM tenants WHERE name=${name}`
  console.log(`\n############ ${name}`)
  const days = await sql`
    SELECT DISTINCT work_date::text AS d FROM (
      SELECT worker_id, work_date FROM labour_assignments WHERE tenant_id=${t.id}
      GROUP BY 1,2 HAVING sum(day_fraction) > 1.0001) x ORDER BY 1`
  for (const {d} of days) {
    console.log(`\n  --- ${d}`)
    console.table((await sql`
      SELECT la.activity_code AS code, aa.activity, l.name AS block,
             count(*) AS workers, min(la.created_at) AS at,
             count(*) FILTER (WHERE ob.worker_id IS NOT NULL) AS in_overbooked
      FROM labour_assignments la
      LEFT JOIN account_activities aa ON aa.tenant_id=la.tenant_id AND aa.code=la.activity_code
      LEFT JOIN locations l ON l.id = la.location_id
      LEFT JOIN (SELECT worker_id FROM labour_assignments WHERE tenant_id=${t.id} AND work_date=${d}
                 GROUP BY 1 HAVING sum(day_fraction) > 1.0001) ob ON ob.worker_id = la.worker_id
      WHERE la.tenant_id=${t.id} AND la.work_date=${d}
      GROUP BY 1,2,3 ORDER BY min(la.created_at)`).map(r=>({
        code:r.code, activity:(r.activity||"").slice(0,26), block:(r.block||"—").slice(0,18),
        workers:Number(r.workers), doubled:Number(r.in_overbooked),
        entered:new Date(r.at).toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour12:false})})))
  }
  console.log(`\n  how often ${name} uses each of those codes, and with what crew:`)
  console.table((await sql`
    SELECT activity_code AS code, count(DISTINCT work_date) AS days_used,
           round(avg(c)) AS typical_crew, min(c) AS smallest, max(c) AS biggest
    FROM (SELECT activity_code, work_date, count(*) AS c FROM labour_assignments
          WHERE tenant_id=${t.id} GROUP BY 1,2) x
    GROUP BY 1 ORDER BY 2 DESC, 1`).map(r=>({code:r.code, days_used:Number(r.days_used),
      typical_crew:Number(r.typical_crew), smallest:Number(r.smallest), biggest:Number(r.biggest)})))
}
