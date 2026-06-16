import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  images: z.array(z.string().min(20)).min(1).max(8),
  hint: z.string().max(500).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

function currentMonth(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const Route = createFileRoute("/api/v1/extract")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const apiKey = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!apiKey) return json({ error: "Missing Bearer api_key" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          return json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tenant, error: tenantErr } = await supabaseAdmin
          .from("tenants")
          .select("id, status, monthly_limit")
          .eq("api_key", apiKey)
          .maybeSingle();

        if (tenantErr) return json({ error: "Lookup failed" }, 500);
        if (!tenant) return json({ error: "Invalid api_key" }, 401);
        if (tenant.status !== "active") return json({ error: "Tenant is disabled" }, 403);

        const month = currentMonth();
        const limit = (tenant as { monthly_limit: number | null }).monthly_limit ?? 0;

        const { data: usage, error: usageErr } = await supabaseAdmin
          .from("tenant_usage")
          .select("extraction_count")
          .eq("tenant_id", tenant.id)
          .eq("usage_month", month)
          .maybeSingle();

        if (usageErr) return json({ error: "Usage lookup failed" }, 500);

        const used = usage?.extraction_count ?? 0;
        if (limit > 0 && used >= limit) {
          return json({ error: "Monthly limit exceeded" }, 429);
        }

        const { extractCore } = await import("@/lib/extract-core.server");
        let result;
        try {
          result = await extractCore(parsed.data.images, parsed.data.hint);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Extraction failed" }, 502);
        }

        const parsedJson = result.parsed as Record<string, unknown> | null;
        const document_type =
          parsedJson && typeof parsedJson["document_type"] === "string"
            ? (parsedJson["document_type"] as string)
            : null;
        const overall_confidence =
          parsedJson && typeof parsedJson["overall_confidence"] === "number"
            ? (parsedJson["overall_confidence"] as number)
            : null;

        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("extractions")
          .insert({
            tenant_id: tenant.id,
            document_type,
            overall_confidence,
            page_count: parsed.data.images.length,
            result: (parsedJson ?? {}) as never,
          })
          .select("id, created_at")
          .single();

        if (insertErr) {
          console.error("extractions insert failed", insertErr);
        } else {
          const { error: rpcErr } = await supabaseAdmin.rpc("increment_usage", {
            p_tenant_id: tenant.id,
            p_month: month,
            p_count: parsed.data.images.length,
          });
          if (rpcErr) {
            console.error("increment_usage failed", rpcErr);
          }
        }

        return json({
          ok: true,
          extraction_id: inserted?.id ?? null,
          created_at: inserted?.created_at ?? null,
          document_type,
          overall_confidence,
          data: parsedJson,
        });
      },
    },
  },
});
