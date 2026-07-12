export async function getOwnerAccess(ctx: any, ownerKey: string) {
  const [companies, subscriptions, overrides] = await Promise.all([
    ctx.db.query("companies").withIndex("by_owner", (q: any) => q.eq("ownerKey", ownerKey)).collect(),
    ctx.db.query("subscriptions").withIndex("by_owner", (q: any) => q.eq("ownerKey", ownerKey)).collect(),
    ctx.db.query("billingOverrides").withIndex("by_owner", (q: any) => q.eq("ownerKey", ownerKey)).collect(),
  ]);
  const activeSubscription = [...subscriptions].reverse().find(subscription => subscription.status === "active");
  const override = [...overrides].reverse().find(item => item.active);
  const paid = Boolean(activeSubscription || override);
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const projectsThisMonth = companies.filter((company: any) => company.createdAt >= monthStart).length;
  const limit = paid ? 5 : 1;
  const used = paid ? projectsThisMonth : companies.length;
  const bypassKeys = (process.env.BILLING_BYPASS_OWNER_KEYS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT ?? "test_mode";
  const canBypass = bypassKeys.includes(ownerKey) || (environment !== "live_mode" && bypassKeys.includes("*"));
  return {
    plan: paid ? "builder" as const : "free" as const,
    paid,
    canCreate: used < limit,
    used,
    limit,
    projectsThisMonth,
    totalProjects: companies.length,
    canBypass,
    subscriptionStatus: activeSubscription?.status ?? (override ? "internal_override" : "none"),
  };
}
