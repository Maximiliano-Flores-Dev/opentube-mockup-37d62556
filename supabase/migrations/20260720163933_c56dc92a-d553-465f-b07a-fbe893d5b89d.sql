CREATE TABLE public.crypto_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crypto_identities TO authenticated;
GRANT SELECT ON public.crypto_identities TO anon;
GRANT ALL ON public.crypto_identities TO service_role;

ALTER TABLE public.crypto_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read public keys"
  ON public.crypto_identities
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can insert their own public key"
  ON public.crypto_identities
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own public key"
  ON public.crypto_identities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own public key"
  ON public.crypto_identities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE public.signaling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX idx_signaling_receiver_room ON public.signaling (receiver_id, room_id);
CREATE INDEX idx_signaling_expires ON public.signaling (expires_at);

GRANT SELECT, INSERT, DELETE ON public.signaling TO authenticated;
GRANT ALL ON public.signaling TO service_role;

ALTER TABLE public.signaling ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can send signals as themselves"
  ON public.signaling
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can receive their own signals"
  ON public.signaling
  FOR SELECT
  TO authenticated
  USING (auth.uid() = receiver_id);

CREATE POLICY "Users can delete their own signals"
  ON public.signaling
  FOR DELETE
  TO authenticated
  USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.delete_expired_signals()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  DELETE FROM public.signaling WHERE expires_at < now();
$$;

CREATE OR REPLACE FUNCTION public.update_crypto_identities_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_crypto_identities_updated_at
BEFORE UPDATE ON public.crypto_identities
FOR EACH ROW
EXECUTE FUNCTION public.update_crypto_identities_updated_at();
