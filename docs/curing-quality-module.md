# Curing + Quality/Grading Module Plan

This draft is based on commonly used green-coffee standards and drying/conditioning targets.

## Why This Module Exists

Curing and grading are where quality and price get locked. The goal is to capture drying/conditioning control points (moisture + water activity) and a formal defect/grade record that you can attach to lots and buyers.

## Curing Module (Drying + Conditioning)

### Data Model (proposed)

**Table: `curing_batches`**
- `id` (uuid or serial)
- `tenant_id`
- `location_id`
- `lot_id` (nullable)
- `batch_no`
- `coffee_type` (Arabica/Robusta)
- `process_type` (washed/natural/honey)
- `drying_method` (patio/raised_bed/mechanical)
- `drying_start_date`
- `drying_end_date`
- `target_moisture_pct` (default 10–12)
- `final_moisture_pct`
- `water_activity` (aw)
- `parchment_weight_kg`
- `green_weight_kg`
- `outturn_pct` (green / parchment * 100)
- `storage_bin` / `warehouse`
- `notes`
- `created_at`, `updated_at`

**Table: `curing_checks`** (daily/lot checks)
- `id`
- `curing_batch_id`
- `check_date`
- `moisture_pct`
- `water_activity` (optional)
- `bed_or_bin` (optional)
- `temperature_c` (optional)
- `notes`

### Built-in validations
- **Moisture target:** safe storage is typically **10–12%** moisture for green coffee. citeturn4view0
- **Water activity target:** **0.55–0.65** is a common safe band for green coffee stability. citeturn4view0

### UI Inputs
- Create batch → choose location + lot + process type + drying method.
- Daily moisture checks (bulk import or manual).
- Auto-calc outturn and flag deviations.

## Quality / Grading Module

### Data Model (proposed)

**Table: `grading_samples`**
- `id`
- `tenant_id`
- `location_id`
- `lot_id` / `batch_no`
- `sample_weight_g` (default 300)
- `screen_distribution_json` (e.g., % retained in screens 14–18)
- `primary_defects_count`
- `secondary_defects_count`
- `defect_units_total`
- `grade_label` (specialty/premium/exchange/below/off or custom)
- `moisture_pct`
- `water_activity`
- `cupping_score` (optional)
- `notes`
- `created_at`

**Table: `grading_defects`** (optional detail for audits)
- `id`
- `grading_sample_id`
- `defect_type`
- `count`
- `defect_units`

### Standards to align with
- **SCAA/SCA-style grading** uses **300g samples** and defect counts. Specialty grade is **≤5 full defects**, Premium **≤8**, Exchange **9–23** in 300g, with moisture typically **9–13%**. citeturn3view0
- **Screen size distribution** often uses screens **14–18** for the sample. citeturn3view0
- **Defect categories** are defined in **ISO 10470**, which provides a reference chart and defect categories used for green coffee grading. citeturn4view1

### UI Inputs
- Select lot → enter sample weight + screen distribution + defect counts.
- Auto-calc **defect units** and **grade label**.
- Store moisture/water activity alongside grading.

## Suggested KPIs

- Moisture compliance rate (% within 10–12%). citeturn4view0
- Water activity compliance rate (% within 0.55–0.65). citeturn4view0
- Defect units per 300g and grade label (SCAA-style thresholds). citeturn3view0
- Screen size distribution by lot. citeturn3view0

## Next Build Steps

1. Add module IDs: `curing`, `quality` in `lib/modules.ts`.
2. Create SQL migration for `curing_batches`, `curing_checks`, `grading_samples`.
3. Build `CuringTab` and `QualityTab` UI with CSV import + charts.
4. Add KPIs to Season View for moisture compliance, defect units, and grade mix.

