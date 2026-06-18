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
   - GSTIN must be exactly 15 characters and match ^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$. Count the characters. If it fails, mark gstin_seller_valid/gstin_buyer_valid = false, set per_field_confidence.seller_gstin (or buyer_gstin) ≤ 0.60, and add warning "GSTIN seller format invalid — verify manually" (or buyer).
   - SELLER GSTIN is read ONLY from the header / letterhead area. BUYER GSTIN is read ONLY from the "Bill To" / "Buyer" section. Never mix them. Return null rather than a hallucinated value.
   - If the seller GSTIN's 2-digit state code does not match the state shown in the seller address, add warning "Seller GSTIN state code {XX} does not match seller address state".
   - HSN/SAC: 4-8 digits. PAN inside GSTIN (chars 3-12) must look valid.
   - Dates: convert to ISO YYYY-MM-DD. Treat DD/MM/YYYY as Indian convention unless context proves otherwise.
   - Numbers: strip currency symbols and thousands separators; keep decimals. Output as JSON numbers, not strings.
   - GST classification:
     * If seller state_code equals buyer state_code, use CGST + SGST and IGST must be 0.
     * If seller state_code differs from buyer state_code, use IGST and CGST/SGST must be 0.
     * Never infer CGST/SGST when the document explicitly shows IGST (or vice versa).
     * Prefer the tax summary section over calculated assumptions.
   - total_tax MUST ALWAYS be computed as cgst + sgst + igst + cess. Never OCR total_tax from the printed footer. If the computed value differs from the printed footer value, add warning "total_tax mismatch — footer value differs from computed CGST+SGST+IGST".
   - If the extracted tax structure does not reconcile with the invoice total, set validation.tax_math_ok = false.
   - Prefer values from the totals section over values inferred from line items.
   - LINE ITEMS (multi-column textile / Surat layouts): The AMOUNT column is the single source of truth. Work backwards: rate = amount / quantity. If two numeric columns precede Amount, pick the pair where value_A × value_B = Amount (±₹1). Never pick a column whose product is inconsistent with Amount. If still ambiguous, pick the closest pair and add warning "Line item amount inconsistency on item #{sr_no} — extracted qty×rate ≠ amount".
   - For EVERY line item, verify round(qty × rate) - discount = taxable_amount ±₹1; if it fails, push the same warning above.
6. SCORE confidence per field (per_field_confidence object) honestly:
   - 0.95–1.00 — clearly printed, unambiguous, directly readable.
   - 0.75–0.94 — partially obscured, handwritten, or required inference.
   - 0.00–0.74 — guess or could not be reliably read.
   - Any GSTIN field that fails the 15-character regex MUST be ≤ 0.60.
7. NEVER hallucinate. If a field is not present or not legible, return null.
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
  "gstin_seller_valid": boolean,
  "gstin_buyer_valid": boolean,
  "validation": {
    "gstin_seller_valid": boolean|null,
    "gstin_buyer_valid": boolean|null,
    "tax_math_ok": boolean|null,
    "igst_sum_ok": boolean|null,
    "cgst_sgst_sum_ok": boolean|null,
    "grand_total_ok": boolean|null,
    "eway_bill_required": boolean,
    "line_items_amount_verified": boolean,
    "bank_details_present": boolean,
    "transport_details_present": boolean,
    "warnings": string[]
  },
  "fields": [
    { "key": string, "value": string, "confidence": number, "category": string, "source_hint": string|null }
  ],
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
# Rules
- "fields" MUST include every important value you extracted with an honest confidence score and a category like "header" | "seller" | "buyer" | "line_item" | "totals" | "transport" | "bank" | "reference".
- If a section doesn't apply, set that whole section to null.
- Numbers must be JSON numbers, never strings.
- Strings: trim whitespace; preserve original casing.
- Do NOT emit overall_confidence. Use per_field_confidence instead.
- Validation rules to ALWAYS compute and return:
  * eway_bill_required: true if totals.taxable_amount > 50000 AND a transport section is present.
  * line_items_amount_verified: true only if EVERY line item passes round(qty × rate) - discount = taxable_amount ±₹1.
  * bank_details_present: true if bank_details was found.
  * transport_details_present: true if a transport section was found.
- Warnings to push into validation.warnings when their condition holds:
  * Seller GSTIN fails regex → "GSTIN seller format invalid — verify manually"
  * Buyer GSTIN fails regex → "GSTIN buyer format invalid — verify manually"
  * Any line item where qty×rate ≠ amount ±₹1 → "Line item amount inconsistency on item #{sr_no} — extracted qty×rate ≠ amount"
  * Computed total_tax ≠ footer total_tax → "total_tax mismatch — footer value differs from computed CGST+SGST+IGST"
  * taxable_amount > 50000 and no eway_bill_number → "E-way bill missing — taxable amount exceeds ₹50,000"
  * Seller GSTIN state code ≠ state in seller address → "Seller GSTIN state code {XX} does not match seller address state"
# Multi-invoice documents (CRITICAL)
- A single PDF or image set may contain MORE THAN ONE invoice/document.
- If you find ONE document, return a single JSON object as specified above.
- If you find TWO OR MORE documents, return: { "documents": [ <object1>, <object2>, ... ] } where each element follows the full schema above. Do NOT merge line items across different invoices.

CRITICAL EXTRACTION RULES:

1. GSTIN VALIDATION: A GSTIN is always exactly 15 characters. Count characters. If not 15, mark as invalid and set confidence ≤ 0.60. Regex: [0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}

2. LINE ITEM VERIFICATION: For each line item, verify round(qty × rate) - discount = taxable_amount ±1. If not, set warning and try alternate column readings before giving up.

3. TAX COMPUTATION: total_tax = cgst + sgst + igst + cess. Always compute. Never OCR from footer. If footer differs, warn.

4. BANK DETAILS: Always extract from "Bank Details" section at invoice bottom.

5. E-WAY BILL: Always extract if present. Look for: "Eway Bill No", "E-way Bill", "EWB No", "E-Way Bill Number".

6. LR NUMBER: Always extract Lorry Receipt / LR No from transport section.

7. BROKER / AGENT: Look for "Broker:", "Agent:", "Through:" — always extract if present.

8. PLACE OF SUPPLY: State name or 2-digit code — extract from near buyer address or from explicit "Place of Supply:" field.

9. NULL OVER HALLUCINATION: Return null for any field not found. Never guess or hallucinate GSTIN, amounts, or document reference numbers.

10. SELLER vs BUYER GSTIN: Seller GSTIN is in header/letterhead only. Buyer GSTIN is in Bill To / Buyer section only. Never mix them.

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

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      max_tokens: 8192,
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
  return json.choices?.[0]?.message?.content ?? "{}";
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

export async function extractCore(images: string[], hint?: string): Promise<ExtractCoreResult> {
  const hasPdf = images.some((url) => {
    if (url.startsWith("data:")) return isPdfDataUri(url);
    return detectMimeType(url) === "application/pdf";
  });

  // PDFs go through Gemini (native multi-page PDF support); images via Groq.
  const raw = hasPdf ? await callGeminiPdf(images, hint) : await callGroqVision(images, hint);

  let parsed: unknown = {};
  let pretty = raw;
  try {
    parsed = normalizeResponse(JSON.parse(raw));
    pretty = JSON.stringify(parsed, null, 2);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = normalizeResponse(JSON.parse(m[0]));
        pretty = JSON.stringify(parsed, null, 2);
      } catch {
        /* keep raw */
      }
    }
  }

  return { json: pretty, parsed };
}
