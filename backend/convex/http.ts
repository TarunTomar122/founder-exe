import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();
const validationCors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};
function validationResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...validationCors, "content-type": "application/json" } });
}
const optionalText = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
http.route({ path: "/validation/waitlist", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: validationCors })) });
http.route({ path: "/validation/event", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: validationCors })) });
http.route({ path: "/validation/waitlist", method: "POST", handler: httpAction(async (ctx, request) => {
  let body: any; try { body = await request.json(); } catch { return validationResponse({ ok: false, error: "invalid_json" }, 400); }
  if (body.website) return validationResponse({ ok: true });
  if (typeof body.campaignKey !== "string" || typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254) return validationResponse({ ok: false, error: "invalid_submission" }, 400);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  try {
    const result = await ctx.runMutation(internal.validation.recordLead, { campaignKey: body.campaignKey.slice(0, 80), email: body.email, answer: optionalText(body.answer, 1000), utmSource: optionalText(body.utmSource, 80), utmMedium: optionalText(body.utmMedium, 80), utmCampaign: optionalText(body.utmCampaign, 120), utmContent: optionalText(body.utmContent, 120), referrer: optionalText(body.referrer, 500), visitorKey: optionalText(body.visitorKey, 100), rateKey: `${body.campaignKey.slice(0, 80)}:${ip}:${new Date().toISOString().slice(0, 13)}` });
    return validationResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "submission_failed";
    return validationResponse({ ok: false, error: message.includes("RATE_LIMITED") ? "rate_limited" : "submission_failed" }, message.includes("RATE_LIMITED") ? 429 : 400);
  }
}) });
http.route({ path: "/validation/event", method: "POST", handler: httpAction(async (ctx, request) => {
  let body: any; try { body = await request.json(); } catch { return validationResponse({ ok: false }, 400); }
  if (typeof body.campaignKey !== "string" || !["view", "cta_click", "form_start", "composer_opened"].includes(body.type)) return validationResponse({ ok: false }, 400);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  try { await ctx.runMutation(internal.validation.recordEvent, { campaignKey: body.campaignKey.slice(0, 80), type: body.type, platform: optionalText(body.platform, 40), contentId: optionalText(body.contentId, 120), utmSource: optionalText(body.utmSource, 80), utmMedium: optionalText(body.utmMedium, 80), utmCampaign: optionalText(body.utmCampaign, 120), utmContent: optionalText(body.utmContent, 120), referrer: optionalText(body.referrer, 500), visitorKey: optionalText(body.visitorKey, 100), rateKey: `${body.campaignKey.slice(0, 80)}:events:${ip}:${new Date().toISOString().slice(0, 13)}` }); }
  catch { return validationResponse({ ok: false }, 400); }
  return validationResponse({ ok: true });
}) });
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
export default http;
