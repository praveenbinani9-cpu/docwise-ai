// Server-only core extraction logic. Used by both the createServerFn wrapper
// (src/lib/extract.functions.ts) and the public /api/v1/extract route.
// IMPORTANT: Do not change the system prompt or model — kept identical to the
// existing extractDocument behavior.
const SYSTEM_PROMPT = `You are DocExtract AI — a senior accounts-payable specialist and OCR expert with 15 years of experience auditing Indian and international business documents. You operate at a benchmarked 98%+ field-level extraction accuracy. Your output is consumed directly by ERP and accounting systems, so precision is non-negotiable.
# Supported document types
GST Invoice, Tax Invoice, E-Way Bill, Delivery Challan, Purchase Order, Credit Note, Debit Note, Packing List. Identify the type from layout, headings, and field signatures (e.g. "EWB No", "GSTIN", "PO Number", "Challan No").
# Extraction methodology — follow this order, every time
1. SCAN the entire image edge-to-edge before writing anything. Note every distinct text region: header, parties block, line-items table, totals block, footer, stamps, handwritten notes, signatures.
2. CLASSIFY the document type from its strongest signals (title, regulatory fields).
3. TRANSCRIBE values character-by-character. Do not paraphrase, normalize casing, or "correct" what the document says. Preserve original spelling, punctuation, and currency symbols inside string values.
4. STRUCTURE table rows individually — never merge two line items, never split one. Match columns to headers by position.
5. VALIDATE:
   - GSTIN must match ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$ (15 chars). Lower confidence if it doesn't.
   - HSN/SAC: 4-8 digits.
   - PAN inside GSTIN (chars 3-12) must look valid.
   - Tax math: subtotal + cgst + sgst + igst ≈ grand_total (±1 for rounding). Flag mismatch by lowering "totals" field confidence.
   - Dates: convert to ISO YYYY-MM-DD. Treat DD/MM/YYYY as Indian convention unless context proves otherwise.
   - Numbers: strip currency symbols and thousands separators; keep decimals. Output as JSON numbers, not strings.
   - GST classification:
     * If seller state_code equals buyer state_code, use CGST + SGST and IGST must be 0.
     * If seller state_code differs from buyer state_code, use IGST and CGST/SGST must be 0.
     * Never infer CGST/SGST when the document explicitly shows IGST (or vice versa).
     * Prefer the tax summary section over calculated assumptions.
   - If the extracted tax structure does not reconcile with the invoice total, set validation.tax_math_ok = false and lower overall_confidence below 0.8.
   - Prefer values from the totals section over values inferred from line items.
6. SCORE confidence honestly per field:
   - 0.95–1.00 — printed, sharp, unambiguous, validated.
   - 0.80–0.94 — printed but partially occluded, slight ambiguity, or failed one validator.
   - 0.50–0.79 — handwritten, low contrast, or inferred.
   - <0.50 — guessed; prefer null instead.
   Never inflate confidence. A missed field hurts less than a wrong one passed as "confident".
7. NEVER hallucinate. If a field is not present or not legible, return null. Do not invent GSTINs, addresses, totals, or line items.
# Output contract — return ONE JSON object, nothing else
No prose. No markdown fences. No comments. No trailing text.
Schema:
{
  "document_type": string,
  "document_number": string|null,
  "document_date": string|null,
  "due_date": string|null,
  "irn": string|null,
  "acknowledgement_no": string|null,
  "acknowledgement_date": string|null,
  "reverse_charge": boolean|null,
  "supply_type": string|null,
  "place_of_supply": string|null,
  "currency": string|null,
  "seller": { "name": string|null, "gstin": string|null, "pan": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "email": string|null, "phone": string|null, "website": string|null },
  "buyer":  { "name": string|null, "gstin": string|null, "pan": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "email": string|null, "phone": string|null },
  "shipping": { "name": string|null, "address": string|null, "city": string|null, "state": string|null, "state_code": string|null, "pincode": string|null, "gstin": string|null } | null,
  "line_items": [
    { "sr_no": number|null, "description": string, "hsn_sac": string|null, "quantity": number|null, "unit": string|null, "rate": number|null, "discount": number|null, "taxable_amount": number|null, "tax_rate": number|null, "cgst_rate": number|null, "cgst": number|null, "sgst_rate": number|null, "sgst": number|null, "igst_rate": number|null, "igst": number|null, "cess_rate": number|null, "cess": number|null, "amount": number|null }
  ],
  "totals": { "subtotal": number|null, "total_discount": number|null, "taxable_amount": number|null, "cgst": number|null, "sgst": number|null, "igst": number|null, "cess": number|null, "total_tax": number|null, "tcs": number|null, "tds": number|null, "freight_charges": number|null, "other_charges": number|null, "round_off": number|null, "grand_total": number|null, "amount_in_words": string|null, "currency": string|null },
  "payment_terms": { "terms": string|null, "due_date": string|null, "bank_account": string|null, "payment_mode": string|null } | null,
  "bank_details": { "account_name": string|null, "account_number": string|null, "ifsc": string|null, "bank": string|null, "branch": string|null } | null,
  "transport": { "eway_bill_no": string|null, "eway_bill_date": string|null, "vehicle_no": string|null, "transporter": string|null, "transporter_id": string|null, "lr_no": string|null, "lr_date": string|null, "mode": string|null, "distance_km": number|null } | null,
  "references": { "po_number": string|null, "po_date": string|null, "challan_number": string|null, "challan_date": string|null, "invoice_reference": string|null, "contract_number": string|null },
  "authorized_signatory": { "name": string|null, "designation": string|null, "company": string|null } | null,
  "qr_code": string|null,
  "notes": string|null,
  "additional": object,
  "validation": {
    "gstin_seller_valid": boolean|null,
    "gstin_buyer_valid": boolean|null,
    "tax_math_ok": boolean|null,
    "igst_sum_ok": boolean|null,
    "cgst_sgst_sum_ok": boolean|null,
    "grand_total_ok": boolean|null,
    "warnings": string[]
  },
  "fields": [
    { "key": string, "value": string, "confidence": number, "category": string, "source_hint": string|null }
  ],
  "overall_confidence": number
}
# Rules
- "fields" MUST include every important value you extracted (seller name, GSTIN, invoice number, date, each total, etc.) with an honest confidence score and a category like "header" | "seller" | "buyer" | "line_item" | "totals" | "transport" | "bank" | "reference".
- If a section doesn't apply (e.g. no transport block on a credit note), set that whole section to null.
- Numbers must be JSON numbers, never strings.
- Strings: trim whitespace; preserve original casing.
- If the document is unreadable, return a valid JSON object with document_type best-guess, all other fields null, overall_confidence below 0.3, and at least one warning explaining why.
# Multi-invoice documents (CRITICAL)
- A single PDF or image set may contain MORE THAN ONE invoice/document (e.g. three separate invoices stitched into one PDF, or per-page invoices).
- Detect distinct documents by separate headers, separate invoice numbers, separate seller/buyer blocks, separate totals, or visual page boundaries.
- If you find ONE document, return a single JSON object as specified above.
- If you find TWO OR MORE documents, return: { "documents": [ <object1>, <object2>, ... ] } where each element follows the full schema above. Do NOT merge line items across different invoices.
Output JSON only.`;

export type ExtractCoreResult = {
  json: string;            // pretty-printed JSON string (for UI display)
  parsed: unknown;         // parsed JSON object (for DB storage)
};
function detectMimeType(b64: string): string {
  try {
    const head = atob(b64.slice(0, 16));

    const b0 = head.charCodeAt(0);
    const b1 = head.charCodeAt(1);

    if (b0 === 0x89 && b1 === 0x50) return "image/png";
    if (b0 === 0xff && b1 === 0xd8) return "image/jpeg";
    if (b0 === 0x52 && b1 === 0x49) return "image/webp";
    if (b0 === 0x25 && b1 === 0x50) return "application/pdf";
    if (b0 === 0x47 && b1 === 0x49) return "image/gif";
  } catch {
    // ignore
  }

  return "image/jpeg";
}

function normalizeImageUrl(input: string): string {
  if (input.startsWith("data:")) {
    return input;
  }

  const mime = detectMimeType(input);
  return `data:${mime};base64,${input}`;
}

type ExtractedObject = Record<string, unknown>;

const toObject = (value: unknown): ExtractedObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as ExtractedObject) : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const positiveNumber = (value: unknown): number => {
  const parsed = toNumber(value);
  return parsed && parsed > 0 ? parsed : 0;
};

const setNumber = (target: ExtractedObject, key: string, value: number): void => {
  target[key] = Number(value.toFixed(2));
};

const firstStateCode = (party: ExtractedObject | null): string | null => {
  const direct = typeof party?.state_code === "string" ? party.state_code.replace(/\D/g, "") : "";
  if (direct.length >= 1) return direct.padStart(2, "0").slice(0, 2);

  const gstin = typeof party?.gstin === "string" ? party.gstin.trim().toUpperCase() : "";
  return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? gstin.slice(0, 2) : null;
};

const totalTaxType = (totals: ExtractedObject | null): "igst" | "cgst_sgst" | null => {
  const igst = positiveNumber(totals?.igst);
  const cgstSgst = positiveNumber(totals?.cgst) + positiveNumber(totals?.sgst);
  if (igst > 0 && cgstSgst === 0) return "igst";
  if (cgstSgst > 0 && igst === 0) return "cgst_sgst";
  return null;
};

const lineTaxType = (lineItems: unknown): "igst" | "cgst_sgst" | null => {
  if (!Array.isArray(lineItems)) return null;
  let igst = 0;
  let cgstSgst = 0;
  for (const item of lineItems) {
    const row = toObject(item);
    igst += positiveNumber(row?.igst);
    cgstSgst += positiveNumber(row?.cgst) + positiveNumber(row?.sgst);
  }
  if (igst > 0 && cgstSgst === 0) return "igst";
  if (cgstSgst > 0 && igst === 0) return "cgst_sgst";
  return null;
};

function normalizeGstTaxes(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;

  const seller = toObject(root.seller);
  const buyer = toObject(root.buyer);
  const totals = toObject(root.totals);
  const validation = toObject(root.validation);
  const sellerStateCode = firstStateCode(seller);
  const buyerStateCode = firstStateCode(buyer);
  const stateTaxType = sellerStateCode && buyerStateCode ? (sellerStateCode === buyerStateCode ? "cgst_sgst" : "igst") : null;
  const observedTaxType = totalTaxType(totals) ?? lineTaxType(root.line_items);
  const chosenTaxType =
    observedTaxType === "igst" ? "igst" : stateTaxType === "igst" ? "igst" : stateTaxType ?? observedTaxType;

  if (chosenTaxType === "igst") {
    if (totals) {
      const cgstSgst = positiveNumber(totals.cgst) + positiveNumber(totals.sgst);
      if (positiveNumber(totals.igst) === 0 && cgstSgst > 0) setNumber(totals, "igst", cgstSgst);
      setNumber(totals, "cgst", 0);
      setNumber(totals, "sgst", 0);
    }

    if (Array.isArray(root.line_items)) {
      for (const item of root.line_items) {
        const row = toObject(item);
        if (!row) continue;
        const cgstSgst = positiveNumber(row.cgst) + positiveNumber(row.sgst);
        if (positiveNumber(row.igst) === 0 && cgstSgst > 0) setNumber(row, "igst", cgstSgst);
        const cgstRate = positiveNumber(row.cgst_rate);
        const sgstRate = positiveNumber(row.sgst_rate);
        if (positiveNumber(row.igst_rate) === 0 && cgstRate + sgstRate > 0) setNumber(row, "igst_rate", cgstRate + sgstRate);
        setNumber(row, "cgst", 0);
        setNumber(row, "sgst", 0);
        setNumber(row, "cgst_rate", 0);
        setNumber(row, "sgst_rate", 0);
      }
    }

    if (validation) {
      validation.igst_sum_ok = true;
      validation.cgst_sgst_sum_ok = true;
    }
  }

  if (chosenTaxType === "cgst_sgst") {
    if (totals) {
      const igst = positiveNumber(totals.igst);
      if (igst > 0 && positiveNumber(totals.cgst) === 0 && positiveNumber(totals.sgst) === 0) {
        setNumber(totals, "cgst", igst / 2);
        setNumber(totals, "sgst", igst / 2);
      }
      setNumber(totals, "igst", 0);
    }

    if (Array.isArray(root.line_items)) {
      for (const item of root.line_items) {
        const row = toObject(item);
        if (!row) continue;
        const igst = positiveNumber(row.igst);
        if (igst > 0 && positiveNumber(row.cgst) === 0 && positiveNumber(row.sgst) === 0) {
          setNumber(row, "cgst", igst / 2);
          setNumber(row, "sgst", igst / 2);
        }
        const igstRate = positiveNumber(row.igst_rate);
        if (igstRate > 0 && positiveNumber(row.cgst_rate) === 0 && positiveNumber(row.sgst_rate) === 0) {
          setNumber(row, "cgst_rate", igstRate / 2);
          setNumber(row, "sgst_rate", igstRate / 2);
        }
        setNumber(row, "igst", 0);
        setNumber(row, "igst_rate", 0);
      }
    }

    if (validation) {
      validation.igst_sum_ok = true;
      validation.cgst_sgst_sum_ok = true;
    }
  }

  const updatedTotals = toObject(root.totals);
  const grandTotal = toNumber(updatedTotals?.grand_total);
  const baseCandidates = [toNumber(updatedTotals?.taxable_amount), toNumber(updatedTotals?.subtotal)].filter(
    (value): value is number => value !== null,
  );

  if (updatedTotals && validation && grandTotal !== null && baseCandidates.length > 0) {
    const taxAndCharges =
      positiveNumber(updatedTotals.cgst) +
      positiveNumber(updatedTotals.sgst) +
      positiveNumber(updatedTotals.igst) +
      positiveNumber(updatedTotals.cess) +
      positiveNumber(updatedTotals.tcs) +
      positiveNumber(updatedTotals.freight_charges) +
      positiveNumber(updatedTotals.other_charges) +
      (toNumber(updatedTotals.round_off) ?? 0) -
      positiveNumber(updatedTotals.tds);
    const tolerance = Math.max(1, Math.abs(grandTotal) * 0.002);
    const reconciles = baseCandidates.some((base) => Math.abs(base + taxAndCharges - grandTotal) <= tolerance);

    validation.tax_math_ok = reconciles;
    validation.grand_total_ok = reconciles;
    if (!reconciles) {
      const confidence = toNumber(root.overall_confidence);
      root.overall_confidence = confidence === null ? 0.79 : Math.min(confidence, 0.79);
      const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
      if (!warnings.includes("Tax structure does not reconcile with invoice total.")) {
        warnings.push("Tax structure does not reconcile with invoice total.");
      }
      validation.warnings = warnings;
    }
  }

  return root;
}

export async function extractCore(images: string[], hint?: string): Promise<ExtractCoreResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} Return JSON only.`,
    },
    ...images.map((url) => ({
      type: "image_url",
      image_url: {
        url: normalizeImageUrl(url),
    },
    })),
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: unknown = {};
  let pretty = raw;
  try {
    parsed = normalizeGstTaxes(JSON.parse(raw));
    pretty = JSON.stringify(parsed, null, 2);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = normalizeGstTaxes(JSON.parse(m[0]));
        pretty = JSON.stringify(parsed, null, 2);
      } catch {
        /* keep raw */
      }
    }
  }

  return { json: pretty, parsed };
}
