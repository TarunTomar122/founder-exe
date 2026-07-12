import { z } from "zod";

export const AGENT_KEYS = ["founder", "research", "landing_page", "go_to_market"] as const;
export const AgentKeySchema = z.enum(AGENT_KEYS);
export type AgentKey = z.infer<typeof AgentKeySchema>;

export const ArtifactSchema = z.object({
  kind: z.enum(["research_report", "landing_page_brief", "landing_page_html", "landing_page_preview", "gtm_strategy", "social_posts", "final_response"]),
  title: z.string().min(1).max(160),
  content: z.string().min(1),
  sourceUrls: z.array(z.string().url()).max(20).default([]),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const AgentResultSchema = z.object({
  summary: z.string().min(1),
  response: z.string().min(1),
  artifacts: z.array(ArtifactSchema).default([]),
  delegatedAgents: z.array(AgentKeySchema).default([]),
  reviewActions: z.array(z.object({
    agent: AgentKeySchema.exclude(["founder"]),
    feedback: z.string().min(1).max(4_000),
  })).max(3).default([]),
  approved: z.boolean().default(false),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const RunTraceSchema = z.object({
  prompt: z.string(),
  attemptPrompts: z.array(z.string()).max(4),
  response: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  sessionIds: z.array(z.string()),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative().nullable(),
  apiCallCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  attemptCount: z.number().int().positive(),
});
export type RunTrace = z.infer<typeof RunTraceSchema>;

export const WorkerCommandSchema = z.object({
  commandId: z.string(),
  conversationId: z.string(),
  // Internal synthesis packets can contain several rich specialist artifacts.
  message: z.string().min(1).max(120_000),
  agent: AgentKeySchema,
  parentRunId: z.string().optional(),
  rootRequest: z.string().min(1).max(20_000).optional(),
  reviewRound: z.number().int().min(0).max(5).default(0),
  context: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
});
export type WorkerCommand = z.infer<typeof WorkerCommandSchema>;
