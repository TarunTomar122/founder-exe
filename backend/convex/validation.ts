import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const eventType = v.union(v.literal("view"), v.literal("cta_click"), v.literal("form_start"), v.literal("signup"), v.literal("composer_opened"));

export const recordEvent = internalMutation({
  args: { campaignKey: v.string(), type: eventType, platform: v.optional(v.string()), contentId: v.optional(v.string()), utmSource: v.optional(v.string()), utmMedium: v.optional(v.string()), utmCampaign: v.optional(v.string()), utmContent: v.optional(v.string()), referrer: v.optional(v.string()), visitorKey: v.optional(v.string()), rateKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.query("campaigns").withIndex("by_public_key", q => q.eq("publicKey", args.campaignKey)).unique();
    if (!campaign) throw new Error("UNKNOWN_CAMPAIGN");
    const now = Date.now();
    if (args.rateKey) {
      const limit = await ctx.db.query("rateLimits").withIndex("by_key", q => q.eq("key", args.rateKey!)).unique();
      if (limit && limit.expiresAt > now && limit.count >= 120) throw new Error("RATE_LIMITED");
      if (limit && limit.expiresAt > now) await ctx.db.patch(limit._id, { count: limit.count + 1, updatedAt: now });
      else if (limit) await ctx.db.patch(limit._id, { count: 1, expiresAt: now + 60 * 60 * 1000, updatedAt: now });
      else await ctx.db.insert("rateLimits", { key: args.rateKey, count: 1, expiresAt: now + 60 * 60 * 1000, updatedAt: now });
    }
    const { campaignKey: _, rateKey: __, ...event } = args;
    await ctx.db.insert("validationEvents", { campaignId: campaign._id, ...event, createdAt: now });
    return { ok: true };
  },
});

export const recordLead = internalMutation({
  args: { campaignKey: v.string(), email: v.string(), answer: v.optional(v.string()), utmSource: v.optional(v.string()), utmMedium: v.optional(v.string()), utmCampaign: v.optional(v.string()), utmContent: v.optional(v.string()), referrer: v.optional(v.string()), visitorKey: v.optional(v.string()), rateKey: v.string() },
  handler: async (ctx, args) => {
    const campaign = await ctx.db.query("campaigns").withIndex("by_public_key", q => q.eq("publicKey", args.campaignKey)).unique();
    if (!campaign) throw new Error("UNKNOWN_CAMPAIGN");
    const now = Date.now();
    const limit = await ctx.db.query("rateLimits").withIndex("by_key", q => q.eq("key", args.rateKey)).unique();
    if (limit && limit.expiresAt > now && limit.count >= 8) throw new Error("RATE_LIMITED");
    if (limit && limit.expiresAt > now) await ctx.db.patch(limit._id, { count: limit.count + 1, updatedAt: now });
    else if (limit) await ctx.db.patch(limit._id, { count: 1, expiresAt: now + 60 * 60 * 1000, updatedAt: now });
    else await ctx.db.insert("rateLimits", { key: args.rateKey, count: 1, expiresAt: now + 60 * 60 * 1000, updatedAt: now });
    const normalizedEmail = args.email.trim().toLowerCase();
    const existing = await ctx.db.query("waitlistLeads").withIndex("by_campaign_email", q => q.eq("campaignId", campaign._id).eq("normalizedEmail", normalizedEmail)).unique();
    if (existing) return { ok: true, duplicate: true };
    await ctx.db.insert("waitlistLeads", { campaignId: campaign._id, email: args.email.trim(), normalizedEmail, answer: args.answer?.trim().slice(0, 1000), utmSource: args.utmSource, utmMedium: args.utmMedium, utmCampaign: args.utmCampaign, utmContent: args.utmContent, referrer: args.referrer, createdAt: now });
    await ctx.db.insert("validationEvents", { campaignId: campaign._id, type: "signup", utmSource: args.utmSource, utmMedium: args.utmMedium, utmCampaign: args.utmCampaign, utmContent: args.utmContent, referrer: args.referrer, visitorKey: args.visitorKey, createdAt: now });
    return { ok: true, duplicate: false };
  },
});
