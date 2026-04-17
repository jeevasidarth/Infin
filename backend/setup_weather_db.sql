-- SQL to create the weather_snapshots table in Supabase
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.weather_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city TEXT UNIQUE NOT NULL,
    temperature_c FLOAT NOT NULL,
    feels_like_c FLOAT,
    rain_mm FLOAT DEFAULT 0,
    rain_cm_display FLOAT DEFAULT 0,
    humidity FLOAT,
    wind_kph FLOAT,
    condition TEXT,
    visibility_km FLOAT,
    heat_index FLOAT,
    alert_status TEXT,
    source_used TEXT DEFAULT 'WeatherAPI',
    trust_score FLOAT DEFAULT 1.0,
    dvs_score FLOAT DEFAULT 0.0,
    source_agreement_score FLOAT DEFAULT 0.0,
    threshold_breach_score FLOAT DEFAULT 0.0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weather_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Allow public read access" ON public.weather_snapshots;
CREATE POLICY "Allow public read access" ON public.weather_snapshots
    FOR SELECT USING (true);

-- Allow backend to insert/update (upsert) records
DROP POLICY IF EXISTS "Allow all for backend" ON public.weather_snapshots;
CREATE POLICY "Allow all for backend" ON public.weather_snapshots
    FOR ALL USING (true) WITH CHECK (true);
