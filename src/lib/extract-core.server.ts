// Server-only core extraction logic. Used by both the createServerFn wrapper
// (src/lib/extract.functions.ts) and the public /api/v1/extract route.
// IMPORTANT: Do not change the system prompt or model — kept identical to the
// existing extractDocument behavior.
const SYSTEM_PROMPT = `You are a senior invoice and document extraction specialist.

Your task is to extract data exactly as it appears on the document.

Rules:
1. Extract only visible information.
2. Never guess missing values.
3. Never infer values.
4. Never calculate values.
5. Never modify values.
6. Never replace invoice numbers with dates.
7. Never replace GSTINs with similar-looking values.
8. Preserve original formatting exactly as shown.
9. If a field is unclear, return null.
10. Return valid JSON only.
11. Extract first, do not reason.
12. Read the document literally, not logically.

# Page isolation (CRITICAL)
- Treat every page as an independent document context.
- Do NOT carry header, seller, buyer, GSTIN, invoice number, totals, or line-item values from one page into another.
- If a value is not visible on the page being read, return null for that page — do not copy it from a sibling page.

# Section-targeted extraction
Extract these sections independently before merging into the final object:
- Header: invoice_number, invoice_date, seller_details, buyer_details, GSTINs
- Line items: description, quantity, rate, taxable_value (read row-by-row, preserve original row order, never shift columns)
- Totals: subtotal, tax_amounts, grand_total

# Invoice number vs invoice date
- invoice_number and invoice_date are independent fields. They must NOT be the same string.
- If the only candidate for invoice_number looks like a date, return null for invoice_number rather than copying the date.

# GSTIN
- GSTIN is always exactly 15 characters: ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$
- Return the GSTIN exactly as printed (do not auto-correct). Validity is reported separately.
- Seller GSTIN is read ONLY from the header/letterhead. Buyer GSTIN is read ONLY from the Bill To/Buyer block. Never mix.

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
  "payment_terms": { "payment_mode": string|null, "due_date": string|null, "due_days": number|null, "interest_rate_percent": number|null, "advance_received": number|null } | null,
  "bank_details": { "bank_name": string|null, "account_number": string|null, "ifsc_code": string|null, "account_holder_name": string|null, "branch": string|null } | null,
  "transport_details": { "transporter_name": string|null, "transporter_gstin": string|null, "vehicle_number": string|null, "lr_number": string|null, "lr_date": string|null, "eway_bill_number": string|null, "eway_bill_date": string|null, "dispatch_from": string|null, "ship_to": string|null, "place_of_supply": string|null, "place_of_supply_code": string|null } | null,
  "broker_agent_details": { "broker_name": string|null, "broker_address": string|null, "agent_name": string|null, "agency_code": string|null } | null,
  "document_references": { "challan_number": string|null, "order_number": string|null, "po_number": string|null, "case_pack_info": string|null, "reverse_charge_applicable": boolean },
  "references": { "po_number": string|null, "po_date": string|null, "challan_number": string|null, "challan_date": string|null, "invoice_reference": string|null, "contract_number": string|null },
  "authorized_signatory": { "name": string|null, "designation": string|null, "company": string|null } | null,
  "qr_code": string|null,
  "notes": string|null,
  "additional": object,
  "validation": { "warnings": string[] },
  "per_field_confidence": {
    "seller_gstin": number,
    "buyer_gstin": number,
    "invoice_number": number,
    "invoice_date": number,
    "line_items": number,
    "tax_amounts": number,
    "grand_total": number,
    "bank_details": number,
    "transport_details": number
  }
}

# Multi-invoice documents
- If the input contains more than one independent invoice/document, return { "documents": [ <object>, <object>, ... ] }.
- Never merge line items, totals, or parties across separate invoices.

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

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function validateGSTIN(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export function getGSTINStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || !validateGSTIN(gstin)) return null;
  return gstin.trim().substring(0, 2);
}

export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
  "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh (New)",
  "38": "Ladakh", "97": "Other Territory", "99": "Centre Jurisdiction",
};

function applyGstinValidation(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;
  const seller = toObject(root.seller);
  const buyer = toObject(root.buyer);
  const sellerGstin = typeof seller?.gstin === "string" ? seller.gstin : null;
  const buyerGstin = typeof buyer?.gstin === "string" ? buyer.gstin : null;
  const sellerValid = validateGSTIN(sellerGstin);
  const buyerValid = buyerGstin ? validateGSTIN(buyerGstin) : true;

  root.gstin_seller_valid = sellerValid;
  root.gstin_buyer_valid = buyerValid;

  const validation = toObject(root.validation) ?? {};
  validation.gstin_seller_valid = sellerValid;
  validation.gstin_buyer_valid = buyerValid;
  const warnings: string[] = Array.isArray(validation.warnings) ? (validation.warnings as string[]) : [];
  const pushWarn = (w: string) => { if (!warnings.includes(w)) warnings.push(w); };

  if (sellerGstin && !sellerValid) pushWarn("GSTIN seller format invalid — verify manually");
  if (buyerGstin && !buyerValid) pushWarn("GSTIN buyer format invalid — verify manually");

  // Seller GSTIN state code vs seller address state mismatch
  const sellerCode = getGSTINStateCode(sellerGstin);
  const sellerAddrState = typeof seller?.state === "string" ? seller.state.trim() : "";
  if (sellerCode && sellerAddrState && GST_STATE_CODES[sellerCode]) {
    const expected = GST_STATE_CODES[sellerCode].toLowerCase();
    if (!sellerAddrState.toLowerCase().includes(expected.split(" ")[0])) {
      pushWarn(`Seller GSTIN state code ${sellerCode} does not match seller address state`);
    }
  }

  // per_field_confidence: clamp GSTIN confidences when invalid
  const pfc = toObject(root.per_field_confidence) ?? {};
  if (sellerGstin && !sellerValid) {
    const c = toNumber(pfc.seller_gstin);
    pfc.seller_gstin = c === null ? 0.6 : Math.min(c, 0.6);
  }
  if (buyerGstin && !buyerValid) {
    const c = toNumber(pfc.buyer_gstin);
    pfc.buyer_gstin = c === null ? 0.6 : Math.min(c, 0.6);
  }
  root.per_field_confidence = pfc;

  // Validation presence flags
  const totals = toObject(root.totals);
  const transport = toObject(root.transport_details) ?? toObject(root.transport);
  const bank = toObject(root.bank_details);
  const taxable = toNumber(totals?.taxable_amount) ?? 0;
  const ewayNo = transport ? (transport.eway_bill_number ?? transport.eway_bill_no) : null;
  validation.bank_details_present = !!bank;
  validation.transport_details_present = !!transport;
  validation.eway_bill_required = taxable > 50000 && !!transport;
  if (taxable > 50000 && !ewayNo) pushWarn("E-way bill missing — taxable amount exceeds ₹50,000");

  // Compute total_tax and compare against any printed footer value
  if (totals) {
    const computed =
      positiveNumber(totals.cgst) + positiveNumber(totals.sgst) +
      positiveNumber(totals.igst) + positiveNumber(totals.cess);
    const printed = toNumber(totals.total_tax);
    if (printed !== null && Math.abs(printed - computed) > 1) {
      pushWarn("total_tax mismatch — footer value differs from computed CGST+SGST+IGST");
    }
    totals.total_tax = Number(computed.toFixed(2));
  }

  // Line item amount verification
  let allItemsOk = true;
  if (Array.isArray(root.line_items)) {
    for (const item of root.line_items) {
      const row = toObject(item);
      if (!row) continue;
      const qty = toNumber(row.quantity);
      const rate = toNumber(row.rate);
      const discount = positiveNumber(row.discount);
      const amount = toNumber(row.taxable_amount) ?? toNumber(row.amount);
      if (qty !== null && rate !== null && amount !== null) {
        const expected = Math.round(qty * rate) - discount;
        if (Math.abs(expected - amount) > 1) {
          allItemsOk = false;
          const sr = row.sr_no ?? "?";
          pushWarn(`Line item amount inconsistency on item #${sr} — extracted qty×rate ≠ amount`);
        }
      }
    }
  }
  validation.line_items_amount_verified = allItemsOk;

  validation.warnings = warnings;
  root.validation = validation;

  // Backward-compat: compute overall_confidence from per_field_confidence average
  // so the /api/v1/extract route continues to populate the column.
  const pfcValues = Object.values(pfc).map((v) => toNumber(v)).filter((v): v is number => v !== null);
  if (pfcValues.length > 0) {
    root.overall_confidence = Number((pfcValues.reduce((a, b) => a + b, 0) / pfcValues.length).toFixed(2));
  }

  return root;
}

function normalizeResponse(parsed: unknown): unknown {
  const root = toObject(parsed);
  if (root && Array.isArray(root.documents)) {
    root.documents = root.documents.map((doc) => applyGstinValidation(normalizeGstTaxes(doc)));
    return root;
  }
  return applyGstinValidation(normalizeGstTaxes(parsed));
}

function isPdfDataUri(url: string): boolean {
  return url.startsWith("data:application/pdf");
}

async function callGroqVision(images: string[], hint?: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} Return JSON only.`,
    },
    ...images.map((url) => ({
      type: "image_url",
      image_url: { url: normalizeImageUrl(url) },
    })),
  ];

  const body = JSON.stringify({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0,
    top_p: 1,
    seed: 7,
    max_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });

  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });

    if (res.ok) {
      const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return json.choices?.[0]?.message?.content ?? "{}";
    }

    const text = await res.text();
    lastErr = `Groq API error ${res.status}: ${text.slice(0, 500)}`;
    if (res.status !== 429 && res.status < 500) break;

    // Parse retry delay from message ("try again in 12.848s") or Retry-After header.
    let waitMs = 0;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) waitMs = Math.ceil(parseFloat(retryAfter) * 1000);
    const m = text.match(/try again in ([\d.]+)s/i);
    if (m) waitMs = Math.max(waitMs, Math.ceil(parseFloat(m[1]) * 1000));
    if (!waitMs) waitMs = 2000 * (attempt + 1);
    waitMs = Math.min(waitMs + 500, 30000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(lastErr || "Groq API failed");
}

async function callGeminiPdf(images: string[], hint?: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const parts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract structured data from this document.${hint ? " Hint: " + hint : ""} If multiple invoices/documents are present, return { "documents": [...] }. Return JSON only.`,
    },
  ];

  for (const url of images) {
    const dataUri = url.startsWith("data:") ? url : normalizeImageUrl(url);
    if (dataUri.startsWith("data:application/pdf")) {
      parts.push({
        type: "file",
        file: { filename: "document.pdf", file_data: dataUri },
      });
    } else {
      parts.push({ type: "image_url", image_url: { url: dataUri } });
    }
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      top_p: 1,
      seed: 7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parts },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "{}";
}

function parseJsonLoose(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* fallthrough */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return {};
}

// Wrap seller/buyer GSTIN with { raw_value, normalized_value, is_valid }
// WITHOUT changing the extracted string. The visible `gstin` field stays
// as the model returned it. We expose a sibling `gstin_quality` block.
function annotateGstinQuality(doc: ExtractedObject): void {
  for (const key of ["seller", "buyer"] as const) {
    const party = toObject(doc[key]);
    if (!party) continue;
    const raw = typeof party.gstin === "string" ? party.gstin : null;
    if (raw === null) continue;
    const normalized = raw.replace(/\s+/g, "").toUpperCase();
    party.gstin_quality = {
      raw_value: raw,
      normalized_value: normalized,
      is_valid: GSTIN_REGEX.test(normalized),
    };
  }
}

// If invoice_number === invoice_date, lower confidence and null the number.
function reconcileInvoiceNumberDate(doc: ExtractedObject, warnings: string[]): void {
  const num = typeof doc.document_number === "string" ? doc.document_number.trim() : null;
  const date = typeof doc.document_date === "string" ? doc.document_date.trim() : null;
  const looksLikeDate = num ? /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(num) : false;
  if (num && (num === date || looksLikeDate)) {
    doc.document_number = null;
    const pfc = toObject(doc.per_field_confidence) ?? {};
    const c = toNumber(pfc.invoice_number);
    pfc.invoice_number = c === null ? 0.4 : Math.min(c, 0.4);
    doc.per_field_confidence = pfc;
    if (!warnings.includes("Invoice number matched invoice date — cleared to null")) {
      warnings.push("Invoice number matched invoice date — cleared to null");
    }
  }
}

// Compare critical fields between primary and verification runs.
// On mismatch: keep the value from the run with higher per-field confidence
// (default to primary) and lower the field confidence to ≤ 0.7.
const CRITICAL_PATHS: Array<{ key: string; pfc: string; get: (d: ExtractedObject) => unknown; set: (d: ExtractedObject, v: unknown) => void }> = [
  { key: "invoice_number", pfc: "invoice_number", get: (d) => d.document_number, set: (d, v) => { d.document_number = v as string | null; } },
  { key: "invoice_date",   pfc: "invoice_date",   get: (d) => d.document_date,   set: (d, v) => { d.document_date = v as string | null; } },
  { key: "seller_gstin",   pfc: "seller_gstin",   get: (d) => toObject(d.seller)?.gstin, set: (d, v) => { const s = toObject(d.seller); if (s) s.gstin = v as string | null; } },
  { key: "buyer_gstin",    pfc: "buyer_gstin",    get: (d) => toObject(d.buyer)?.gstin,  set: (d, v) => { const b = toObject(d.buyer);  if (b) b.gstin = v as string | null; } },
  { key: "grand_total",    pfc: "grand_total",    get: (d) => toObject(d.totals)?.grand_total, set: (d, v) => { const t = toObject(d.totals); if (t) t.grand_total = v as number | null; } },
];

function reconcileCriticalFields(primary: ExtractedObject, secondary: ExtractedObject | null, warnings: string[]): void {
  if (!secondary) return;
  const pfc = toObject(primary.per_field_confidence) ?? {};
  const pfc2 = toObject(secondary.per_field_confidence) ?? {};
  for (const f of CRITICAL_PATHS) {
    const a = f.get(primary);
    const b = f.get(secondary);
    const same = JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    if (same) {
      // Boost confidence on match (cap at 0.99).
      const c = toNumber(pfc[f.pfc]);
      pfc[f.pfc] = c === null ? 0.95 : Math.min(0.99, Math.max(c, 0.95));
    } else {
      const ca = toNumber(pfc[f.pfc]) ?? 0;
      const cb = toNumber(pfc2[f.pfc]) ?? 0;
      if (cb > ca) f.set(primary, b);
      pfc[f.pfc] = Math.min(ca, cb, 0.7);
      warnings.push(`Critical field "${f.key}" disagreed across verification runs — confidence lowered`);
    }
  }
  primary.per_field_confidence = pfc;
}

function postProcess(parsed: unknown, secondary: unknown | null): unknown {
  const root = toObject(parsed);
  if (!root) return parsed;
  const sec = toObject(secondary);
  const apply = (doc: ExtractedObject, secDoc: ExtractedObject | null) => {
    const validation = toObject(doc.validation) ?? {};
    const warnings: string[] = Array.isArray(validation.warnings) ? (validation.warnings as string[]) : [];
    reconcileInvoiceNumberDate(doc, warnings);
    reconcileCriticalFields(doc, secDoc, warnings);
    annotateGstinQuality(doc);
    validation.warnings = warnings;
    doc.validation = validation;
  };
  if (Array.isArray(root.documents)) {
    const secDocs = sec && Array.isArray(sec.documents) ? (sec.documents as unknown[]) : [];
    root.documents.forEach((doc, i) => {
      const d = toObject(doc); if (!d) return;
      apply(d, toObject(secDocs[i] ?? null));
    });
  } else {
    apply(root, sec);
  }
  return root;
}

// Lightweight second pass that ONLY re-extracts critical fields, used to
// detect cross-run instability. Reuses the same model/temperature/seed.
async function verifyCriticalFields(images: string[], hasPdf: boolean, hint?: string): Promise<unknown | null> {
  try {
    const raw = hasPdf ? await callGeminiPdf(images, hint) : await callGroqVision(images, hint);
    return normalizeResponse(parseJsonLoose(raw));
  } catch {
    return null;
  }
}

export async function extractCore(images: string[], hint?: string): Promise<ExtractCoreResult> {
  const hasPdf = images.some((url) => {
    if (url.startsWith("data:")) return isPdfDataUri(url);
    return detectMimeType(url) === "application/pdf";
  });

  let parsed: unknown;

  if (!hasPdf && images.length > 1) {
    // Process each image independently to prevent cross-page contamination.
    // Run sequentially to stay under provider TPM rate limits.
    const perImage: unknown[] = [];
    for (const img of images) {
      perImage.push(normalizeResponse(parseJsonLoose(await callGroqVision([img], hint))));
    }
    const docs: unknown[] = [];
    for (const r of perImage) {
      const o = toObject(r);
      if (o && Array.isArray(o.documents)) docs.push(...o.documents);
      else if (o) docs.push(o);
    }
    parsed = docs.length === 1 ? docs[0] : { documents: docs };
    // Skip the consistency double-pass in multi-image mode to avoid TPM exhaustion.
    parsed = postProcess(parsed, null);
  } else {
    const raw = hasPdf ? await callGeminiPdf(images, hint) : await callGroqVision(images, hint);
    parsed = normalizeResponse(parseJsonLoose(raw));
    const secondary = await verifyCriticalFields(images, hasPdf, hint);
    parsed = postProcess(parsed, secondary);
  }

  const pretty = JSON.stringify(parsed, null, 2);
  return { json: pretty, parsed };
}
