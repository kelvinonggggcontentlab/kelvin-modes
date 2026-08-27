REVOKE ALL ON FUNCTION public.claim_admin() FROM anon;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', r.sig);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;