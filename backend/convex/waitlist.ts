import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Preserve the existing waitlist API while this codebase shares its deployment.
export const join = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const email = args.email.trim();
    const normalizedEmail = email.toLowerCase();
    const existing = await ctx.db.query("waitlist").withIndex("by_normalized_email", q => q.eq("normalizedEmail", normalizedEmail)).unique();
    if (existing) return { created: false, id: existing._id };
    const id = await ctx.db.insert("waitlist", { email, normalizedEmail, createdAt: Date.now(), source: args.source ?? "founder-exe-waitlist" });
    return { created: true, id };
  },
});
