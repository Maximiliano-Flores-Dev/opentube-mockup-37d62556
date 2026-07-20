
-- 1. Fix subscriptions: restrict SELECT to owner, expose only aggregate count
DROP POLICY IF EXISTS "Anyone can view subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscriptions"
ON public.subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_subscriber_count(_channel_name text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.subscriptions WHERE channel_name = _channel_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscriber_count(text) TO anon, authenticated;

-- 2. OTP codes for phone/whatsapp auth (custom flow using Twilio)
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,           -- E.164 phone number
  channel text NOT NULL CHECK (channel IN ('sms','whatsapp')),
  code_hash text NOT NULL,            -- sha256 of the 6-digit code
  attempts int NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_identifier_idx ON public.otp_codes(identifier, channel, created_at DESC);

GRANT ALL ON public.otp_codes TO service_role;
-- No grants to anon/authenticated: only server-side (service role) touches this table.
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
-- No policies -> RLS denies everything to anon/authenticated; service_role bypasses RLS.

-- 3. Videos: source kind + external URL + embed metadata
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'file'
    CHECK (source_kind IN ('file','url','embed')),
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS embed_provider text,      -- 'youtube' | 'vimeo' | null
  ADD COLUMN IF NOT EXISTS embed_video_id text;      -- provider video id
