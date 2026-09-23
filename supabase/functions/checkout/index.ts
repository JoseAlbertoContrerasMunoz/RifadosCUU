import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const corsHeaders = (origin: string) => ({ "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const securityHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const permittedOrigin = (origin: string | null) => (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).includes(origin || "");
const validTicketNumbers = (tickets: unknown): tickets is number[] => Array.isArray(tickets) && tickets.length >= 1 && tickets.length <= 10 && tickets.every(ticket => Number.isSafeInteger(ticket) && ticket > 0) && new Set(tickets).size === tickets.length;

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    const origin = req.headers.get("origin");
    if (!permittedOrigin(origin)) return Response.json({ error: "origin_not_allowed" }, { status: 403, headers: securityHeaders });
    const headers = { ...corsHeaders(origin!), ...securityHeaders };
    const respond = (body: unknown, status: number) => Response.json(body, { status, headers });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
    try {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await req.json();
        if (payload.action !== "quote" || typeof payload.raffleId !== "string" || !validTicketNumbers(payload.tickets)) return respond({ error: "invalid_request" }, 400);
        const { data, error } = await ctx.supabaseAdmin.rpc("create_checkout_quote", { p_raffle_id: payload.raffleId, p_ticket_numbers: payload.tickets });
        if (error || !data?.[0]) return respond({ error: "tickets_unavailable" }, 409);
        return respond(data[0], 200);
      }
      const form = await req.formData(), quoteId = String(form.get("quoteId") || ""), requestId = String(form.get("requestId") || ""), receipt = form.get("receipt");
      if (!(receipt instanceof File) || !["image/jpeg","image/png","application/pdf"].includes(receipt.type) || receipt.size < 1 || receipt.size > 10 * 1024 * 1024) return respond({ error: "invalid_receipt" }, 400);
      const ext = receipt.type === "application/pdf" ? "pdf" : receipt.type === "image/png" ? "png" : "jpg", receiptPath = `orders/${quoteId}/${crypto.randomUUID()}.${ext}`;
      const upload = await ctx.supabaseAdmin.storage.from("payment-receipts").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
      if (upload.error) throw upload.error;
      const { data, error } = await ctx.supabaseAdmin.rpc("submit_checkout_order", { p_quote_id: quoteId, p_request_id: requestId, p_name: String(form.get("name") || ""), p_email: String(form.get("email") || ""), p_phone: String(form.get("phone") || ""), p_receipt_path: receiptPath });
      if (error || !data?.[0]) { await ctx.supabaseAdmin.storage.from("payment-receipts").remove([receiptPath]); return respond({ error: "quote_expired" }, 409); }
      return respond({ orderId: data[0].order_id, status: data[0].status }, 200);
    } catch (error) { console.error(error); return respond({ error: "checkout_failed" }, 500); }
  }),
};
