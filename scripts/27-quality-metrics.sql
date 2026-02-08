-- Add quality + moisture fields to processing records.

ALTER TABLE processing_records
  ADD COLUMN IF NOT EXISTS moisture_pct numeric,
  ADD COLUMN IF NOT EXISTS quality_grade text,
  ADD COLUMN IF NOT EXISTS defect_notes text,
  ADD COLUMN IF NOT EXISTS quality_photo_url text;
