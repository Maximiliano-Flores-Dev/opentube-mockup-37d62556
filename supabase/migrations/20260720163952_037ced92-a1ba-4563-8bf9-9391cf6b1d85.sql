REVOKE EXECUTE ON FUNCTION public.delete_expired_signals() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_crypto_identities_updated_at() FROM anon, authenticated, service_role;
