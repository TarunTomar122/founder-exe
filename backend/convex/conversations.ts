import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const agentKey = v.union(v.literal("founder"), v.literal("research"), v.literal("landing_page"), v.literal("go_to_market"));
const taskType = v.union(v.literal("orchestrate"), v.literal("create"), v.literal("peer_review"), v.literal("revise"), v.literal("synthesize"), v.literal("measure"));
const workflowStage = v.union(v.literal("discovery"), v.literal("research"), v.literal("research_ready"), v.literal("building"), v.literal("cross_review"), v.literal("launch_ready"), v.literal("launched"), v.literal("measuring"), v.literal("complete"));
const runTrace = v.object({ prompt: v.string(), attemptPrompts: v.array(v.string()), response: v.string(), model: v.union(v.string(), v.null()), provider: v.union(v.string(), v.null()), sessionIds: v.array(v.string()), inputTokens: v.number(), outputTokens: v.number(), cacheReadTokens: v.number(), cacheWriteTokens: v.number(), reasoningTokens: v.number(), estimatedCostUsd: v.number(), actualCostUsd: v.union(v.number(), v.null()), apiCallCount: v.number(), toolCallCount: v.number(), attemptCount: v.number() });
const artifactResult = v.object({ kind: v.string(), title: v.string(), content: v.string(), data: v.optional(v.any()), sourceUrls: v.array(v.string()) });
const findingResult = v.object({ targetAgent: agentKey, targetArtifactKind: v.string(), severity: v.union(v.literal("note"), v.literal("material"), v.literal("blocking")), feedback: v.string(), acceptanceCriteria: v.string() });

type Agent = "founder" | "research" | "landing_page" | "go_to_market";
type Stage = "discovery" | "research" | "research_ready" | "building" | "cross_review" | "launch_ready" | "launched" | "measuring" | "complete";
type Task = "orchestrate" | "create" | "peer_review" | "revise" | "synthesize" | "measure";

async function latestArtifacts(ctx: any, conversationId: any) {
  const all = await ctx.db.query("artifacts").withIndex("by_conversation", (q: any) => q.eq("conversationId", conversationId)).collect();
  const latest = new Map<string, any>();
  for (const artifact of all) if (artifact.status !== "superseded") latest.set(artifact.kind, artifact);
  return [...latest.values()];
}

function packet(artifacts: any[]) {
  return artifacts.map(artifact => `## ${artifact.kind} v${artifact.version ?? 1}: ${artifact.title}\nArtifact ID: ${artifact._id}\nStructured data:\n${JSON.stringify(artifact.data ?? {}, null, 2)}\nNarrative:\n${artifact.content.slice(0, artifact.kind === "landing_page_html" ? 50_000 : 12_000)}\nSources: ${artifact.sourceUrls.join(", ")}`).join("\n\n");
}

async function schedule(ctx: any, args: { conversationId: any; agent: Agent; message: string; rootRequest?: string; taskType: Task; stage: Stage; inputArtifactIds?: any[]; parentRunId?: any; reviewRound?: number }) {
  await ctx.scheduler.runAfter(0, internal.conversations.enqueue, { ...args, inputArtifactIds: args.inputArtifactIds ?? [] });
}

export const bootstrap = mutation({
  args: { name: v.string(), ownerKey: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { ...args, createdAt: now });
    await Promise.all([
      ["founder", "Founder", "Orchestrator"], ["research", "Research", "Market evidence"], ["landing_page", "Landing Page", "Validation page"], ["go_to_market", "Go-to-Market", "Distribution experiments"],
    ].map(([key, name, role]) => ctx.db.insert("agents", { companyId, key: key as Agent, name, role, status: "ready", createdAt: now })));
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
      return { _id: company._id, name: company.name, createdAt: company.createdAt, conversations: conversations.map(({ _id, title, status, stage, createdAt, updatedAt }) => ({ _id, title, status, stage, createdAt, updatedAt })) };
    }));
  },
});

export const listShowcases = query({
  args: {},
  handler: async (ctx) => {
    const showcaseOwners = new Map([
      ["qa-loop-1783845762", { name: "Draftlane", description: "Reviewed launch kit · live landing page" }],
      ["trace-qa-1783848939", { name: "Trace Lab", description: "Token-level observability · approved result" }],
    ]);
    const companies = (await Promise.all([...showcaseOwners.keys()].map(ownerKey => ctx.db.query("companies").withIndex("by_owner", q => q.eq("ownerKey", ownerKey)).collect()))).flat();
    return Promise.all(companies.map(async company => {
      const conversations = await ctx.db.query("conversations").withIndex("by_company", q => q.eq("companyId", company._id)).collect();
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      const showcase = showcaseOwners.get(company.ownerKey ?? "")!;
      return { _id: company._id, name: showcase.name, description: showcase.description, isShowcase: true, createdAt: company.createdAt, conversations: conversations.map(({ _id, title, status, stage, createdAt, updatedAt }) => ({ _id, title, status, stage, createdAt, updatedAt })) };
    }));
  },
});

export const createConversation = mutation({
  args: { companyId: v.id("companies"), message: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const conversationId = await ctx.db.insert("conversations", { companyId: args.companyId, title: args.message.slice(0, 80), status: "active", stage: "discovery", createdAt: now, updatedAt: now });
    await ctx.db.insert("messages", { conversationId, role: "user", audience: "user", content: args.message, createdAt: now });
    await schedule(ctx, { conversationId, agent: "founder", message: args.message, rootRequest: args.message, taskType: "orchestrate", stage: "discovery" });
    return conversationId;
  },
});

export const sendMessage = mutation({
  args: { conversationId: v.id("conversations"), message: v.string() },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId); if (!conversation) throw new Error("Unknown conversation");
    const now = Date.now();
    await ctx.db.insert("messages", { conversationId: args.conversationId, role: "user", audience: "user", content: args.message, createdAt: now });
    await ctx.db.patch(args.conversationId, { updatedAt: now, status: "active" });
    const artifacts = await latestArtifacts(ctx, args.conversationId);
    const contextPacket = artifacts.length ? `\n\nCURRENT APPROVED/WORKING ARTIFACTS:\n${packet(artifacts)}` : "";
    await schedule(ctx, { conversationId: args.conversationId, agent: "founder", message: `${args.message}${contextPacket}`, rootRequest: args.message, taskType: "orchestrate", stage: (conversation.stage ?? "discovery") as Stage, inputArtifactIds: artifacts.map(a => a._id) });
  },
});

export const approveResearch = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId); if (!conversation || conversation.stage !== "research_ready") throw new Error("RESEARCH_NOT_READY");
    const artifacts = await latestArtifacts(ctx, args.conversationId);
    const research = artifacts.find(a => a.kind === "research_report"); if (!research) throw new Error("RESEARCH_MISSING");
    const now = Date.now();
    await ctx.db.insert("approvals", { conversationId: args.conversationId, objectType: "research_report", objectId: String(research._id), actor: "user", decision: "approved", createdAt: now });
    await ctx.db.patch(args.conversationId, { stage: "building", researchApprovedAt: now, updatedAt: now });
    let campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).first();
    if (!campaign) {
      const campaignId = await ctx.db.insert("campaigns", { conversationId: args.conversationId, publicKey: crypto.randomUUID().replaceAll("-", ""), status: "draft", createdAt: now, updatedAt: now });
      campaign = await ctx.db.get(campaignId);
    }
    await schedule(ctx, { conversationId: args.conversationId, agent: "go_to_market", message: `CREATE_VALIDATION_CAMPAIGN\nUse the user-approved research below. Create a measurable validation campaign and platform-native drafts. Use {{LANDING_URL}} wherever the eventual page URL belongs.\n\n${packet([research])}`, rootRequest: conversation.title, taskType: "create", stage: "building", inputArtifactIds: [research._id], reviewRound: 1 });
    await ctx.db.insert("events", { conversationId: args.conversationId, type: "research_approved", detail: "User approved the research; GTM started the validation campaign", createdAt: now });
    return { ok: true, campaignKey: campaign?.publicKey };
  },
});

export const approveLaunch = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId); if (!conversation || conversation.stage !== "launch_ready") throw new Error("LAUNCH_NOT_READY");
    const now = Date.now();
    await ctx.db.insert("approvals", { conversationId: args.conversationId, objectType: "launch", objectId: String(args.conversationId), actor: "user", decision: "approved", createdAt: now });
    await ctx.db.patch(args.conversationId, { stage: "launched", launchApprovedAt: now, updatedAt: now });
    const campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).first();
    if (campaign) await ctx.db.patch(campaign._id, { status: "live", updatedAt: now });
    await ctx.db.insert("events", { conversationId: args.conversationId, type: "launch_approved", detail: "User approved the validation campaign for sharing", createdAt: now });
    return { ok: true };
  },
});

export const approveContent = mutation({
  args: { conversationId: v.id("conversations"), contentId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("approvals").withIndex("by_object", q => q.eq("objectType", "content").eq("objectId", args.contentId)).filter(q => q.eq(q.field("conversationId"), args.conversationId)).first();
    if (!existing) await ctx.db.insert("approvals", { conversationId: args.conversationId, objectType: "content", objectId: args.contentId, actor: "user", decision: "approved", createdAt: Date.now() });
    return { ok: true };
  },
});

export const retryLatestFailedReview = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect();
    const failed = [...runs].reverse().find(candidate => candidate.status === "failed"); if (!failed) throw new Error("No failed task to retry");
    const command = await ctx.db.get(failed.commandId); if (!command) throw new Error("Missing failed command");
    await ctx.db.patch(args.conversationId, { status: "active", updatedAt: Date.now() });
    await schedule(ctx, { conversationId: args.conversationId, agent: command.agentKey, message: command.message, rootRequest: command.rootRequest, taskType: command.taskType ?? "create", stage: command.stage ?? "discovery", inputArtifactIds: command.inputArtifactIds ?? [], parentRunId: command.parentRunId, reviewRound: command.reviewRound ?? 0 });
  },
});

export const enqueue = internalMutation({
  args: { conversationId: v.id("conversations"), agent: agentKey, message: v.string(), taskType, stage: workflowStage, inputArtifactIds: v.array(v.id("artifacts")), parentRunId: v.optional(v.id("agentRuns")), rootRequest: v.optional(v.string()), reviewRound: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const allMessages = await ctx.db.query("messages").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect();
    const messages = allMessages.filter(message => message.audience !== "internal").slice(-20);
    const now = Date.now();
    const commandId = await ctx.db.insert("workerCommands", { conversationId: args.conversationId, agentKey: args.agent, taskType: args.taskType, stage: args.stage, inputArtifactIds: args.inputArtifactIds, message: args.message, rootRequest: args.rootRequest ?? args.message, reviewRound: args.reviewRound ?? 0, context: messages.map(({ role, content }) => ({ role, content })), parentRunId: args.parentRunId, status: "pending", createdAt: now, updatedAt: now });
    await ctx.db.insert("agentRuns", { conversationId: args.conversationId, commandId, agentKey: args.agent, taskType: args.taskType, stage: args.stage, inputArtifactIds: args.inputArtifactIds, parentRunId: args.parentRunId, reviewRound: args.reviewRound ?? 0, status: "pending", queuedAt: now, startedAt: now });
    await ctx.db.insert("events", { conversationId: args.conversationId, type: `${args.taskType}_queued`, detail: `${args.agent} queued to ${args.taskType.replace("_", " ")} during ${args.stage}`, createdAt: now });
  },
});

export const leaseNext = internalMutation({
  args: {},
  handler: async (ctx) => {
    const command = await ctx.db.query("workerCommands").withIndex("by_status", q => q.eq("status", "pending")).first(); if (!command) return null;
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", command._id)).unique();
    const campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).first();
    const now = Date.now();
    await ctx.db.patch(command._id, { status: "running", updatedAt: now }); if (run) await ctx.db.patch(run._id, { status: "running", startedAt: now });
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_started", detail: `${command.agentKey} started ${command.taskType ?? "create"}`, createdAt: now });
    return { commandId: String(command._id), conversationId: String(command.conversationId), message: command.message, agent: command.agentKey, taskType: command.taskType ?? "create", stage: command.stage, inputArtifactIds: (command.inputArtifactIds ?? []).map(String), parentRunId: command.parentRunId ? String(command.parentRunId) : undefined, rootRequest: command.rootRequest, reviewRound: command.reviewRound ?? 0, context: command.context, campaignKey: campaign?.publicKey };
  },
});

export const recordResult = internalMutation({
  args: { commandId: v.id("workerCommands"), agent: agentKey, result: v.object({ summary: v.string(), response: v.string(), artifacts: v.array(artifactResult), delegatedAgents: v.array(agentKey), reviewActions: v.array(v.object({ agent: agentKey, feedback: v.string() })), reviewFindings: v.array(findingResult), approved: v.boolean() }), latencyMs: v.number(), trace: runTrace },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId); if (!command) throw new Error("Unknown command");
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", args.commandId)).unique(); if (!run) throw new Error("Missing run");
    const now = Date.now(); const task = command.taskType ?? "create"; const stage = command.stage ?? "discovery"; const round = command.reviewRound ?? 0;
    await ctx.db.insert("agentTraces", { conversationId: command.conversationId, runId: run._id, trace: args.trace, createdAt: now });
    const compactTrace = { ...args.trace, prompt: "", attemptPrompts: [], response: "" };
    await ctx.db.patch(args.commandId, { status: "succeeded", updatedAt: now });
    await ctx.db.patch(run._id, { status: "succeeded", summary: args.result.summary, latencyMs: args.latencyMs, trace: compactTrace, completedAt: now });
    let response = args.result.response;
    if (args.agent === "founder") {
      const campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).first();
      if (campaign?.landingUrl) {
        const workerUrl = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/gi;
        response = response.replace(workerUrl, campaign.landingUrl);
        if ((task === "synthesize" || stage === "launch_ready") && !response.includes(campaign.landingUrl)) response += `\n\nVerified live page: ${campaign.landingUrl}`;
      }
    }
    await ctx.db.insert("messages", { conversationId: command.conversationId, role: "assistant", agentKey: args.agent, audience: args.agent === "founder" ? "user" : "internal", content: response, createdAt: now });

    const createdArtifacts: any[] = [];
    for (const artifact of args.result.artifacts) {
      const previous = await ctx.db.query("artifacts").withIndex("by_conversation_kind", q => q.eq("conversationId", command.conversationId).eq("kind", artifact.kind)).filter(q => q.neq(q.field("status"), "superseded")).order("desc").first();
      if (previous) await ctx.db.patch(previous._id, { status: "superseded" });
      const artifactId = await ctx.db.insert("artifacts", { conversationId: command.conversationId, runId: run._id, ...artifact, version: (previous?.version ?? 0) + 1, status: "current", supersedesId: previous?._id, createdAt: now });
      const stored = await ctx.db.get(artifactId); if (stored) createdArtifacts.push(stored);
    }
    const current = await latestArtifacts(ctx, command.conversationId);
    if (task === "revise") {
      const priorFindings = await ctx.db.query("reviewFindings").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).filter(q => q.eq(q.field("targetAgent"), args.agent)).filter(q => q.eq(q.field("status"), "open")).collect();
      for (const finding of priorFindings) await ctx.db.patch(finding._id, { status: "resolved", resolvedAt: now });
    }
    for (const finding of args.result.reviewFindings) {
      const target = current.find(artifact => artifact.kind === finding.targetArtifactKind);
      await ctx.db.insert("reviewFindings", { conversationId: command.conversationId, runId: run._id, reviewerAgent: args.agent, targetAgent: finding.targetAgent, targetArtifactId: target?._id, targetArtifactKind: finding.targetArtifactKind, severity: finding.severity, feedback: finding.feedback, acceptanceCriteria: finding.acceptanceCriteria, round, status: finding.severity === "note" ? "accepted" : "open", createdAt: now });
    }
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_completed", detail: `${args.agent} completed ${task}`, createdAt: now });
    const preview = createdArtifacts.find(artifact => artifact.kind === "landing_page_preview");
    if (preview?.sourceUrls[0]) {
      const campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).first();
      if (campaign) await ctx.db.patch(campaign._id, { landingUrl: preview.sourceUrls[0], status: "ready", updatedAt: now });
      await ctx.db.insert("events", { conversationId: command.conversationId, type: "landing_preview_deployed", detail: `Stable validation page deployed at ${preview.sourceUrls[0]}`, createdAt: now });
    }

    if (args.agent === "founder" && task === "orchestrate") {
      const revisions = args.result.reviewActions.filter(action => action.agent !== "founder");
      if (revisions.length) {
        // Reopen from the earliest affected layer so downstream work is regenerated
        // from one coherent source of truth instead of accumulating local patches.
        const priority: Agent[] = ["research", "go_to_market", "landing_page"];
        const chosen = priority.find(agent => revisions.some(action => action.agent === agent))!;
        const feedback = revisions.filter(action => action.agent === chosen).map(action => action.feedback).join("\n");
        const affected = chosen === "research" ? current.filter(a => a.kind === "research_report") : chosen === "go_to_market" ? current.filter(a => a.kind === "gtm_strategy" || a.kind === "social_posts") : current.filter(a => a.kind === "landing_page_brief" || a.kind === "landing_page_html");
        const nextStage: Stage = chosen === "research" ? "research" : chosen === "go_to_market" ? "building" : "cross_review";
        await ctx.db.patch(command.conversationId, { stage: nextStage, researchApprovedAt: chosen === "research" ? undefined : (await ctx.db.get(command.conversationId))?.researchApprovedAt, launchApprovedAt: undefined, updatedAt: now });
        const campaign = await ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).first();
        if (campaign) await ctx.db.patch(campaign._id, { status: chosen === "landing_page" ? "ready" : "draft", updatedAt: now });
        await schedule(ctx, { conversationId: command.conversationId, agent: chosen, message: `USER_UPDATE_REQUEST\nFounder translated the user's request into this revision:\n${feedback}\nReturn a complete replacement, preserve unaffected supported work, and follow the normal review loop.\n\n${packet(affected.length ? affected : current)}`, rootRequest: command.rootRequest ?? command.message, taskType: "revise", stage: nextStage, inputArtifactIds: (affected.length ? affected : current).map(a => a._id), parentRunId: run._id, reviewRound: 1 });
        await ctx.db.insert("events", { conversationId: command.conversationId, type: "user_revision_started", detail: `Founder reopened ${chosen} work from the user's update`, createdAt: now });
        return;
      }
      const requested = args.result.delegatedAgents.filter(agent => agent !== "founder");
      if (requested.length) {
        const chosen: Agent = requested.includes("research") ? "research" : requested[0] as Agent;
        const nextStage: Stage = chosen === "research" ? "research" : stage as Stage;
        await ctx.db.patch(command.conversationId, { stage: nextStage, updatedAt: now });
        await schedule(ctx, { conversationId: command.conversationId, agent: chosen, message: command.rootRequest ?? command.message, rootRequest: command.rootRequest ?? command.message, taskType: "create", stage: nextStage, inputArtifactIds: command.inputArtifactIds ?? [], parentRunId: run._id, reviewRound: 1 });
      }
      return;
    }

    if (args.agent === "research" && (task === "create" || task === "revise") && stage === "research") {
      const research = current.find(a => a.kind === "research_report"); if (!research) return;
      const open = await ctx.db.query("reviewFindings").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).filter(q => q.eq(q.field("targetArtifactKind"), "research_report")).filter(q => q.eq(q.field("status"), "open")).collect();
      for (const finding of open) await ctx.db.patch(finding._id, { status: "resolved", resolvedAt: now });
      await schedule(ctx, { conversationId: command.conversationId, agent: "go_to_market", message: `PEER_REVIEW\nReview this research for audience specificity, channel actionability, realistic validation paths, and unsupported assumptions. Return findings only; do not create GTM artifacts.\n\n${packet([research])}`, rootRequest: command.rootRequest, taskType: "peer_review", stage: "research", inputArtifactIds: [research._id], parentRunId: run._id, reviewRound: Math.max(1, round) });
      return;
    }

    if (args.agent === "go_to_market" && task === "peer_review" && stage === "research") {
      const material = args.result.reviewFindings.filter(f => f.severity !== "note");
      const research = current.find(a => a.kind === "research_report"); if (!research) return;
      if (material.length && round < 5) {
        await schedule(ctx, { conversationId: command.conversationId, agent: "research", message: `REVISION_REQUEST\nGTM found the research is not yet actionable. Resolve every finding and return a complete replacement dossier.\n${material.map((f, i) => `${i + 1}. ${f.feedback}\nAcceptance: ${f.acceptanceCriteria}`).join("\n")}\n\nPrevious research:\n${packet([research])}`, rootRequest: command.rootRequest, taskType: "revise", stage: "research", inputArtifactIds: [research._id], parentRunId: run._id, reviewRound: round + 1 });
      } else {
        await ctx.db.patch(command.conversationId, { stage: "research_ready", updatedAt: now });
        await schedule(ctx, { conversationId: command.conversationId, agent: "founder", message: `RESEARCH_READY\nExplain the decision, strongest evidence, market-size confidence, risks, and what remains assumed. Ask the user to discuss changes or approve research before campaign work begins.\n\n${packet([research])}`, rootRequest: command.rootRequest, taskType: "synthesize", stage: "research_ready", inputArtifactIds: [research._id], parentRunId: run._id, reviewRound: round });
      }
      return;
    }

    if (args.agent === "go_to_market" && (task === "create" || task === "revise") && stage === "building") {
      const gtm = current.filter(a => a.kind === "gtm_strategy" || a.kind === "social_posts"); if (!gtm.length) return;
      const research = current.find(a => a.kind === "research_report");
      await schedule(ctx, { conversationId: command.conversationId, agent: "research", message: `PEER_REVIEW\nFact-check this validation campaign against the approved research. Check audience, claims, community fit, thresholds, and whether every post is truthful. Return findings only.\n\n${packet([...(research ? [research] : []), ...gtm])}`, rootRequest: command.rootRequest, taskType: "peer_review", stage: "building", inputArtifactIds: [...(research ? [research._id] : []), ...gtm.map(a => a._id)], parentRunId: run._id, reviewRound: Math.max(1, round) });
      return;
    }

    if (args.agent === "research" && task === "peer_review" && stage === "building") {
      const material = args.result.reviewFindings.filter(f => f.severity !== "note");
      const gtm = current.filter(a => a.kind === "gtm_strategy" || a.kind === "social_posts"); const research = current.find(a => a.kind === "research_report");
      if (material.length && round < 5) {
        await schedule(ctx, { conversationId: command.conversationId, agent: "go_to_market", message: `REVISION_REQUEST\nResearch found material campaign defects. Resolve all findings and return complete GTM artifacts.\n${material.map((f, i) => `${i + 1}. ${f.feedback}\nAcceptance: ${f.acceptanceCriteria}`).join("\n")}\n\n${packet(gtm)}`, rootRequest: command.rootRequest, taskType: "revise", stage: "building", inputArtifactIds: gtm.map(a => a._id), parentRunId: run._id, reviewRound: round + 1 });
      } else {
        await schedule(ctx, { conversationId: command.conversationId, agent: "landing_page", message: `CREATE_VALIDATION_PAGE\nBuild the landing page from the approved research and reviewed campaign. The page must contain one real email waitlist form with data-founder-waitlist and an optional textarea named answer. The runtime will attach the secure submission behavior. Align every claim, promise, and CTA with these inputs.\n\n${packet([...(research ? [research] : []), ...gtm])}`, rootRequest: command.rootRequest, taskType: "create", stage: "building", inputArtifactIds: [...(research ? [research._id] : []), ...gtm.map(a => a._id)], parentRunId: run._id, reviewRound: 1 });
      }
      return;
    }

    if (args.agent === "landing_page" && (task === "create" || task === "revise")) {
      await ctx.db.patch(command.conversationId, { stage: "cross_review", updatedAt: now });
      const landing = current.filter(a => a.kind.startsWith("landing_page")); const research = current.find(a => a.kind === "research_report"); const gtm = current.filter(a => a.kind === "gtm_strategy" || a.kind === "social_posts");
      const inputs = [...(research ? [research] : []), ...gtm, ...landing];
      for (const reviewer of ["research", "go_to_market"] as const) await schedule(ctx, { conversationId: command.conversationId, agent: reviewer, message: `PEER_REVIEW\n${reviewer === "research" ? "Check every landing claim against evidence, audience fit, and positioning." : "Check message match, channel-to-page continuity, CTA, validation offer, and conversion readiness."} Return findings only.\n\n${packet(inputs)}`, rootRequest: command.rootRequest, taskType: "peer_review", stage: "cross_review", inputArtifactIds: inputs.map(a => a._id), parentRunId: run._id, reviewRound: Math.max(1, round) });
      return;
    }

    if (task === "peer_review" && stage === "cross_review" && run.parentRunId) {
      const siblings = (await ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect()).filter(candidate => candidate.parentRunId === run.parentRunId && candidate.taskType === "peer_review");
      const parent = await ctx.db.get(run.parentRunId);
      if (siblings.length >= 2 && siblings.every(candidate => candidate.status === "succeeded") && parent && !parent.synthesisQueuedAt) {
        await ctx.db.patch(parent._id, { synthesisQueuedAt: now });
        const siblingIds = siblings.map(s => s._id);
        const findings = (await ctx.db.query("reviewFindings").withIndex("by_conversation", q => q.eq("conversationId", command.conversationId)).collect()).filter(f => siblingIds.some(id => id === f.runId) && f.severity !== "note");
        const landing = current.filter(a => a.kind.startsWith("landing_page"));
        if (findings.length && round < 5) {
          await schedule(ctx, { conversationId: command.conversationId, agent: "landing_page", message: `REVISION_REQUEST\nResearch and GTM reviewed the page. Resolve every material finding while preserving approved strategy.\n${findings.map((f, i) => `${i + 1}. ${f.reviewerAgent}: ${f.feedback}\nAcceptance: ${f.acceptanceCriteria}`).join("\n")}\n\n${packet(landing)}`, rootRequest: command.rootRequest, taskType: "revise", stage: "cross_review", inputArtifactIds: landing.map(a => a._id), parentRunId: run._id, reviewRound: round + 1 });
        } else {
          await ctx.db.patch(command.conversationId, { stage: "launch_ready", updatedAt: now });
          const finalArtifacts = await latestArtifacts(ctx, command.conversationId);
          await schedule(ctx, { conversationId: command.conversationId, agent: "founder", message: `FINAL_REVIEW\nThe team completed cross-review. Give the user one clear validation plan, link the live landing page, summarize channels and safety constraints, and ask for explicit launch approval before sharing.\n\n${packet(finalArtifacts)}`, rootRequest: command.rootRequest, taskType: "synthesize", stage: "launch_ready", inputArtifactIds: finalArtifacts.map(a => a._id), parentRunId: run._id, reviewRound: round });
        }
      }
    }
  },
});

export const failCommand = internalMutation({
  args: { commandId: v.id("workerCommands"), error: v.string() },
  handler: async (ctx, args) => {
    const command = await ctx.db.get(args.commandId); if (!command) return; const now = Date.now();
    await ctx.db.patch(args.commandId, { status: "failed", error: args.error, updatedAt: now });
    const run = await ctx.db.query("agentRuns").withIndex("by_command", q => q.eq("commandId", args.commandId)).unique(); if (run) await ctx.db.patch(run._id, { status: "failed", error: args.error, completedAt: now });
    await ctx.db.insert("events", { conversationId: command.conversationId, type: "agent_failed", detail: `${command.agentKey} failed ${command.taskType ?? "task"}`, createdAt: now });
  },
});

export const getRunTrace = query({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId); if (!run) return null;
    const [stored, command, artifacts] = await Promise.all([ctx.db.query("agentTraces").withIndex("by_run", q => q.eq("runId", args.runId)).first(), ctx.db.get(run.commandId), ctx.db.query("artifacts").withIndex("by_run", q => q.eq("runId", args.runId)).collect()]);
    return { trace: stored?.trace ?? run.trace, artifacts, command: command ? { _id: command._id, agentKey: command.agentKey, taskType: command.taskType, stage: command.stage, inputArtifactIds: command.inputArtifactIds, message: command.message, rootRequest: command.rootRequest, context: command.context, reviewRound: command.reviewRound, parentRunId: command.parentRunId, status: command.status, error: command.error, createdAt: command.createdAt, updatedAt: command.updatedAt } : null };
  },
});

export const compactConversationTraces = mutation({
  args: { conversationId: v.id("conversations"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).paginate({ cursor: args.cursor ?? null, numItems: 8 });
    let moved = 0;
    for (const run of page.page) {
      if (!run.trace || (!run.trace.prompt && !run.trace.response && !run.trace.attemptPrompts.length)) continue;
      const existing = await ctx.db.query("agentTraces").withIndex("by_run", q => q.eq("runId", run._id)).first();
      if (!existing) await ctx.db.insert("agentTraces", { conversationId: args.conversationId, runId: run._id, trace: run.trace, createdAt: Date.now() });
      await ctx.db.patch(run._id, { trace: { ...run.trace, prompt: "", attemptPrompts: [], response: "" } });
      moved += 1;
    }
    return { moved, cursor: page.continueCursor, isDone: page.isDone };
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId); if (!conversation) return null; const company = await ctx.db.get(conversation.companyId);
    const [messages, runs, currentArtifacts, events, reviews, approvals, campaign] = await Promise.all([
      ctx.db.query("messages").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("agentRuns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("artifacts").withIndex("by_conversation_status", q => q.eq("conversationId", args.conversationId).eq("status", "current")).collect(),
      ctx.db.query("events").withIndex("by_conversation_created", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("reviewFindings").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("approvals").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect(),
      ctx.db.query("campaigns").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).first(),
    ]);
    const artifacts = currentArtifacts.length ? currentArtifacts : await ctx.db.query("artifacts").withIndex("by_conversation", q => q.eq("conversationId", args.conversationId)).collect();
    let validation = { views: 0, uniqueVisitors: 0, ctaClicks: 0, signups: 0, conversionRate: 0, bySource: [] as Array<{ source: string; views: number; signups: number }> };
    if (campaign) {
      const [validationEvents, leads] = await Promise.all([ctx.db.query("validationEvents").withIndex("by_campaign", q => q.eq("campaignId", campaign._id)).collect(), ctx.db.query("waitlistLeads").withIndex("by_campaign", q => q.eq("campaignId", campaign._id)).collect()]);
      const views = validationEvents.filter(e => e.type === "view"); const sources = new Map<string, { views: number; signups: number }>();
      for (const event of views) { const source = event.utmSource ?? "direct"; const item = sources.get(source) ?? { views: 0, signups: 0 }; item.views += 1; sources.set(source, item); }
      for (const lead of leads) { const source = lead.utmSource ?? "direct"; const item = sources.get(source) ?? { views: 0, signups: 0 }; item.signups += 1; sources.set(source, item); }
      validation = { views: views.length, uniqueVisitors: new Set(views.map(e => e.visitorKey).filter(Boolean)).size, ctaClicks: validationEvents.filter(e => e.type === "cta_click").length, signups: leads.length, conversionRate: views.length ? leads.length / views.length : 0, bySource: [...sources].map(([source, value]) => ({ source, ...value })) };
    }
    return { conversation, company, messages, runs, artifacts, events, reviews, approvals, campaign, validation };
  },
});
