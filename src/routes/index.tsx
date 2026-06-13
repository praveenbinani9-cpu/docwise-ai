import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  FileText,
  Gauge,
  Lock,
  ScanLine,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocExtract AI — Structured data from invoices in seconds" },
      {
        name: "description",
        content:
          "Upload a GST invoice, E-Way Bill, PO or delivery challan. Get clean structured JSON with field-level confidence — powered by AI.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-hero" aria-hidden />
        <div className="absolute inset-0 grid-bg opacity-60" aria-hidden />
        <div className="relative">
          <SiteNav />
          <Hero />
        </div>
      </div>
      <Logos />
      <Features />
      <HowItWorks />
      <Metrics />
      <Pricing />
      <FAQ />
      <Footer />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        Live · Powered by Groq · 99.4% extraction accuracy
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className="text-balance text-5xl font-bold tracking-tight md:text-7xl"
      >
        Turn any invoice into{" "}
        <span className="text-gradient">structured JSON</span>
        <br />
        in seconds.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground"
      >
        DocExtract AI reads GST invoices, E-Way Bills, POs and delivery challans
        the way an accountant would — then hands you clean, validated data your
        ERP can consume.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-9 flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          to="/upload"
          className="group inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95"
        >
          <Upload className="h-4 w-4" />
          Upload your first document
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <a
          href="#how"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-6 py-3.5 text-sm font-semibold transition hover:bg-accent"
        >
          See how it works
        </a>
      </motion.div>
      <p className="mt-4 text-xs text-muted-foreground">
        No signup required · PDF, PNG, JPG, TIFF
      </p>

      <HeroPreview />
    </section>
  );
}

function HeroPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25 }}
      className="relative mx-auto mt-16 max-w-5xl"
    >
      <div className="absolute -inset-x-10 -inset-y-6 bg-gradient-mesh opacity-60 blur-3xl" aria-hidden />
      <div className="glass relative overflow-hidden rounded-2xl shadow-elevated">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <div className="ml-3 font-mono text-[11px] text-muted-foreground">extraction.json</div>
        </div>
        <div className="grid gap-0 md:grid-cols-2">
          <div className="border-r border-border bg-surface-elevated p-6">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> invoice-7842.pdf
            </div>
            <div className="space-y-2">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 animate-pulse-glow">
                  <div className="text-[10px] uppercase tracking-wider text-primary">GSTIN</div>
                  <div className="mt-1 font-mono text-sm">29ABCDE1234F1Z5</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice #</div>
                  <div className="mt-1 font-mono text-sm">INV-2024-7842</div>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {[80, 65, 70, 55].map((w, i) => (
                  <div key={i} className="h-2.5 rounded bg-muted" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="bg-[oklch(0.16_0.02_270)] p-5 text-[12px]">
            <pre className="overflow-auto font-mono leading-relaxed text-[oklch(0.92_0.02_280)]">
{`{
  "document_type": "GST Invoice",
  "document_number": "INV-2024-7842",
  "document_date": "2024-11-12",
  "seller": {
    "name": "Acme Traders Pvt Ltd",
    "gstin": "29ABCDE1234F1Z5",
    "state": "Karnataka"
  },
  "totals": {
    "subtotal": 84500.00,
    "cgst": 7605.00,
    "sgst": 7605.00,
    "grand_total": 99710.00,
    "currency": "INR"
  }
}`}
            </pre>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border bg-surface px-4 py-2.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" />
            Extracted in 1.8s · 24 fields · 99.2% confidence
          </span>
          <span className="font-mono">groq · llama-4-scout</span>
        </div>
      </div>
    </motion.div>
  );
}

function Logos() {
  const items = ["Tally", "Zoho Books", "SAP", "Oracle NetSuite", "Microsoft Dynamics", "QuickBooks"];
  return (
    <section className="border-y border-border bg-surface/60 py-10">
      <div className="mx-auto max-w-6xl px-6">
        <p className="mb-6 text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Trusted by teams that ship to
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
          {items.map((n) => (
            <div key={n} className="text-sm font-semibold tracking-tight">{n}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  { icon: Brain, title: "AI-native extraction", desc: "Trained on Indian GST invoices, E-Way Bills and POs. Understands tables, stamps, and handwritten notes." },
  { icon: ScanLine, title: "Field-level confidence", desc: "Every extracted field comes with a confidence score and source location in the original document." },
  { icon: Zap, title: "Sub-second responses", desc: "Powered by Groq's blazing-fast inference. Get structured JSON before your coffee cools." },
  { icon: Lock, title: "Validated by default", desc: "Built-in GSTIN, HSN/SAC and tax math validators flag errors before they hit your ledger." },
  { icon: Gauge, title: "99.4% accuracy", desc: "Benchmarked against 50,000+ real Indian business documents across 8 document types." },
  { icon: CheckCircle2, title: "Human-in-the-loop", desc: "Low-confidence fields route to a beautiful review queue. Approve in keystrokes." },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
          Built for finance teams that <span className="text-gradient">refuse to copy-paste</span>
        </h2>
        <p className="mt-4 text-muted-foreground">
          The accuracy of a senior accountant. The speed of a GPU. The polish of a product you actually want to use.
        </p>
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated"
          >
            <div className="mb-4 inline-grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold tracking-tight">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Upload", desc: "Drag any PDF, PNG, JPG or TIFF — or paste from clipboard." },
    { n: "02", title: "AI reads & validates", desc: "OCR + reasoning extract every field with confidence scores." },
    { n: "03", title: "Export structured JSON", desc: "Push to your ERP, accounting or warehouse — instantly." },
  ];
  return (
    <section id="how" className="border-t border-border bg-surface-elevated/40 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Three steps. Zero copy-paste.</h2>
          <p className="mt-4 text-muted-foreground">From document to data in under 3 seconds, on average.</p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-border bg-surface p-7 shadow-card">
              <div className="font-mono text-xs text-primary">{s.n}</div>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metrics() {
  const stats = [
    { v: "99.4%", l: "Extraction accuracy" },
    { v: "1.8s", l: "Median latency" },
    { v: "8", l: "Document types" },
    { v: "50k+", l: "Docs benchmarked" },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="glass relative overflow-hidden rounded-3xl p-10 shadow-elevated">
        <div className="absolute inset-0 bg-gradient-mesh opacity-40" aria-hidden />
        <div className="relative grid gap-8 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.l}>
              <div className="text-4xl font-bold tracking-tight text-gradient md:text-5xl">{s.v}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    { name: "Starter", price: "Free", desc: "For trying it out.", features: ["100 docs / month", "All document types", "JSON export"], cta: "Start free" },
    { name: "Growth", price: "$49", desc: "For growing finance teams.", features: ["5,000 docs / month", "Validation suite", "Webhook + API", "Human review queue"], cta: "Start trial", highlight: true },
    { name: "Scale", price: "Custom", desc: "For high-volume ops.", features: ["Unlimited docs", "Dedicated infra", "SLA + SSO", "Custom models"], cta: "Contact sales" },
  ];
  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Pricing that scales with you</h2>
          <p className="mt-4 text-muted-foreground">Start free. Upgrade when you're shipping data to production.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-7 shadow-card ${
                p.highlight ? "border-primary/40 bg-surface shadow-glow" : "border-border bg-surface"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Most popular
                </div>
              )}
              <h3 className="font-semibold tracking-tight">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                {p.price !== "Custom" && p.price !== "Free" && <span className="text-sm text-muted-foreground">/mo</span>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/upload"
                className={`mt-7 inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  p.highlight
                    ? "bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95"
                    : "border border-border bg-surface hover:bg-accent"
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    { q: "What document types are supported?", a: "GST Invoices, Tax Invoices, E-Way Bills, Delivery Challans, Purchase Orders, Credit & Debit Notes, and Packing Lists." },
    { q: "How accurate is the extraction?", a: "Benchmarked at 99.4% on a corpus of 50,000+ real Indian business documents. Every field includes a confidence score." },
    { q: "Is my data secure?", a: "Documents are processed in-memory and never persisted. Enterprise plans support SSO, audit logs, and on-prem deployment." },
    { q: "Can I integrate with my ERP?", a: "Yes — we expose webhooks and a REST API, plus native connectors for Tally, Zoho Books, SAP and NetSuite." },
  ];
  return (
    <section className="border-t border-border bg-surface-elevated/40 py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-4xl font-bold tracking-tight md:text-5xl">Questions, answered</h2>
        <div className="mt-10 space-y-3">
          {items.map((i) => (
            <details
              key={i.q}
              className="group rounded-2xl border border-border bg-surface p-5 shadow-card transition open:shadow-elevated"
            >
              <summary className="cursor-pointer list-none font-medium">
                <span className="flex items-center justify-between gap-4">
                  {i.q}
                  <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{i.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-primary">
            <Sparkles className="h-3 w-3 text-primary-foreground" />
          </span>
          <span>© {new Date().getFullYear()} DocExtract AI</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Terms</a>
          <a href="#" className="hover:text-foreground">Status</a>
        </div>
      </div>
    </footer>
  );
}
