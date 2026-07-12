import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const agentKey = v.union(v.literal("founder"), v.literal("research"), v.literal("landing_page"), v.literal("go_to_market"));

export const bootstrap = mutation({
  args: { name: v.string(), ownerKey: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { ...args, createdAt: now });
    await Promise.all([
      ["founder", "Founder", "Orchestrator"], ["research", "Research", "Competitor analysis"], ["landing_page", "Landing Page", "Template-aware page generation"], ["go_to_market", "Go-to-Market", "Launch strategy and social posts"],
    ].map(([key, name, role]) => ctx.db.insert("agents", { companyId, key: key as "founder" | "research" | "landing_page" | "go_to_market", name, role, status: "ready", createdAt: now })));
    return companyId;
  },
});

export const listProjects = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, args) => {
    const companies = await ctx.db.query("companies").withIndex("by_owner", q => q.eq("ownerKey", args.ownerKey)).collect();
    return Promise.all(companies.map(async company => {
      const conversations = await ctx.db.query("conversations").withIndex("by_company", q => q.eq("companyId", company._id)).collect();
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        _id: company._id,
        name: company.name,
        createdAt: company.createdAt,
        conversations: conversations.map(({ _id, title, status, createdAt, updatedAt }) => ({ _id, title, status, createdAt, updatedAt })),
      };
    }));
  },
});

export const listShowcases = query({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").withIndex("by_owner", q => q.eq("ownerKey", "qa-loop-1783845762")).collect();
    return Promise.all(companies.map(async company => {
      const conversations = await ctx.db.query("conversations").withIndex("by_company", q => q.eq("companyId", company._id)).collect();
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      return {
        _id: company._id,
        name: "Draftlane",
        description: "Reviewed launch kit · 3 manager rounds · live landing page",
        isShowcase: true,
        createdAt: company.createdAt,
        conversations: conversations.map(({ _id, title, status, createdAt, updatedAt }) => ({ _id, title, status, createdAt, updatedAt })),
      };
    }));
  },
});

export const createConversation = mutation({
  args: { companyId: v.id("companies"), message: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", { companyId: args.companyId, title: args.message.slice(0, 80), status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("messages", { conversationId, role: "user", content: args.message, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.conversations.enqueue, { conversationId, agent: "founder", message: args.message });
    return conversationId;
  },
});

export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), message: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("messages", { conversationId: args.conversationId, role: "user", content: args.message, createdAt: now });
    await ctx.db.patch(args.conversationId, { updatedAt: now, status: "active" });
    await ctx.scheduler.runAfter(0, internal.conversations.enqueue, { conversationId: args.conversationId, agent: "founder", message: args.message });
  },
});

export const retryLatestFailedReview = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect();
    const failed = [...runs].reverse().find(candidate => candidate.agentKey === "founder" && candidate.status === "failed" && (candidate.reviewRound ?? 0) > 0);
    if (!failed) throw new Error("No failed Founder review to retry");
    const command = await ctx.db.get(failed.commandId);
    if (!command) throw new Error("Missing failed review command");
    await ctx.db.patch(args.conversationId, { status: "active", updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.conversations.enqueue, {
      conversationId: args.conversationId,
      agent: "founder",
      message: command.message,
      rootRequest: command.rootRequest ?? command.message,
      reviewRound: command.reviewRound ?? 1,
      parentRunId: command.parentRunId,
    });
  },
});

export const enqueue = internalMutation({
  args: { conversationId: v.id("conversations"), agent: agentKey, message: v.string(), parentRunId: v.optional(v.id("agentRuns")), rootRequest: v.optional(v.string()), reviewRound: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const allMessages = await ctx.db.query("messages").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect();
    const messages = allMessages.slice(-20);
    const now = Date.now();
    const reviewRound = args.reviewRound ?? 0;
    const commandId = await ctx.db.insert("workerCommands", { conversationId: args.conversationId, agentKey: args.agent, message: args.message, rootRequest: args.rootRequest ?? args.message, reviewRound, context: messages.map(({ role, content }) => ({ role, content })), parentRunId: args.parentRunId, status: "pending", createdAt: now, updatedAt: now });
    await ctx.db.insert("agentRuns", { conversationId: args.conversationId, commandId, agentKey: args.agent, parentRunId: args.parentRunId, reviewRound, status: "pending", startedAt: now });
    await ctx.db.insert("events", { conversationId: args.conversationId, type: reviewRound ? "agent_revision_queued" : "agent_queued", detail: `${args.agent} queued${reviewRound ? ` for review round ${reviewRound}` : ""}`, createdAt: now });
  },
});

export const leaseNext = internalMutation({
  args: {},
  handler: async (ctx) => {
    const command = await ctx.db.query("workerCommands").withIndex("by_status", q => q.eq("status", "pending")).first();
    if (!command) return null;
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", command._id)).unique();
    const now = Date.now();
    await ctx.db.patch(command._id, { status: "running", updatedAt: now });
    if (run) await ctx.db.patch(run._id, { status: "running", startedAt: now });
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_started", detail: `${command.agentKey} started`, createdAt: now });
    return { commandId: command._id as string, conversationId: command.conversationId as string, message: command.message, agent: command.agentKey, parentRunId: command.parentRunId as string | undefined, rootRequest: command.rootRequest, reviewRound: command.reviewRound ?? 0, context: command.context };
  },
});

export const recordResult = internalMutation({
  args: { commandId: v.id("workerCommands"), agent: agentKey, result: v.object({ summary: v.string(), response: v.string(), artifacts: v.array(v.object({ kind: v.string(), title: v.string(), content: v.string(), sourceUrls: v.array(v.string()) })), delegatedAgents: v.array(agentKey), reviewActions: v.array(v.object({ agent: agentKey, feedback: v.string() })), approved: v.boolean() }), latencyMs: v.number() },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId); if (!command) throw new Error("Unknown command");
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", args.commandId)).unique(); if (!run) throw new Error("Missing run");
    const now = Date.now();
    await ctx.db.patch(args.commandId, { status: "succeeded", updatedAt: now });
    await ctx.db.patch(run._id, { status: "succeeded", summary: args.result.summary, latencyMs: args.latencyMs, completedAt: now });
    await ctx.db.insert("messages", { conversationId: command.conversationId, role: "assistant", agentKey: args.agent, content: args.result.response, createdAt: now });
    for (const artifact of args.result.artifacts) await ctx.db.insert("artifacts", { conversationId: command.conversationId, runId: run._id, ...artifact, createdAt: now });
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_completed", detail: `${args.agent} completed`, createdAt: now });
    if (args.result.artifacts.some(artifact => artifact.kind === "landing_page_preview")) await ctx.db.insert("events", { conversationId: command.conversationId, type: "landing_preview_deployed", detail: "Landing Page published a temporary Cloudflare preview", createdAt: now });
    if (args.agent === "founder" && !command.parentRunId) {
      const requested = args.result.delegatedAgents.filter(key => key !== "founder");
      const explicitlyNarrow = /\b(only|just)\b/i.test(command.message);
      const existingArtifacts = await ctx.db.query("artifacts").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect();
      const specialists = existingArtifacts.length > 0 || explicitlyNarrow || requested.length === 0 ? requested : ["research", "landing_page", "go_to_market"] as const;
      for (const specialist of [...new Set(specialists)]) {
        const relevantKinds = specialist === "research" ? new Set(["research_report"]) : specialist === "landing_page" ? new Set(["landing_page_brief", "landing_page_html", "landing_page_preview"]) : new Set(["gtm_strategy", "social_posts"]);
        const previous = existingArtifacts.filter(artifact => relevantKinds.has(artifact.kind)).slice(-3).map(artifact => `## ${artifact.kind}: ${artifact.title}\n${artifact.content.slice(0, artifact.kind === "landing_page_html" ? 40_000 : 8_000)}\nSources: ${artifact.sourceUrls.join(", ")}`).join("\n\n");
        const specialistMessage = previous ? `UPDATE_REQUEST\nUser requested:\n${command.message}\n\nExisting artifacts to revise:\n${previous}` : command.message;
        await ctx.scheduler.runAfter(0, internal.conversations.enqueue, { conversationId: command.conversationId, agent: specialist, message: specialistMessage, rootRequest: command.rootRequest ?? command.message, parentRunId: run._id });
      }
      if (existingArtifacts.length && specialists.length) await ctx.db.insert("events", { conversationId: command.conversationId, type: "user_update_delegated", detail: `Founder routed the requested update to ${[...new Set(specialists)].join(", ")}`, createdAt: now });
    }
    if (args.agent === "founder" && command.parentRunId) {
      const round = command.reviewRound ?? 1;
      const actions = round < 5 ? args.result.reviewActions.filter(action => action.agent !== "founder") : [];
      if (actions.length) {
        const artifacts = await ctx.db.query("artifacts").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect();
        for (const action of actions) {
          const relevantKinds = action.agent === "research" ? new Set(["research_report"]) : action.agent === "landing_page" ? new Set(["landing_page_brief", "landing_page_html", "landing_page_preview"]) : new Set(["gtm_strategy", "social_posts"]);
          const previous = artifacts.filter(artifact => relevantKinds.has(artifact.kind)).slice(-3).map(artifact => `## ${artifact.kind}: ${artifact.title}\n${artifact.content.slice(0, 40_000)}`).join("\n\n");
          await ctx.scheduler.runAfter(0, internal.conversations.enqueue, {
            conversationId: command.conversationId,
            agent: action.agent,
            message: `REVISION_REQUEST\nManager feedback:\n${action.feedback}\n\nPrevious output:\n${previous}`,
            rootRequest: command.rootRequest ?? command.message,
            reviewRound: round,
            parentRunId: run._id,
          });
        }
        await ctx.db.insert("events", { conversationId: command.conversationId, type: "founder_requested_revision", detail: `Founder requested ${actions.length} revision${actions.length === 1 ? "" : "s"} in round ${round}`, createdAt: now });
      } else {
        await ctx.db.patch(command.conversationId, { status: "complete", updatedAt: now });
        await ctx.db.insert("events", { conversationId: command.conversationId, type: args.result.approved ? "founder_approved" : "review_limit_reached", detail: args.result.approved ? `Founder approved the mission in round ${round}` : "Founder closed the mission at the five-round review limit", createdAt: now });
      }
    }
    if (args.agent !== "founder" && run.parentRunId) {
      const siblings = (await ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect()).filter(candidate => candidate.parentRunId === run.parentRunId);
      const parent = await ctx.db.get(run.parentRunId);
      if (siblings.length > 0 && siblings.every(candidate => candidate._id === run._id || candidate.status === "succeeded") && parent && !parent.synthesisQueuedAt) {
        await ctx.db.patch(parent._id, { synthesisQueuedAt: now });
        const artifacts = await ctx.db.query("artifacts").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect();
        const latestByKind = new Map<string, typeof artifacts[number]>();
        for (const artifact of artifacts) latestByKind.set(artifact.kind, artifact);
        const packet = [...latestByKind.values()]
          .map(artifact => `## ${artifact.kind}: ${artifact.title}\n${artifact.content.slice(0, artifact.kind === "landing_page_html" ? 40_000 : 8_000)}\nSources: ${artifact.sourceUrls.join(", ")}`)
          .join("\n\n");
        const nextRound = Math.min(5, (command.reviewRound ?? 0) + 1);
        await ctx.scheduler.runAfter(0, internal.conversations.enqueue, { conversationId: command.conversationId, agent: "founder", message: `REVIEW_PACKET\nReview round: ${nextRound} of 5\nOriginal request: ${command.rootRequest ?? command.message}\n\nLatest specialist artifacts:\n${packet}`, rootRequest: command.rootRequest ?? command.message, reviewRound: nextRound, parentRunId: parent._id });
      }
    }
  },
});

export const failCommand = internalMutation({
  args: { commandId: v.id("workerCommands"), error: v.string() },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId);
    if (!command) return;
    const now = Date.now();
    await ctx.db.patch(args.commandId, { status: "failed", error: args.error, updatedAt: now });
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", args.commandId)).unique();
    if (run) await ctx.db.patch(run._id, { status: "failed", error: args.error, completedAt: now });
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_failed", detail: `${command.agentKey} failed`, createdAt: now });
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;
    const company = await ctx.db.get(conversation.companyId);
    const [messages, runs, artifacts, events, commands] = await Promise.all([
      ctx.db.query("messages").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("artifacts").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("events").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("workerCommands").filter(q => q.eq(q.field("conversationId"), args.conversationId)).collect(),
    ]);
    return {
      conversation,
      company,
      messages,
      runs,
      artifacts,
      events,
      commands: commands.map(({ _id, agentKey, parentRunId, status, error, createdAt, updatedAt }) => ({ _id, agentKey, parentRunId, status, error, createdAt, updatedAt })),
    };
  },
});
