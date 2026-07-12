"use node";
import DodoPayments from "dodopayments";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

export const createCheckout = action({
  args: { ownerKey: v.string(), returnUrl: v.string() },
  handler: async (ctx, args): Promise<{ checkoutUrl: string }> => {
    const access = await ctx.runQuery(internal.billing.getPlanInternal, { ownerKey: args.ownerKey });
    if (access.paid) throw new Error("ALREADY_PREMIUM");
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    const productId = process.env.DODO_PAYMENTS_PRODUCT_ID;
    if (!apiKey || !productId) throw new Error("DODO_NOT_CONFIGURED");
    const environment = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
    const client = new DodoPayments({ bearerToken: apiKey, environment });
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: args.returnUrl,
      cancel_url: args.returnUrl,
      metadata: { founder_owner_key: args.ownerKey },
      short_link: false,
    });
    if (!session.checkout_url) throw new Error("DODO_CHECKOUT_URL_MISSING");
    return { checkoutUrl: session.checkout_url };
  },
});
