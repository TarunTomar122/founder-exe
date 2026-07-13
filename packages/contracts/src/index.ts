import { z } from "zod";

export const AGENT_KEYS = ["founder", "research", "landing_page", "go_to_market"] as const;
export const AgentKeySchema = z.enum(AGENT_KEYS);
export type AgentKey = z.infer<typeof AgentKeySchema>;

export const TASK_TYPES = ["orchestrate", "create", "peer_review", "revise", "synthesize", "measure"] as const;
export const TaskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const WORKFLOW_STAGES = ["discovery", "research", "research_ready", "building", "cross_review", "launch_ready", "launched", "measuring", "complete"] as const;
export const WorkflowStageSchema = z.enum(WORKFLOW_STAGES);
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

const SourceBoundSchema = z.object({
  sourceUrls: z.array(z.string().url()).max(12).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

export const ResearchDataSchema = z.object({
  verdict: z.enum(["promising", "needs_reframing", "weak_evidence"]),
  decision: z.string(),
  executiveSummary: z.string(),
  icp: z.object({ segment: z.string(), problem: z.string(), trigger: z.string(), currentAlternative: z.string() }),
  marketSize: z.array(SourceBoundSchema.extend({ label: z.enum(["TAM", "SAM", "reachable"]), valueLow: z.number().nonnegative(), valueBase: z.number().nonnegative(), valueHigh: z.number().nonnegative(), currency: z.string(), period: z.string(), formula: z.string() })).max(3).default([]),
  competitors: z.array(z.object({ name: z.string(), audience: z.string(), promise: z.string(), pricing: z.string(), proof: z.string(), gap: z.string(), sourceUrls: z.array(z.string().url()).max(6) })).max(12),
  signals: z.array(SourceBoundSchema.extend({ theme: z.string(), evidence: z.string() })).max(12),
  positioning: z.object({ category: z.string(), gap: z.string(), promise: z.string(), risks: z.array(z.string()).max(8) }),
  assumptions: z.array(z.object({ assumption: z.string(), impact: z.enum(["low", "medium", "high"]), evidenceStrength: z.enum(["none", "weak", "moderate", "strong"]), nextTest: z.string() })).max(12),
  communities: z.array(z.object({ name: z.string(), platform: z.string(), url: z.string().url(), fit: z.string(), rulesSummary: z.string(), promotionRisk: z.enum(["low", "medium", "high"]), sourceUrls: z.array(z.string().url()).max(4) })).max(12).default([]),
});

export const GtmDataSchema = z.object({
  hypothesis: z.string(),
  audience: z.string(),
  offer: z.string(),
  conversionEvent: z.string(),
  messageHierarchy: z.array(z.string()).min(1).max(8),
  channels: z.array(z.object({ platform: z.enum(["reddit", "x", "linkedin", "whatsapp", "product_hunt", "hacker_news", "other"]), community: z.string().optional(), rationale: z.string(), intent: z.number().min(0).max(10), reachability: z.number().min(0).max(10), feedbackSpeed: z.number().min(0).max(10), promotionRisk: z.enum(["low", "medium", "high"]), rulesSummary: z.string(), sourceUrls: z.array(z.string().url()).max(6) })).min(1).max(4),
  experiments: z.array(z.object({ day: z.number().int().min(1).max(30), platform: z.string(), action: z.string(), asset: z.string(), cta: z.string(), metric: z.string(), successThreshold: z.string(), stopCondition: z.string(), learningGoal: z.string() })).min(1).max(20),
  posts: z.array(z.object({ id: z.string(), platform: z.enum(["reddit", "x", "linkedin", "whatsapp", "product_hunt", "hacker_news", "other"]), community: z.string().optional(), title: z.string().default(""), body: z.string(), cta: z.string(), ruleNotes: z.string(), risk: z.enum(["low", "medium", "high"]), variant: z.string() })).min(1).max(24),
  thresholds: z.object({ continue: z.string(), revise: z.string(), stop: z.string() }),
});

export const LandingBriefDataSchema = z.object({
  templateId: z.string(), audience: z.string(), promise: z.string(), primaryCta: z.string(), waitlistQuestion: z.string(), claimSources: z.array(z.object({ claim: z.string(), sourceUrls: z.array(z.string().url()) })).default([]), sections: z.array(z.string()), acceptanceCriteria: z.array(z.string()),
});

export const ArtifactSchema = z.object({
  kind: z.enum(["research_report", "landing_page_brief", "landing_page_html", "landing_page_preview", "gtm_strategy", "social_posts", "peer_review", "validation_report", "final_response"]),
  title: z.string().min(1).max(160),
  content: z.string().min(1),
  sourceUrls: z.array(z.string().url()).max(20).default([]),
  data: z.record(z.unknown()).optional(),
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
  reviewFindings: z.array(z.object({
    targetAgent: AgentKeySchema.exclude(["founder"]),
    targetArtifactKind: z.string(),
    severity: z.enum(["note", "material", "blocking"]),
    feedback: z.string().min(1).max(4_000),
    acceptanceCriteria: z.string().min(1).max(2_000),
  })).max(12).default([]),
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
  taskType: TaskTypeSchema.default("create"),
  stage: WorkflowStageSchema.optional(),
  inputArtifactIds: z.array(z.string()).max(30).default([]),
  campaignKey: z.string().optional(),
  waitlistEndpoint: z.string().url().optional(),
  context: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
});
export type WorkerCommand = z.infer<typeof WorkerCommandSchema>;
