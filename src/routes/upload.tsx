import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  FileText,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload as UploadIcon,
  X,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { extractDocument } from "@/lib/extract.functions";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload a document — DocExtract AI" },
      { name: "description", content: "Drop a PDF or image and get structured JSON in seconds." },
    ],
  }),
  component: UploadPage,
});

type Stage = { key: string; label: string; icon: typeof Brain };
const STAGES: Stage[] = [
  { key: "scan", label: "Scanning document", icon: ScanLine },
  { key: "read", label: "Reading fields", icon: FileText },
  { key: "validate", label: "Validating GSTIN & tax math", icon: ShieldCheck },
  { key: "extract", label: "Extracting structured data", icon: Brain },
  { key: "output", label: "Generating JSON output", icon: Sparkles },
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function pdfToImages(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  // Use a CDN worker to avoid bundling issues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pdfjs as any).GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: string[] = [];
  const pages = pdf.numPages;
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    out.push(canvas.toDataURL("image/png"));
  }
  return out;
}

function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    async (f: File) => {
      setError(null);
      setFile(f);
      setStage(0);
      try {
        // visual pacing
        const tick = (i: number) => new Promise<void>((r) => setTimeout(() => { setStage(i); r(); }, 350));
        await tick(0);

        let images: string[];
        const previewUrl = await fileToDataUrl(f);
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          images = await pdfToImages(f);
        } else {
          images = [previewUrl];
        }
        await tick(1);
        await tick(2);
        await tick(3);

        const result = await extractDocument({ data: { images } });
        await tick(4);

        sessionStorage.setItem(
          "docextract:result",
          JSON.stringify({
            json: result.json,
            previewUrl,
            isPdf: f.type === "application/pdf",
            fileName: f.name,
            pageImages: images,
          }),
        );
        navigate({ to: "/extract" });
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Something went wrong");
        setStage(-1);
      }
    },
    [navigate],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const reset = () => { setFile(null); setStage(-1); setError(null); };

  const processing = stage >= 0 && !error;

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-hero" aria-hidden />
      <div className="absolute inset-0 -z-10 grid-bg opacity-40" aria-hidden />
      <SiteNav />

      <main className="mx-auto max-w-4xl px-6 pt-16 pb-24">
        <div className="mb-10 text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Drop a document. <span className="text-gradient">Watch AI read it.</span>
          </h1>
          <p className="mt-3 text-muted-foreground">
            PDF, PNG, JPG or TIFF · Up to 10 MB · Processed in seconds
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!processing && !error && (
            <motion.div
              key="drop"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed p-16 text-center shadow-card transition ${
                dragging
                  ? "border-primary bg-primary/5 shadow-glow"
                  : "border-border bg-surface hover:border-primary/40 hover:bg-surface-elevated"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/tiff"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary shadow-glow transition group-hover:scale-105">
                <UploadIcon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Drop your document here
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                or click to browse · No signup required
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                {["GST Invoice", "E-Way Bill", "Purchase Order", "Delivery Challan", "Credit Note"].map((t) => (
                  <span key={t} className="rounded-full border border-border bg-surface px-3 py-1">{t}</span>
                ))}
              </div>
            </motion.div>
          )}

          {processing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass overflow-hidden rounded-3xl p-10 shadow-elevated"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
                    <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{file?.name}</div>
                    <div className="text-xs text-muted-foreground">AI is reading your document</div>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">groq · llama-4-scout</span>
              </div>

              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-primary"
                  animate={{ width: `${((stage + 1) / STAGES.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
                <div className="absolute inset-0 animate-shimmer" />
              </div>

              <ul className="mt-8 space-y-3">
                {STAGES.map((s, i) => {
                  const done = i < stage;
                  const active = i === stage;
                  const Icon = s.icon;
                  return (
                    <li
                      key={s.key}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                        active
                          ? "border-primary/40 bg-primary/5 shadow-glow"
                          : done
                            ? "border-success/30 bg-success/5"
                            : "border-border bg-surface"
                      }`}
                    >
                      <div className={`grid h-8 w-8 place-items-center rounded-lg ${
                        done ? "bg-success text-success-foreground" : active ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={`text-sm ${active ? "font-medium" : ""}`}>{s.label}</span>
                      {active && (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-primary">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> in progress
                        </span>
                      )}
                      {done && <span className="ml-auto text-xs text-success">done</span>}
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}

          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8 text-center"
            >
              <X className="mx-auto h-8 w-8 text-destructive" />
              <h3 className="mt-3 text-lg font-semibold">Extraction failed</h3>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button
                onClick={reset}
                className="mt-5 inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Try another document
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
