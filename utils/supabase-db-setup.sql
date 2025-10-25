-- XNET Burn Tracker Database Schema
-- Run this SQL in your Supabase SQL editor

-- Burn events table
CREATE TABLE IF NOT EXISTS burn_events (
  id SERIAL PRIMARY KEY,
  signature TEXT UNIQUE NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  action TEXT NOT NULL DEFAULT 'Burn',
  from_address TEXT NOT NULL,
  to_address TEXT,
  amount BIGINT NOT NULL,
  token TEXT NOT NULL,
  scrape_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log table for tracking runs
CREATE TABLE IF NOT EXISTS burn_tracker_logs (
  id SERIAL PRIMARY KEY,
  run_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_checked INTEGER DEFAULT 0,
  new_burns INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_text TEXT,
  execution_time_ms INTEGER,
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_burn_events_signature ON burn_events(signature);
CREATE INDEX IF NOT EXISTS idx_burn_events_timestamp ON burn_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_burn_events_from_address ON burn_events(from_address);
CREATE INDEX IF NOT EXISTS idx_burn_tracker_logs_run_time ON burn_tracker_logs(run_time DESC);

-- Enable Row Level Security (RLS) for public API access
ALTER TABLE burn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE burn_tracker_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for read-only access to burn_events
CREATE POLICY "Allow public read access to burn_events" ON burn_events
  FOR SELECT USING (true);

-- Create policies for service role access to burn_tracker_logs
CREATE POLICY "Allow service role access to burn_tracker_logs" ON burn_tracker_logs
  FOR ALL USING (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON burn_events TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON burn_events TO authenticated;
