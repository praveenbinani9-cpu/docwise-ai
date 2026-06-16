ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS monthly_limit integer NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS public.tenant_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usage_month text NOT NULL,
  extraction_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usage_month)
);

GRANT SELECT ON public.tenant_usage TO authenticated;
GRANT ALL ON public.tenant_usage TO service_role;

ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages tenant_usage"
  ON public.tenant_usage FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.increment_usage(
  p_tenant_id uuid,
  p_month text,
  p_count integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_usage (tenant_id, usage_month, extraction_count)
  VALUES (p_tenant_id, p_month, p_count)
  ON CONFLICT (tenant_id, usage_month)
  DO UPDATE SET
    extraction_count = public.tenant_usage.extraction_count + EXCLUDED.extraction_count,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO service_role;