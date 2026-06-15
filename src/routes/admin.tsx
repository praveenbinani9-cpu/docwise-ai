import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  listTenants,
  createTenant,
  rotateApiKey,
  setTenantStatus,
  listRecentExtractions,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, KeyRound, Power, PowerOff, Plus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · DocExtract AI" }] }),
  component: AdminPage,
});

function AdminPage() {
  const router = useRouter();
  const listT = useServerFn(listTenants);
  const listE = useServerFn(listRecentExtractions);
  const create = useServerFn(createTenant);
  const rotate = useServerFn(rotateApiKey);
  const setStatus = useServerFn(setTenantStatus);

  const tenantsQ = useQuery({ queryKey: ["admin", "tenants"], queryFn: () => listT() });
  const extractionsQ = useQuery({ queryKey: ["admin", "extractions"], queryFn: () => listE() });

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const row = await create({ data: { name: name.trim() } });
      toast.success(`Tenant created. API key: ${row.api_key}`);
      setName("");
      router.invalidate();
      tenantsQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRotate(id: string) {
    const row = await rotate({ data: { id } });
    await navigator.clipboard.writeText(row.api_key).catch(() => {});
    toast.success("New key generated and copied");
    tenantsQ.refetch();
  }

  async function onToggle(id: string, status: "active" | "disabled") {
    await setStatus({ data: { id, status: status === "active" ? "disabled" : "active" } });
    toast.success(status === "active" ? "Tenant disabled" : "Tenant enabled");
    tenantsQ.refetch();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Admin Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenants, API keys, and monitor extraction usage.
          </p>
        </header>

        <section className="rounded-xl border bg-card p-6 mb-10">
          <h2 className="text-lg font-medium mb-4">Create tenant</h2>
          <div className="flex gap-3">
            <Input
              placeholder="Tenant name (e.g. Acme Corp)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md"
            />
            <Button onClick={onCreate} disabled={busy || !name.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              Create & generate key
            </Button>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-6 mb-10">
          <h2 className="text-lg font-medium mb-4">Tenants</h2>
          {tenantsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tenantsQ.data && tenantsQ.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>API key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantsQ.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {t.api_key.slice(0, 14)}…{t.api_key.slice(-6)}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(t.api_key);
                            toast.success("Copied");
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "default" : "secondary"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.usage}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => onRotate(t.id)}>
                          <KeyRound className="w-3.5 h-3.5 mr-1" /> Rotate
                        </Button>
                        <Button
                          size="sm"
                          variant={t.status === "active" ? "destructive" : "default"}
                          onClick={() => onToggle(t.id, t.status as "active" | "disabled")}
                        >
                          {t.status === "active" ? (
                            <>
                              <PowerOff className="w-3.5 h-3.5 mr-1" /> Disable
                            </>
                          ) : (
                            <>
                              <Power className="w-3.5 h-3.5 mr-1" /> Enable
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          )}
        </section>

        <section className="rounded-xl border bg-card p-6">
          <h2 className="text-lg font-medium mb-4">Recent extractions</h2>
          {extractionsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : extractionsQ.data && extractionsQ.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extractionsQ.data.map((e: Record<string, unknown>) => {
                  const tenants = e.tenants as { name?: string } | null;
                  const conf = e.overall_confidence as number | null;
                  return (
                    <TableRow key={e.id as string}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.created_at as string).toLocaleString()}
                      </TableCell>
                      <TableCell>{tenants?.name ?? "—"}</TableCell>
                      <TableCell>{(e.document_type as string) ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(e.page_count as number) ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conf != null ? `${Math.round(conf * 100)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No extractions yet.</p>
          )}
        </section>

        <section className="mt-10 rounded-xl border bg-muted/30 p-6">
          <h3 className="text-sm font-medium mb-2">API usage</h3>
          <pre className="text-xs overflow-x-auto bg-background border rounded p-3">{`POST /api/v1/extract
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "images": ["data:image/png;base64,..."],
  "hint": "optional"
}`}</pre>
        </section>
      </div>
    </div>
  );
}
