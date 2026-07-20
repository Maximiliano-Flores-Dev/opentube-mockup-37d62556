
CREATE TABLE public.video_seeders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (video_id, user_id)
);

CREATE INDEX video_seeders_video_last_seen_idx
  ON public.video_seeders (video_id, last_seen DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_seeders TO authenticated;
GRANT ALL ON public.video_seeders TO service_role;

ALTER TABLE public.video_seeders ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can see who is currently seeding a video (public swarm view).
CREATE POLICY "Authenticated can read seeders"
  ON public.video_seeders FOR SELECT
  TO authenticated
  USING (true);

-- Users can only announce/refresh/withdraw their own seed rows.
CREATE POLICY "Users manage their own seeder rows"
  ON public.video_seeders FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Live peer count for a video (excludes stale seeders older than 5 minutes).
CREATE OR REPLACE FUNCTION public.get_active_seeder_count(_video_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.video_seeders
  WHERE video_id = _video_id
    AND last_seen > now() - interval '5 minutes';
$$;

REVOKE ALL ON FUNCTION public.get_active_seeder_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_seeder_count(uuid) TO authenticated, anon;

-- Prune long-stale rows opportunistically.
CREATE OR REPLACE FUNCTION public.prune_stale_seeders()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.video_seeders
  WHERE last_seen < now() - interval '1 hour';
$$;

REVOKE ALL ON FUNCTION public.prune_stale_seeders() FROM PUBLIC;
