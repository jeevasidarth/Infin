-- SQL to create the disruption_news table in Supabase
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.disruption_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city TEXT UNIQUE NOT NULL,
    event_type TEXT, -- 'Bandh', 'Strike', 'Protest', 'Road Block', etc.
    headline TEXT NOT NULL,
    description TEXT,
    severity TEXT, -- 'High', 'Medium', 'Low'
    affected_services TEXT, -- e.g. 'Transport, Delivery'
    published_at TIMESTAMPTZ,
    source_used TEXT,
    trust_score FLOAT DEFAULT 1.0,
    dvs_score FLOAT DEFAULT 0.0,
    source_agreement_score FLOAT DEFAULT 0.0,
    threshold_breach_score FLOAT DEFAULT 0.0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disruption_news ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Allow public read disruption_news" ON public.disruption_news;
CREATE POLICY "Allow public read disruption_news" ON public.disruption_news
    FOR SELECT USING (true);

-- Allow backend to insert/update (upsert) records
DROP POLICY IF EXISTS "Allow all for backend disruption_news" ON public.disruption_news;
CREATE POLICY "Allow all for backend disruption_news" ON public.disruption_news
    FOR ALL USING (true) WITH CHECK (true);
