import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const headers = (origin: string | null) => ({ "Access-Control-Allow-Origin": origin || "null", "Access-Control-Allow-Headers": "apikey, authorization, content-type", "Vary": "Origin" });
const respond = (body: unknown, status: number, origin: string | null) => Response.json(body, { status, headers: headers(origin) });
const permittedOrigin = (origin: string | null) => (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).includes(origin || "");

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    const origin = req.headers.get("origin");
    if (!permittedOrigin(origin)) return respond({ error: "origin_not_allowed" }, 403, origin);
    if (req.method === "OPTIONS") return new Response(null, { headers: headers(origin) });
    if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405, origin);
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await req.json();
        if (payload.action !== "quote" || typeof payload.raffleId !== "string" || !Array.isArray(payload.tickets)) return respond({ error: "invalid_request" }, 400, origin);
        const { data, error } = await ctx.supabaseAdmin.rpc("create_checkout_quote", { p_raffle_id: payload.raffleId, p_ticket_numbers: payload.tickets.map(Number) });
        if (error || !data?.[0]) return respond({ error: "tickets_unavailable" }, 409, origin);
        return respond(data[0], 200, origin);
      }
      const form = await req.formData(), quoteId = String(form.get("quoteId") || ""), requestId = String(form.get("requestId") || ""), receipt = form.get("receipt");
      if (!(receipt instanceof File) || !["image/jpeg","image/png","application/pdf"].includes(receipt.type) || receipt.size < 1 || receipt.size > 10 * 1024 * 1024) return respond({ error: "invalid_receipt" }, 400, origin);
      const ext = receipt.type === "application/pdf" ? "pdf" : receipt.type === "image/png" ? "png" : "jpg", receiptPath = `orders/${quoteId}/${crypto.randomUUID()}.${ext}`;
      const upload = await ctx.supabaseAdmin.storage.from("payment-receipts").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
      if (upload.error) throw upload.error;
      const { data, error } = await ctx.supabaseAdmin.rpc("submit_checkout_order", { p_quote_id: quoteId, p_request_id: requestId, p_name: String(form.get("name") || ""), p_email: String(form.get("email") || ""), p_phone: String(form.get("phone") || ""), p_receipt_path: receiptPath });
      if (error || !data?.[0]) { await ctx.supabaseAdmin.storage.from("payment-receipts").remove([receiptPath]); return respond({ error: "quote_expired" }, 409, origin); }
      return respond({ orderId: data[0].order_id, status: data[0].status }, 200, origin);
    } catch (error) { console.error(error); return respond({ error: "checkout_failed" }, 500, origin); }
  }),
};
