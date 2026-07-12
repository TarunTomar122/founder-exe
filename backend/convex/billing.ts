import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getOwnerAccess } from "./billingRules";

export const getPlan = query({
  args: { ownerKey: v.string() },
  handler: (ctx, args) => getOwnerAccess(ctx, args.ownerKey),
});

export const getPlanInternal = internalQuery({
  args: { ownerKey: v.string() },
  handler: (ctx, args) => getOwnerAccess(ctx, args.ownerKey),
});

export const activateInternalBypass = mutation({
  args: { ownerKey: v.string() },
  handler: async (ctx, args) => {
    const access = await getOwnerAccess(ctx, args.ownerKey);
    if (!access.canBypass) throw new Error("BILLING_BYPASS_NOT_ALLOWED");
    const existing = await ctx.db.query("billingOverrides").withIndex("by_owner", q => q.eq("ownerKey", args.ownerKey)).first();
    if (existing) await ctx.db.patch(existing._id, { active: true, reason: "internal_testing", updatedAt: Date.now() });
    else await ctx.db.insert("billingOverrides", { ownerKey: args.ownerKey, active: true, reason: "internal_testing", createdAt: Date.now(), updatedAt: Date.now() });
    return { ok: true };
  },
});

export const recordDodoWebhook = internalMutation({
  args: {
    eventId: v.string(), ownerKey: v.string(), eventType: v.string(), subscriptionId: v.string(),
    customerId: v.optional(v.string()), productId: v.string(), status: v.string(), currentPeriodEnd: v.optional(v.string()), payload: v.string(),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("billingWebhookEvents").withIndex("by_event", q => q.eq("eventId", args.eventId)).unique();
    if (duplicate) return { duplicate: true };
    const now = Date.now();
    await ctx.db.insert("billingWebhookEvents", { eventId: args.eventId, eventType: args.eventType, payload: args.payload, createdAt: now });
    const existing = await ctx.db.query("subscriptions").withIndex("by_subscription", q => q.eq("dodoSubscriptionId", args.subscriptionId)).unique();
    const value = { ownerKey: args.ownerKey, dodoSubscriptionId: args.subscriptionId, customerId: args.customerId, productId: args.productId, status: args.status, currentPeriodEnd: args.currentPeriodEnd, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("subscriptions", { ...value, createdAt: now });
    return { duplicate: false };
  },
});
