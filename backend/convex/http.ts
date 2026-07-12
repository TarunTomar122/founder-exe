import { httpRouter } from "convex/server";
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
export default http;
