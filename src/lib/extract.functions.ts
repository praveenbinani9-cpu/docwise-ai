import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  images: z.array(z.string().min(20)).min(1).max(4), // reduced from 8 to 4
  hint: z.string().optional(),
});

export const extractDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { extractCore } = await import("./extract-core.server");
    const { json } = await extractCore(data.images, data.hint);
    return { json };
  });
