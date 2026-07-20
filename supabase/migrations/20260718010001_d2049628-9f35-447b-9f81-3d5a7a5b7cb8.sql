
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- Likes / dislikes
CREATE TABLE public.video_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);
GRANT SELECT ON public.video_likes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_likes TO authenticated;
GRANT ALL ON public.video_likes TO service_role;
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes" ON public.video_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own like" ON public.video_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own like" ON public.video_likes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own like" ON public.video_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.video_likes (video_id);

-- Subscriptions (per channel name)
CREATE TABLE public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, channel_name)
);
GRANT SELECT ON public.subscriptions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view subscriptions" ON public.subscriptions FOR SELECT USING (true);
CREATE POLICY "Users can subscribe" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsubscribe" ON public.subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.subscriptions (channel_name);

-- View increment RPC (open to anon)
CREATE OR REPLACE FUNCTION public.increment_video_views(_video_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.videos SET views = views + 1 WHERE id = _video_id;
$$;
GRANT EXECUTE ON FUNCTION public.increment_video_views(uuid) TO anon, authenticated;
