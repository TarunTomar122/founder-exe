import { httpRouter } from "convex/server";
import { Webhook } from "standardwebhooks";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();
http.route({ path: "/worker/lease", method: "GET", handler: httpAction(async (ctx, request) => {
  if (request.headers.get("x-worker-secret") !== process.env.WORKER_SIGNING_SECRET) return new Response("Unauthorized", { status: 401 });
  return Response.json({ command: await ctx.runMutation(internal.conversations.leaseNext, {}) });
}) });
http.route({ path: "/worker/result", method: "POST", handler: httpAction(async (ctx, request) => {
  if (request.headers.get("x-worker-secret") !== process.env.WORKER_SIGNING_SECRET) return new Response("Unauthorized", { status: 401 });
  const body = await request.json();
  await ctx.runMutation(internal.conversations.recordResult, body);
  return Response.json({ ok: true });
}) });
http.route({ path: "/worker/failure", method: "POST", handler: httpAction(async (ctx, request) => {
  if (request.headers.get("x-worker-secret") !== process.env.WORKER_SIGNING_SECRET) return new Response("Unauthorized", { status: 401 });
  await ctx.runMutation(internal.conversations.failCommand, await request.json());
  return Response.json({ ok: true });
}) });
http.route({ path: "/billing/dodo", method: "POST", handler: httpAction(async (ctx, request) => {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!secret) return new Response("Billing webhook is not configured", { status: 503 });
  const payload = await request.text();
  const eventId = request.headers.get("webhook-id") ?? "";
  try {
    new Webhook(secret).verify(payload, {
      "webhook-id": eventId,
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    });
  } catch {
    return new Response("Invalid webhook signature", { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(payload); }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  const data = event?.data;
  const ownerKey = data?.metadata?.founder_owner_key;
  if (!eventId || !event?.type || !ownerKey || !data?.subscription_id || !data?.product_id || !data?.status) {
    return new Response("Missing subscription metadata", { status: 400 });
  }
  await ctx.runMutation(internal.billing.recordDodoWebhook, {
    eventId,
    ownerKey,
    eventType: event.type,
    subscriptionId: data.subscription_id,
    customerId: data.customer?.customer_id,
    productId: data.product_id,
    status: data.status,
    currentPeriodEnd: data.next_billing_date,
    payload,
  });
  return Response.json({ ok: true });
}) });
export default http;
