import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const agentKey = v.union(v.literal("founder"), v.literal("research"), v.literal("landing_page"), v.literal("go_to_market"));
const commandStatus = v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("failed"));
const runTrace = v.object({ prompt: v.string(), attemptPrompts: v.array(v.string()), response: v.string(), model: v.union(v.string(), v.null()), provider: v.union(v.string(), v.null()), sessionIds: v.array(v.string()), inputTokens: v.number(), outputTokens: v.number(), cacheReadTokens: v.number(), cacheWriteTokens: v.number(), reasoningTokens: v.number(), estimatedCostUsd: v.number(), actualCostUsd: v.union(v.number(), v.null()), apiCallCount: v.number(), toolCallCount: v.number(), attemptCount: v.number() });

export default defineSchema({
  waitlist: defineTable({ email: v.string(), normalizedEmail: v.string(), createdAt: v.number(), source: v.string() }).index("by_normalized_email", ["normalizedEmail"]),
  companies: defineTable({ name: v.string(), ownerKey: v.optional(v.string()), website: v.optional(v.string()), createdAt: v.number() }).index("by_owner", ["ownerKey"]),
  agents: defineTable({ companyId: v.id("companies"), key: agentKey, name: v.string(), role: v.string(), status: v.union(v.literal("ready"), v.literal("working"), v.literal("error")), createdAt: v.number() }).index("by_company_key", ["companyId", "key"]),
  conversations: defineTable({ companyId: v.id("companies"), title: v.string(), status: v.union(v.literal("active"), v.literal("complete")), createdAt: v.number(), updatedAt: v.number() }).index("by_company", ["companyId"]),
  messages: defineTable({ conversationId: v.id("conversations"), role: v.union(v.literal("user"), v.literal("assistant")), agentKey: v.optional(agentKey), content: v.string(), createdAt: v.number() }).index("by_conversation_created", ["conversationId", "createdAt"]),
  agentRuns: defineTable({ conversationId: v.id("conversations"), commandId: v.id("workerCommands"), agentKey, parentRunId: v.optional(v.id("agentRuns")), reviewRound: v.optional(v.number()), status: commandStatus, summary: v.optional(v.string()), latencyMs: v.optional(v.number()), trace: v.optional(runTrace), error: v.optional(v.string()), synthesisQueuedAt: v.optional(v.number()), queuedAt: v.optional(v.number()), startedAt: v.number(), completedAt: v.optional(v.number()) }).index("by_conversation", ["conversationId"]).index("by_command", ["commandId"]),
  artifacts: defineTable({ conversationId: v.id("conversations"), runId: v.id("agentRuns"), kind: v.string(), title: v.string(), content: v.string(), sourceUrls: v.array(v.string()), createdAt: v.number() }).index("by_conversation", ["conversationId"]),
  events: defineTable({ conversationId: v.id("conversations"), type: v.string(), detail: v.string(), createdAt: v.number() }).index("by_conversation_created", ["conversationId", "createdAt"]),
  workerCommands: defineTable({ conversationId: v.id("conversations"), agentKey, message: v.string(), rootRequest: v.optional(v.string()), reviewRound: v.optional(v.number()), context: v.array(v.object({ role: v.union(v.literal("user"), v.literal("assistant")), content: v.string() })), parentRunId: v.optional(v.id("agentRuns")), status: commandStatus, error: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number() }).index("by_status", ["status"]),
  subscriptions: defineTable({ ownerKey: v.string(), dodoSubscriptionId: v.string(), customerId: v.optional(v.string()), productId: v.string(), status: v.string(), currentPeriodEnd: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number() }).index("by_owner", ["ownerKey"]).index("by_subscription", ["dodoSubscriptionId"]),
  billingOverrides: defineTable({ ownerKey: v.string(), active: v.boolean(), reason: v.string(), createdAt: v.number(), updatedAt: v.number() }).index("by_owner", ["ownerKey"]),
  billingWebhookEvents: defineTable({ eventId: v.string(), eventType: v.string(), payload: v.string(), createdAt: v.number() }).index("by_event", ["eventId"]),
});
