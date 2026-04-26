-- ==========================================
-- Wall Trap Board Game — Supabase Schema
-- ==========================================
-- Run this SQL in the Supabase SQL Editor to set up the games table.

-- 1. Create the games table
CREATE TABLE IF NOT EXISTS public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- 3. Allow anyone to read games (needed for joining a room)
CREATE POLICY "Anyone can read games"
  ON public.games
  FOR SELECT
  USING (true);

-- 4. Allow anyone to insert games (needed for creating a room)
CREATE POLICY "Anyone can create games"
  ON public.games
  FOR INSERT
  WITH CHECK (true);

-- 5. Allow anyone to update games (needed for gameplay sync)
CREATE POLICY "Anyone can update games"
  ON public.games
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 6. Auto-update `updated_at` on changes
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_games_updated
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 7. Enable Realtime for the games table
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;

-- 8. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games (status);
