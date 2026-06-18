
-- Tenants: revoke client access, add restrictive deny-all policy for documentation
REVOKE ALL ON public.tenants FROM anon, authenticated;
GRANT ALL ON public.tenants TO service_role;
DROP POLICY IF EXISTS "deny all client access to tenants" ON public.tenants;
CREATE POLICY "deny all client access to tenants"
  ON public.tenants AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Extractions: revoke client access, add restrictive deny-all policy
REVOKE ALL ON public.extractions FROM anon, authenticated;
GRANT ALL ON public.extractions TO service_role;
DROP POLICY IF EXISTS "deny all client access to extractions" ON public.extractions;
CREATE POLICY "deny all client access to extractions"
  ON public.extractions AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

-- tenant_usage: revoke client access (service role already has policy)
REVOKE ALL ON public.tenant_usage FROM anon, authenticated;
GRANT ALL ON public.tenant_usage TO service_role;
DROP POLICY IF EXISTS "deny all client access to tenant_usage" ON public.tenant_usage;
CREATE POLICY "deny all client access to tenant_usage"
  ON public.tenant_usage AS RESTRICTIVE FOR ALL
  TO anon, authenticated
  USING (false) WITH CHECK (false);

-- Lock down SECURITY DEFINER function: only callable by service role
REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO service_role;
