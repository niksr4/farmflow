# Agri UI Research Notes

This note captures practical UI guidance used for the current dashboard pass.

## What we optimized for

- Mobile-first readability and thumb-friendly actions for field teams.
- Fast CSV workflows because estates still run operationally on Excel/Sheets.
- Low-friction data entry and clear “what to do next” controls per module.
- Tenant-safe patterns that do not leak first-tenant assumptions into new tenants.

## Source-backed principles

1. Touch targets and readability baseline  
   WCAG 2.2 guidance supports larger targets and better interaction ergonomics on mobile.

2. Adaptive layout behavior  
   Material adaptive design guidance reinforces responsive structures that reflow actions and content by screen width.

3. Agriculture deployment realities  
   FAO and CGIAR digital-ag guidance emphasize practical, scalable tools that work for varied operational maturity and constraints.

## Product decisions applied in this pass

1. Added a shared `Data Tools` bar in the dashboard shell:
   - dataset selector
   - `Export CSV`
   - `Template` download
   - `Import CSV` deep-link
2. Added tab-aware dataset defaults so each tab opens with the most relevant dataset preselected.
3. Added import-page preselection (`/settings/import?dataset=...`) and in-page template download.
4. Extended export API coverage beyond ops summaries to include:
   - dispatch
   - sales
   - pepper
   - rainfall
   - transactions
   - inventory snapshot
   - labor
   - expenses

## References

- W3C WCAG 2.2 Quick Reference: https://www.w3.org/WAI/WCAG22/quickref/
- Material Design Adaptive Layout: https://m3.material.io/foundations/adaptive-design/large-screens/overview
- FAO digital technologies in agriculture: https://openknowledge.fao.org/server/api/core/bitstreams/a8fcdcd3-0622-4ff2-80ca-f50ca8244862/content
- CGIAR Digital Toolkit announcement: https://www.cgiar.org/news-events/news/cgiar-launches-a-digital-toolkit-for-scalable-and-impactful-agrifood-solutions/
