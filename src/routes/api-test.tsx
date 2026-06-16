import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/api-test")({
  head: () => ({
    meta: [{ title: "API Test — DocExtract AI" }],
  }),
  component: ApiTestPage,
});

function ApiTestPage() {
  const [apiKey, setApiKey] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(typeof reader.result === "string" ? reader.result : "");
    };
    reader.onerror = () => setResponse("Failed to read file");
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResponse("");
    try {
      const res = await fetch("https://docwise-ai-eight.vercel.app/api/v1/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ images: [imageUrl] }),
      });
      const text = await res.text();
      try {
        setResponse(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        setResponse(text);
      }
    } catch (err) {
      setResponse(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">API Test</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="your_api_key"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... or data:image/png;base64,..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Or upload image file</label>
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The file is converted to a base64 data URL in your browser before being sent.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit"}
          </button>
        </form>


        {response && (
          <pre className="mt-6 overflow-auto rounded-lg border border-border bg-surface p-4 font-mono text-xs">
            {response}
          </pre>
        )}
      </div>
    </div>
  );
}
