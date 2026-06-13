import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  images: z.array(z.string().min(20)).min(1).max(8), // base64 data URLs
  hint: z.string().optional(),
});

const SYSTEM_PROMPT = `You are DocExtract AI, an expert at extracting structured data from business documents:
GST Invoices, Tax Invoices, E-Way Bills, Delivery Challans, Purchase Orders, Credit Notes, Debit Notes, and Packing Lists.

Return ONE strict JSON object only — no prose, no markdown fences. Schema:
{
  "document_type": string,           // e.g. "GST Invoice", "E-Way Bill"
  "document_number": string|null,
  "document_date": string|null,      // ISO YYYY-MM-DD when possible
  "seller": { "name": string|null, "gstin": string|null, "address": string|null, "state": string|null },
  "buyer":  { "name": string|null, "gstin": string|null, "address": string|null, "state": string|null },
  "line_items": [ { "description": string, "hsn_sac": string|null, "quantity": number|null, "unit": string|null, "rate": number|null, "amount": number|null, "tax_rate": number|null } ],
  "totals": { "subtotal": number|null, "cgst": number|null, "sgst": number|null, "igst": number|null, "total_tax": number|null, "grand_total": number|null, "currency": string|null },
  "additional": object,              // any extra fields you observed (eway bill no, vehicle, transporter, PO ref, etc.)
  "fields": [
    { "key": string, "value": string, "confidence": number, "category": string }
  ]
}

The "fields" array must include every important value you extracted with a confidence score between 0 and 1.
Use null for unknown values. Numbers must be numbers, not strings. Output JSON only.`;

export const extractDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Extract structured data from this document.${data.hint ? " Hint: " + data.hint : ""} Return JSON only.`,
      },
      ...data.images.map((url) => ({ type: "image_url", image_url: { url } })),
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

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { pretty = JSON.stringify(JSON.parse(m[0]), null, 2); } catch { /* keep raw */ }
      }
    }
    return { json: pretty };
  });
