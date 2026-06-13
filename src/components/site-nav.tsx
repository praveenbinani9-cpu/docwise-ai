import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="glass mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-2xl px-5 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </span>
          <span>DocExtract <span className="text-gradient">AI</span></span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="/#features" className="transition hover:text-foreground">Features</a>
          <a href="/#how" className="transition hover:text-foreground">How it works</a>
          <a href="/#pricing" className="transition hover:text-foreground">Pricing</a>
        </nav>
        <Link
          to="/upload"
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95"
        >
          Try it free
        </Link>
      </div>
    </header>
  );
}
