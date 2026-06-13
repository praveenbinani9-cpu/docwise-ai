import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileText, Sparkles } from "lucide-react";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/extract")({
  head: () => ({
    meta: [{ title: "Extraction result — DocExtract AI" }],
  }),
  component: ExtractPage,
});

type Stored = {
  json: string;
  previewUrl: string;
  isPdf: boolean;
  fileName: string;
  pageImages: string[];
};

function ExtractPage() {
  const [data, setData] = useState<Stored | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("docextract:result");
    if (raw) setData(JSON.parse(raw));
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <SiteNav />
        <main className="mx-auto max-w-2xl px-6 py-32 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
            <FileText className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">No extraction in this session</h1>
          <p className="mt-2 text-muted-foreground">Upload a document to see structured data here.</p>
          <Link
            to="/upload"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow"
          >
            Upload a document
          </Link>
        </main>
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(data.json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([data.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.fileName.replace(/\.[^.]+$/, "") + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse JSON for the field summary chips
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(data.json); } catch { /* */ }
  const fields = Array.isArray((parsed as { fields?: unknown }).fields)
    ? ((parsed as { fields: Array<{ key: string; value: string; confidence: number }> }).fields)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/upload" className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface hover:bg-accent">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> Extracted by DocExtract AI
              </div>
              <h1 className="text-lg font-semibold tracking-tight">{data.fileName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              onClick={download}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow"
            >
              <Download className="h-4 w-4" /> Download
            </button>
          </div>
        </div>

        {fields.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4"
          >
            {fields.slice(0, 4).map((f) => (
              <div key={f.key} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.key}</div>
                <div className="mt-1 truncate font-mono text-sm">{String(f.value)}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-gradient-primary"
                      style={{ width: `${Math.round((f.confidence ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.round((f.confidence ?? 0) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Document preview */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass overflow-hidden rounded-2xl shadow-elevated"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Source
              </span>
              <span className="font-mono text-muted-foreground">{data.pageImages.length} page{data.pageImages.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="max-h-[70vh] overflow-auto bg-surface-elevated p-3">
              <div className="space-y-3">
                {data.pageImages.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Page ${i + 1}`}
                    className="w-full rounded-lg border border-border shadow-card"
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* JSON output */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="overflow-hidden rounded-2xl border border-border shadow-elevated"
          >
            <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 text-xs">
              <span className="font-mono text-muted-foreground">extraction.json</span>
              <span className="inline-flex items-center gap-1.5 text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> ready
              </span>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-[oklch(0.16_0.02_270)] p-5 font-mono text-[12.5px] leading-relaxed text-[oklch(0.92_0.02_280)]">
{data.json}
            </pre>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
