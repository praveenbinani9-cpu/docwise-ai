# DocExtract AI — Product Documentation

## 1. What is DocExtract AI?

DocExtract AI is a **SaaS document intelligence platform** that turns Indian business documents (GST invoices, e-way bills, purchase orders, delivery challans, credit/debit notes) into clean, structured JSON in seconds.

Users (or their software) drop a PDF/image in, and get back a deterministic, validated, machine-readable representation of every field on the document — header info, parties, line items, taxes, totals, transport details, bank details, and per-field confidence scores.

It is designed for:
- **Finance & accounting teams** drowning in supplier invoices
- **ERP / accounting SaaS vendors** who want to add "upload invoice → auto-fill" to their product
- **Logistics & textile traders** dealing with multi-column, multi-page invoices
- **Developers** who need an HTTP API to extract structured data from Indian tax documents

---

## 2. Core Value Proposition

| Pain | DocExtract AI Solution |
|---|---|
| Manual data entry from PDFs/images | One drag-and-drop → JSON in under 10 seconds |
| Same document gives different results on re-runs | Deterministic extraction (temperature 0, fixed seed, double-pass verification) |
| GSTINs misread, invoice numbers confused with dates | Format validation + reconciliation logic + state-code cross-check |
| Multi-page PDFs lose pages 2+ | Per-page isolation — every page is extracted independently |
| Multi-column textile / trader invoices shift columns | Strict "Amount column is source of truth" rules |
| Integration with internal tools is painful | REST API with Bearer token, JSON or multipart upload |

---

## 3. Product Surfaces

### 3.1 Web App (no signup)
- **`/upload`** — Drag-and-drop UI with a live extraction pipeline animation (Scan → Read → Validate → Extract → JSON)
- **`/extract`** — Side-by-side document preview + structured JSON viewer with copy/download
- **`/api-test`** — Sandbox to test the API key and inspect raw responses
- **`/admin`** — Tenant management dashboard (create tenants, view usage, rotate API keys, set monthly limits)

### 3.2 Public REST API
- **`POST /api/v1/extract`** — accepts JSON `{ images: base64[] }` or multipart `images=@file.pdf`
- Bearer-token authenticated, per-tenant
- Monthly usage limits + automatic counting
- Multi-page PDF supported (up to 8 pages per request)

---

## 4. What Gets Extracted

Every extraction returns:

**Document-level**
- `document_type` (gst_invoice, eway_bill, purchase_order, delivery_challan, credit_note, debit_note)
- `invoice_number`, `invoice_date`, `due_date`
- `place_of_supply`, `reverse_charge`

**Parties**
- Seller & buyer: `name`, `address`, `gstin`, `state`, `state_code`, `pan`
- `gstin_quality`: raw value, normalized value, regex validity flag

**Line items** (array)
- `description`, `hsn_sac`, `quantity`, `unit`, `rate`, `amount`
- Textile-specific: `pieces`, `meters`, `bags` columns preserved

**Taxes & totals**
- `taxable_value`, `cgst`, `sgst`, `igst`, `cess`, `total_tax`, `grand_total`
- `amount_in_words`

**Operational details**
- `transport_details` (vehicle, transporter, LR no., e-way bill no.)
- `broker_agent_details`
- `bank_details` (account, IFSC, branch)
- `payment_terms`, `document_references`

**Quality signals**
- `per_field_confidence` (0–1 per field)
- `overall_confidence` (computed average)
- `warnings[]` (e.g., `"GSTIN state code mismatch"`, `"Line item amount inconsistency"`, `"E-way bill required for value > ₹50,000"`)

For multi-page PDFs, response contains `documents: []` — one entry per page, fully isolated.

---

## 5. Pricing / Plans (Tenant Model)

Each tenant has:
- An `api_key` (Bearer token)
- A `status` (`active` / `disabled`)
- A `monthly_limit` (extractions per calendar month, `0` = unlimited)
- `tenant_usage` rows per `YYYY-MM` month tracking `extraction_count`

When usage exceeds the limit, the API returns `429 Monthly limit exceeded`. Admins can raise limits or disable tenants from `/admin`.

---

## 6. Reliability & Trust Features

1. **Deterministic re-runs** — same PDF in = same JSON out (temperature 0, seed 7)
2. **Double-pass verification** of critical fields (invoice no., dates, GSTINs, grand total)
3. **GSTIN validation** — 15-char regex + state-code vs address cross-check
4. **Page isolation** — values from page 1 cannot bleed into page 2
5. **Invoice-number vs date reconciliation** — if the model confuses them, the value is cleared rather than wrong
6. **Rate-limit-aware retries** against the upstream LLM (4× exponential backoff respecting `retry-after`)
7. **RLS-protected storage** — every extraction row is tenant-scoped at the database layer

---

## 7. Typical User Journey

1. User signs up → an admin issues them an API key from `/admin`
2. They test it via `/api-test` or `curl` with a sample invoice
3. They drop their first real invoice on `/upload` → see the structured JSON on `/extract`
4. They integrate `POST /api/v1/extract` into their backend / RPA / ERP
5. They monitor usage; admin tops up monthly limit when they hit it

---

## 8. What's Explicitly *Not* in Scope

- No tax math validation (we extract what's printed, we don't recompute GST)
- No accounting / ledger posting (we hand JSON to your ERP, your ERP posts it)
- No editing UI for extracted values (output is read-only by design)
- No support for non-Indian tax documents in the current prompt tuning
