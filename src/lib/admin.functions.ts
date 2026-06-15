import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function genApiKey(): string {
  // 32 random bytes hex, prefixed
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dx_live_${hex}`;
}

export const listTenants = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select("id, name, api_key, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  // usage per tenant
  const { data: usage } = await supabaseAdmin
    .from("extractions")
    .select("tenant_id");
  const counts = new Map<string, number>();
  for (const row of usage ?? []) {
    counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
  }
  return (tenants ?? []).map((t) => ({ ...t, usage: counts.get(t.id) ?? 0 }));
});

export const createTenant = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .insert({ name: data.name, api_key: genApiKey(), status: "active" })
      .select("id, name, api_key, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .update({ api_key: genApiKey() })
      .eq("id", data.id)
      .select("id, api_key")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setTenantStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRecentExtractions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("extractions")
    .select("id, tenant_id, document_type, overall_confidence, page_count, created_at, tenants(name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});
