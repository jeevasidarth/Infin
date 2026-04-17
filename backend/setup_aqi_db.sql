-- SQL to create the aqi_snapshots table in Supabase
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.aqi_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city TEXT UNIQUE NOT NULL,
    -- DVS Gate fields (backend use)
    aqi FLOAT DEFAULT 0,
    dvs_score FLOAT DEFAULT 0.0,
    source_agreement_score FLOAT DEFAULT 0.0,
    threshold_breach_score FLOAT DEFAULT 0.0,
    -- Display fields (frontend use)
    pm2_5 FLOAT DEFAULT 0,
    pm10 FLOAT DEFAULT 0,
    risk_level TEXT DEFAULT 'Good',
    health_advisory TEXT DEFAULT 'Air quality is satisfactory.',
    source_used TEXT DEFAULT 'Open-Meteo',
    trust_score FLOAT DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aqi_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Allow public read aqi" ON public.aqi_snapshots;
CREATE POLICY "Allow public read aqi" ON public.aqi_snapshots
    FOR SELECT USING (true);

-- Allow backend to insert/update (upsert) records
DROP POLICY IF EXISTS "Allow all for backend aqi" ON public.aqi_snapshots;
CREATE POLICY "Allow all for backend aqi" ON public.aqi_snapshots
    FOR ALL USING (true) WITH CHECK (true);
