-- Create labor deployments table if it doesn't exist
CREATE TABLE IF NOT EXISTS labor_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_date DATE NOT NULL,
    code VARCHAR(10) NOT NULL,
    reference TEXT NOT NULL,
    labor_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    user_id VARCHAR(50) NOT NULL DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_labor_deployments_date ON labor_deployments(deployment_date DESC);
CREATE INDEX IF NOT EXISTS idx_labor_deployments_code ON labor_deployments(code);
CREATE INDEX IF NOT EXISTS idx_labor_deployments_user ON labor_deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_labor_deployments_created ON labor_deployments(created_at DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_labor_deployments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_labor_deployments_updated_at ON labor_deployments;
CREATE TRIGGER trigger_update_labor_deployments_updated_at
    BEFORE UPDATE ON labor_deployments
    FOR EACH ROW
    EXECUTE FUNCTION update_labor_deployments_updated_at();

-- Add comment to table
COMMENT ON TABLE labor_deployments IS 'Stores labor deployment records with multiple labor groups per deployment';
COMMENT ON COLUMN labor_deployments.labor_entries IS 'JSONB array of labor entries with laborCount and costPerLabor';
