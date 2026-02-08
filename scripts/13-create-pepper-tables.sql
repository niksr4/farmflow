-- Create pepper tracking tables for three locations
-- Each table tracks daily pepper harvest and processing data

-- PG Pepper location table
CREATE TABLE IF NOT EXISTS pg_pepper (
    id SERIAL PRIMARY KEY,
    process_date DATE NOT NULL UNIQUE,
    kg_picked DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    dry_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    dry_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    recorded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HF Pepper location table
CREATE TABLE IF NOT EXISTS hf_pepper (
    id SERIAL PRIMARY KEY,
    process_date DATE NOT NULL UNIQUE,
    kg_picked DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    dry_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    dry_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    recorded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MV Pepper location table
CREATE TABLE IF NOT EXISTS mv_pepper (
    id SERIAL PRIMARY KEY,
    process_date DATE NOT NULL UNIQUE,
    kg_picked DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    green_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    dry_pepper DECIMAL(10, 2) NOT NULL DEFAULT 0,
    dry_pepper_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    recorded_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pg_pepper_date ON pg_pepper(process_date DESC);
CREATE INDEX IF NOT EXISTS idx_hf_pepper_date ON hf_pepper(process_date DESC);
CREATE INDEX IF NOT EXISTS idx_mv_pepper_date ON mv_pepper(process_date DESC);

CREATE INDEX IF NOT EXISTS idx_pg_pepper_created ON pg_pepper(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hf_pepper_created ON hf_pepper(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mv_pepper_created ON mv_pepper(created_at DESC);

-- Add comments
COMMENT ON TABLE pg_pepper IS 'Pepper harvest and processing records for PG location';
COMMENT ON TABLE hf_pepper IS 'Pepper harvest and processing records for HF location';
COMMENT ON TABLE mv_pepper IS 'Pepper harvest and processing records for MV location';
