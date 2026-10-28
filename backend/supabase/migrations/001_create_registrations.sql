-- =============================================================================
-- Migration: 001_create_registrations.sql
-- Description: Creates the registrations table for the AI Growth Agent campaign.
-- Campaign: 500 final-year engineering students | ₹2,000 budget | 7-day duration
-- Rules: Zero seed records. Starts empty.
-- =============================================================================

-- Ensure pgcrypto extension is available for UUID generation if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create registrations table
CREATE TABLE IF NOT EXISTS registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    college TEXT NOT NULL,
    graduation_year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    source TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    record_type TEXT DEFAULT 'genuine' NOT NULL,

    -- Constraints
    CONSTRAINT uq_registrations_email UNIQUE (email),
    CONSTRAINT chk_registrations_record_type CHECK (record_type IN ('genuine', 'test')),
    CONSTRAINT chk_registrations_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 120),
    CONSTRAINT chk_registrations_email_len CHECK (char_length(trim(email)) >= 5 AND char_length(email) <= 255),
    CONSTRAINT chk_registrations_college_len CHECK (char_length(trim(college)) >= 2 AND char_length(college) <= 200),
    CONSTRAINT chk_registrations_grad_year CHECK (graduation_year >= 2020 AND graduation_year <= 2035)
);

-- Performance and query indexes
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_record_type ON registrations (record_type);
CREATE INDEX IF NOT EXISTS idx_registrations_email_lookup ON registrations (email);

-- Enable Row Level Security (RLS)
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Documented Access Model:
-- All API operations (write, paginated read, count) are executed server-side via the
-- Node.js Express backend using a privileged server secret key (service_role).
-- Direct public/anon access is restricted to ensure all validations and constraints
-- are strictly enforced by the backend API.
DROP POLICY IF EXISTS "Deny anon read" ON registrations;
CREATE POLICY "Deny anon read" ON registrations FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon insert" ON registrations;
CREATE POLICY "Deny anon insert" ON registrations FOR INSERT TO anon WITH CHECK (false);

DROP POLICY IF EXISTS "Deny anon update" ON registrations;
CREATE POLICY "Deny anon update" ON registrations FOR UPDATE TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon delete" ON registrations;
CREATE POLICY "Deny anon delete" ON registrations FOR DELETE TO anon USING (false);

-- NOTE: No seed data is inserted. The table starts empty in compliance with project rules.
