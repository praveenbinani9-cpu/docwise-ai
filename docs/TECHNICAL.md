# DocExtract AI — Technical Documentation

## 1. Stack Overview

| Layer | Technology |
|---|---|
| Frontend framework | **TanStack Start v1** (React 19 + Vite 7, SSR) |
| Routing | File-based routes under `src/routes/` |
| Styling | Tailwind CSS v4 (via `src/styles.css`) + shadcn/ui |
| Animations | Framer Motion |
| Server logic | TanStack `createServerFn` + server routes under `src/routes/api/` |
| Database / Auth / Storage | Lovable Cloud (managed Postgres + RLS) |
| LLM providers | **Groq** (`meta-llama/llama-4-scout-17b-16e-instruct`) primary; Gemini fallback |
| PDF rendering (client) | `pdfjs-dist` |
| Deployment target | Cloudflare Workers (edge) via TanStack Start adapter |

---

## 2. Repository Layout (relevant parts)

```
src/
├── routes/
│   ├── __root.tsx              # SSR shell, providers, head metadata
│   ├── index.tsx               # Landing page
│   ├── upload.tsx              # Drag-and-drop UI + client-side PDF→images
│   ├── extract.tsx             # Result viewer (document preview + JSON)
│   ├── admin.tsx               # Tenant + usage management
│   ├── api-test.tsx            # API sandbox
│   └── api/v1/extract.ts       # POST /api/v1/extract  (public HTTP endpoint)
├── lib/
│   ├── extract-core.server.ts  # Core extraction engine (LLM calls, validation, reconciliation)
│   └── extract.functions.ts    # createServerFn wrapper used by the web app
├── integrations/supabase/      # Auto-generated Cloud clients (do not edit)
└── components/                 # UI primitives (shadcn) + site-nav
supabase/migrations/            # SQL migrations (tenants, extractions, RLS, RPCs)
```

---

## 3. Data Model

### `tenants`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `api_key` | text unique | Bearer token |
| `status` | text | `active` \| `disabled` |
| `monthly_limit` | int | 0 = unlimited |
| `created_at` | timestamptz | |

### `tenant_usage`
| Column | Type |
|---|---|
| `tenant_id` | uuid → tenants.id |
| `usage_month` | text (`YYYY-MM`) |
| `extraction_count` | int |

Unique on (`tenant_id`, `usage_month`). Mutated only via the SECURITY DEFINER RPC `increment_usage(p_tenant_id, p_month, p_count)`.

### `extractions`
| Column | Type |
|---|---|
| `id` | uuid PK |
| `tenant_id` | uuid → tenants.id |
| `document_type` | text |
| `overall_confidence` | numeric |
| `page_count` | int |
| `result` | jsonb |
| `created_at` | timestamptz |

### `user_roles` + `has_role()`
Standard Lovable role pattern. `admin` role gates `/admin` and admin-only server functions. Roles are stored in `user_roles` (NOT on the profile) and checked through a SECURITY DEFINER `has_role(uid, role)` function used inside RLS policies.

All `public` tables have explicit `GRANT`s (`authenticated` + `service_role`) and RLS policies. `tenants` and `extractions` are admin-readable; the `/api/v1/extract` route uses the admin client to bypass RLS (the route itself enforces auth via the Bearer key lookup).

---

## 4. Extraction Pipeline (deep dive on `src/lib/extract-core.server.ts`)

### 4.1 Entry point — `extractCore(images: string[], hint?: string)`

```
images (data URIs)
   │
   ├── single image  ─► callGroqVision()  ─► parse JSON  ─► postProcess()
   │
   └── multiple imgs ─► sequential loop (NOT Promise.all — TPM-bound)
                       ├── callGroqVision(img[i])
                       ├── parse
                       └── push to documents[]
                       ↓
                  { documents: [...] }
```

### 4.2 LLM call — `callGroqVision`

- Endpoint: Groq OpenAI-compatible chat completions
- Model: `meta-llama/llama-4-scout-17b-16e-instruct`
- Determinism config: `temperature: 0`, `top_p: 1`, `seed: 7`, `response_format: { type: "json_object" }`
- **Retry policy**: up to 4 attempts on HTTP 429
  - Reads `retry-after` header; falls back to parsing `"try again in Ns"` from the body
  - Capped at 30s wait
  - Exponential fallback (2s, 4s, 8s, 16s) when no hint is given
  - Non-429 errors fail fast

### 4.3 System prompt — "literal reading" doctrine

The prompt instructs the model to:
1. Extract only what is **visibly printed** — never infer, never compute
2. Treat every page as an **independent document context** (kills cross-page bleed)
3. For multi-column textile invoices: **Amount column is source of truth**, all other columns (pieces / meters / rate) are descriptive
4. Preserve row order exactly
5. Never confuse invoice number with a date
6. Output strict JSON matching the agreed schema (with `per_field_confidence`)

### 4.4 Post-processing — `postProcess(parsed, verify?)`

Chained validators run on each document object:

| Stage | Function | What it does |
|---|---|---|
| 1 | `verifyCriticalFields` | Best-effort 2nd LLM call extracting just `invoice_number`, `invoice_date`, `seller_gstin`, `buyer_gstin`, `grand_total`. Skipped in multi-image mode to save tokens. |
| 2 | `reconcileCriticalFields` | If runs disagree on a field, keep the higher-confidence value and cap its confidence at 0.7. |
| 3 | `reconcileInvoiceNumberDate` | If the extracted `invoice_number` matches a date regex, null it out. |
| 4 | `annotateGstinQuality` | Adds `seller.gstin_quality` / `buyer.gstin_quality` (`raw_value`, `normalized_value`, `is_valid`) using the official 15-char GSTIN regex. Doesn't mutate the raw value. |
| 5 | `applyGstinValidation` | Sets `eway_bill_required` (grand_total > 50k), `line_items_amount_verified`, `bank_details_present`, `transport_details_present`, and pushes human-readable strings into `warnings[]` (state-code mismatch, tax-sum mismatch, etc.). |
| 6 | `computeOverallConfidence` | `overall_confidence = mean(per_field_confidence.*)` for DB backward compatibility. |

### 4.5 Output shape

```jsonc
{
  "documents": [
    {
      "document_type": "gst_invoice",
      "invoice_number": "INV/2024/00123",
      "invoice_date": "2024-04-15",
      "seller": {
        "name": "…", "gstin": "27AAACI1681G1ZN",
        "gstin_quality": { "raw_value": "…", "normalized_value": "…", "is_valid": true }
      },
      "buyer":  { "…": "…" },
      "line_items": [ { "description": "…", "amount": 12345.00, "…": "…" } ],
      "taxes": { "cgst": 0, "sgst": 0, "igst": 2222.10, "total_tax": 2222.10 },
      "grand_total": 14567.10,
      "per_field_confidence": { "invoice_number": 0.98, "grand_total": 0.96, "…": "…" },
      "overall_confidence": 0.94,
      "warnings": [],
      "eway_bill_required": false,
      "bank_details_present": true
    }
  ]
}
```

---

## 5. HTTP API — `POST /api/v1/extract`

Defined in `src/routes/api/v1/extract.ts` as a TanStack server route.

### Request

**Headers**
```
Authorization: Bearer <tenant.api_key>
Content-Type:  application/json  |  multipart/form-data
```

**JSON body**
```json
{ "images": ["<base64 or data URI>", "…"], "hint": "optional context" }
```

**Multipart body** — field name `images` (repeatable) or `image` (single). Up to 8 files, ≤4 MB each. Accepts `image/jpeg|png|webp|gif` and `application/pdf`.

The handler auto-detects MIME from the first base64 magic bytes when callers send raw base64.

### Pipeline

1. Extract Bearer token → 401 if missing
2. Look up tenant by `api_key` → 401 invalid / 403 disabled
3. Read current month's `tenant_usage` → 429 if `extraction_count >= monthly_limit`
4. Call `extractCore(images, hint)`
5. Insert into `extractions` table (admin client)
6. Call `increment_usage` RPC
7. Return:
```json
{
  "ok": true,
  "extraction_id": "uuid",
  "created_at": "…",
  "document_type": "gst_invoice",
  "overall_confidence": 0.94,
  "data": { /* full parsed object */ }
}
```

### Status codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 400 | Invalid body / file type / too many files |
| 401 | Missing or invalid Bearer key |
| 403 | Tenant disabled |
| 415 | Unsupported `Content-Type` |
| 429 | Monthly limit exceeded |
| 502 | Upstream LLM failure |

CORS is open (`access-control-allow-origin: *`) for browser-side integration.

---

## 6. Web Upload Flow (`/upload`)

1. User drops a file (PDF or image) onto the dropzone
2. If PDF → client renders each page via `pdfjs-dist` at scale ≤1.5 (max 1200px wide), encodes JPEG @0.85 quality. Keeps payload small.
3. If image → single data URL
4. Calls `extractDocument` (a `createServerFn` wrapping `extractCore`)
5. Stores `{ json, previewUrl, pageImages, fileName }` in `sessionStorage`
6. Navigates to `/extract` which reads from session storage and renders the viewer

Visual pipeline stages (`Scan → Read → Validate → Extract → JSON`) are decorative, paced with `setTimeout` for UX clarity — the actual extraction runs in parallel.

---

## 7. Security Posture

- **Roles in `user_roles` table** (never on profile) — prevents privilege escalation
- **`has_role()` SECURITY DEFINER** used inside RLS — avoids recursive RLS pitfalls
- **All public tables have GRANTs + RLS** — no anon access to tenants/extractions
- **API auth** is opaque Bearer token tied to a single tenant row
- **Admin client** (`supabaseAdmin`) is lazy-imported only inside server-route handlers, never top-level in shared modules (prevents leaking the service role into the client bundle)
- **`requireSupabaseAuth` middleware** + `attachSupabaseAuth` registered in `src/start.ts` for protected server functions
- **CORS open** on `/api/v1/extract` is intentional (machine-to-machine)
- **No secrets in client bundle** — Groq API key only read inside `.handler()` via `process.env`

---

## 8. Environment Variables (server-only)

| Var | Purpose |
|---|---|
| `GROQ_API_KEY` | Primary LLM provider |
| `GEMINI_API_KEY` | Fallback / cross-check provider |
| Lovable Cloud vars | Auto-injected (`SUPABASE_URL`, publishable + secret keys) |

All are read **inside** server-function handlers, never at module scope.

---

## 9. Performance & Cost Notes

- Multi-image extraction is **sequential**, not parallel — Groq's TPM (tokens-per-minute) limit on Llama-4-Scout is 30 000; parallel calls trip 429 immediately on 3+ page invoices.
- PDF pages are downscaled client-side (1200px wide cap, JPEG 0.85) — typically 60–80 KB per page vs. 500 KB+ for full-res PNG.
- `verifyCriticalFields` (2nd LLM pass) is skipped for multi-image jobs to halve token spend.
- Retry budget per call: 4 attempts, max ~30s backoff each → worst-case ~2 min per page before failing 502.

---

## 10. Extending the System

| Add a new document type | Update the system prompt in `extract-core.server.ts` + extend the Zod schema + add a `document_type` enum value in the prompt's allowed list |
| Add a new validator | Write a function `validateX(doc): doc`, chain it inside `postProcess` |
| Add a new LLM provider | Mirror `callGroqVision` (signature, retries, JSON-mode) and switch via env flag |
| Add a webhook endpoint | Create `src/routes/api/public/<name>.ts` (the `/api/public/*` prefix bypasses auth on published sites; verify signatures inside the handler) |
| Add a new admin metric | Add a `createServerFn` in `src/lib/admin.functions.ts`, gate with `requireSupabaseAuth` + `has_role(uid, 'admin')`, render in `routes/admin.tsx` |

---

## 11. Known Limitations

- Groq Llama-4-Scout free tier: 30 000 TPM — heavy PDF (8 pages × ~3 KB tokens) may queue
- `pdfjs-dist` runs in browser only — cannot extract from PDF server-side; the client must rasterize first
- Schema is tuned for Indian tax documents; non-GST documents (e.g. foreign invoices) will still extract but `warnings` will flag missing GST fields
- No streaming response — clients wait for the full extraction before getting any JSON
