export type AgentKey = "founder" | "research" | "landing_page" | "go_to_market";
export type RuntimeStatus = "ready" | "queued" | "working" | "complete" | "error";
export type WorkflowStage =
  | "discovery"
  | "research"
  | "research_ready"
  | "building"
  | "cross_review"
  | "launch_ready"
  | "launched"
  | "measuring"
  | "complete";

export type RunTrace = {
  prompt: string;
  attemptPrompts: string[];
  response: string;
  model: string | null;
  provider: string | null;
  sessionIds: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  apiCallCount: number;
  toolCallCount: number;
  attemptCount: number;
};

export type RunCommand = {
  _id: string;
  message: string;
  rootRequest?: string;
  context: Array<{ role: "user" | "assistant"; content: string }>;
  reviewRound?: number;
  taskType?: "orchestrate" | "create" | "peer_review" | "revise" | "synthesize" | "measure";
  stage?: WorkflowStage;
  inputArtifactIds?: string[];
  createdAt: number;
  updatedAt: number;
};

export type Run = {
  _id: string;
  commandId: string;
  agentKey: AgentKey;
  parentRunId?: string;
  reviewRound?: number;
  taskType?: RunCommand["taskType"];
  stage?: WorkflowStage;
  inputArtifactIds?: string[];
  status: "pending" | "running" | "succeeded" | "failed";
  summary?: string;
  error?: string;
  latencyMs?: number;
  queuedAt?: number;
  trace?: RunTrace;
  command?: RunCommand;
  startedAt: number;
  completedAt?: number;
};

export type Message = {
  _id: string;
  role: "user" | "assistant";
  agentKey?: AgentKey;
  audience?: "user" | "internal";
  content: string;
  createdAt: number;
};

export type ReviewFinding = {
  _id: string;
  runId: string;
  reviewerAgent: AgentKey;
  targetAgent: AgentKey;
  targetArtifactId?: string;
  targetArtifactKind: string;
  severity: "note" | "material" | "blocking";
  feedback: string;
  acceptanceCriteria: string;
  round: number;
  status: "open" | "resolved" | "accepted";
  createdAt: number;
};

export type Campaign = {
  _id: string;
  publicKey: string;
  status: "draft" | "ready" | "live" | "paused" | "complete";
  landingUrl?: string;
};

export type ValidationSummary = {
  views: number;
  uniqueVisitors: number;
  ctaClicks: number;
  signups: number;
  conversionRate: number;
  bySource: Array<{ source: string; views: number; signups: number }>;
};

export type Artifact = {
  _id: string;
  runId: string;
  kind: string;
  title: string;
  content: string;
  data?: Record<string, any>;
  version?: number;
  status?: "current" | "superseded";
  supersedesId?: string;
  sourceUrls: string[];
  createdAt: number;
};

export type Project = {
  _id: string;
  name: string;
  description?: string;
  isShowcase?: boolean;
  createdAt: number;
  conversations: Array<{ _id: string; title: string; status: string; createdAt: number; updatedAt: number }>;
};

export type BillingPlan = {
  plan: "free" | "builder" | "internal";
  status: string;
  used: number;
  limit: number;
  remaining: number;
  canCreate: boolean;
  canBypass: boolean;
  bypassActive: boolean;
  nextBillingDate?: string;
};

export type SiteView = { title: string; url?: string; html?: string };

export type StageKey = "idea" | "research" | "gtm" | "landing" | "signals" | "team";

export type AgentMeta = {
  key: AgentKey;
  name: string;
  role: string;
  avatar: string;
  description: string;
};

export const AGENTS: AgentMeta[] = [
  {
    key: "founder",
    name: "Founder",
    role: "Manager",
    avatar: "/agents/founder_agent.png",
    description:
      "Runs the company. Asks you the sharp questions, hands work to the right specialist, and returns one clear answer.",
  },
  {
    key: "research",
    name: "Research",
    role: "Market intel",
    avatar: "/agents/research_agent.png",
    description:
      "Reads the live market. Maps your closest competitors and only keeps claims it can back with a real source.",
  },
  {
    key: "landing_page",
    name: "Landing",
    role: "Page builder",
    avatar: "/agents/product_agent.png",
    description:
      "Picks an approved template and writes your complete landing page — headline, sections, and final copy.",
  },
  {
    key: "go_to_market",
    name: "GTM",
    role: "Distribution",
    avatar: "/agents/growth_agent.png",
    description:
      "Plans the launch. Builds the channel strategy and writes the platform-specific posts to ship it.",
  },
];

export const TASK_BRIEFS: Record<AgentKey, string> = {
  founder: "read everything the team made and bring back one clear answer",
  research: "map the closest competitors and bring back cited proof",
  landing_page: "pick an approved template and write the full page",
  go_to_market: "plan the launch and draft the platform posts",
};

export const THINKING: Record<AgentKey, string> = {
  founder: "Reading the team's work, deciding what actually matters.",
  research: "Reading live sources, keeping only claims it can cite.",
  landing_page: "Choosing a template, writing the final copy.",
  go_to_market: "Sequencing the launch, drafting the posts.",
};

export const STAGE_ORDER: WorkflowStage[] = [
  "discovery",
  "research",
  "research_ready",
  "building",
  "cross_review",
  "launch_ready",
  "launched",
  "measuring",
  "complete",
];

export const MISSIONS: Array<{ id: string; label: string; text: string }> = [
  {
    id: "market",
    label: "Map my market",
    text: "research my closest competitors, identify an honest positioning gap, and give me a cited recommendation.",
  },
  {
    id: "landing",
    label: "Build a landing page",
    text: "research the audience, select the best approved template, and create a complete landing-page brief with final copy.",
  },
  {
    id: "launch",
    label: "Plan my launch",
    text: "create a two-week go-to-market strategy and platform-specific launch posts for my product.",
  },
];

export function agentFor(key: AgentKey): AgentMeta {
  return AGENTS.find(agent => agent.key === key) ?? AGENTS[0];
}

export function formatTime(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

export function formatDuration(milliseconds?: number) {
  if (!milliseconds) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds > 10_000 ? 0 : 1)}s`;
}

export function formatRelative(timestamp?: number) {
  if (!timestamp) return "—";
  const delta = Date.now() - timestamp;
  if (delta < 45_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

export function formatTokens(value?: number) {
  if (!value) return "0";
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}k` : String(value);
}

export function formatCost(run: Run) {
  const value = run.trace?.actualCostUsd ?? run.trace?.estimatedCostUsd;
  return value == null ? "—" : `$${value.toFixed(4)}`;
}

export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function saveTextFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function statusFor(agent: AgentKey, runs: Run[]): RuntimeStatus {
  const run = [...runs].reverse().find(item => item.agentKey === agent);
  if (!run) return "ready";
  if (run.status === "pending") return "queued";
  if (run.status === "running") return "working";
  if (run.status === "failed") return "error";
  return "complete";
}

export function runStateWord(run: Run): RuntimeStatus {
  if (run.status === "pending") return "queued";
  if (run.status === "running") return "working";
  if (run.status === "failed") return "error";
  return "complete";
}

export function runLabel(run: Run) {
  const inputCount = run.command?.inputArtifactIds?.length ?? run.inputArtifactIds?.length ?? 0;
  if (run.taskType === "peer_review")
    return `review ${inputCount} team output${inputCount === 1 ? "" : "s"}`;
  if (run.taskType === "revise") return `revise ${TASK_BRIEFS[run.agentKey]}`;
  if (run.taskType === "synthesize")
    return run.stage === "research_ready" ? "brief the user on market evidence" : "final campaign review";
  if (!run.parentRunId)
    return run.agentKey === "founder" ? "understand the idea + assign the team" : TASK_BRIEFS[run.agentKey];
  return run.agentKey === "founder" ? TASK_BRIEFS.founder : TASK_BRIEFS[run.agentKey];
}

export function taskLine(agent: AgentKey, runs: Run[]) {
  const run = [...runs].reverse().find(item => item.agentKey === agent);
  if (!run) return "Waiting for the first mission.";
  if (run.status === "pending") return "Queued — waiting for a free desk in the cloud.";
  if (run.status === "running") return THINKING[agent];
  if (run.status === "failed")
    return run.error ? `Hit a problem: ${run.error.slice(0, 90)}` : "Hit a problem on the last task.";
  return run.summary || "Finished the last task.";
}

export function currentArtifact(artifacts: Artifact[], kind: string) {
  return (
    [...artifacts].reverse().find(artifact => artifact.kind === kind && artifact.status !== "superseded") ??
    [...artifacts].reverse().find(artifact => artifact.kind === kind)
  );
}

export function isSiteKind(kind: string) {
  return kind === "landing_page_preview" || kind === "landing_page_html";
}

export function siteFor(outputs: Artifact[], allArtifacts: Artifact[]): SiteView | null {
  const preview = outputs.find(artifact => artifact.kind === "landing_page_preview");
  const html =
    outputs.find(artifact => artifact.kind === "landing_page_html") ??
    [...allArtifacts].reverse().find(artifact => artifact.kind === "landing_page_html");
  if (!preview && !html) return null;
  return { title: preview?.title ?? html?.title ?? "Your landing page", url: preview?.sourceUrls[0], html: html?.content };
}

export function attributedLanding(url: string, platform: string, contentId: string) {
  const value = new URL(url);
  value.searchParams.set("utm_source", platform);
  value.searchParams.set("utm_medium", "organic");
  value.searchParams.set("utm_campaign", "validation");
  value.searchParams.set("utm_content", contentId);
  return value.toString();
}

export function runMarkdown(run: Run, artifacts: Artifact[]) {
  const command = run.command;
  const trace = run.trace;
  const outputs = artifacts.filter(artifact => artifact.runId === run._id);
  return `# ${agentFor(run.agentKey).name} trace\n\n- Run: ${run._id}\n- Parent: ${run.parentRunId ?? "user"}\n- Status: ${run.status}\n- Model: ${trace?.model ?? "unavailable"}\n- Duration: ${formatDuration(run.latencyMs)}\n- Tokens: ${trace ? `${trace.inputTokens} input / ${trace.outputTokens} output / ${trace.reasoningTokens} reasoning` : "unavailable"}\n- Cost: ${formatCost(run)}\n\n## Task envelope\n\n${command?.message ?? "Unavailable for this historical run."}\n\n## Conversation context\n\n${command?.context.map(item => `**${item.role}:** ${item.content}`).join("\n\n") ?? "Unavailable."}\n\n## Exact prompt\n\n\`\`\`text\n${trace?.prompt ?? "Unavailable for this historical run."}\n\`\`\`\n\n## Reply\n\n${trace?.response ?? run.summary ?? run.error ?? "No reply recorded."}\n\n## Outputs\n\n${outputs.map(output => `- ${output.kind}: ${output.title}`).join("\n") || "None"}\n`;
}

export function suggestedStage(stage?: WorkflowStage): StageKey {
  if (!stage || stage === "discovery") return "idea";
  if (["research", "research_ready"].includes(stage)) return "research";
  if (stage === "building") return "gtm";
  if (["cross_review", "launch_ready"].includes(stage)) return "landing";
  return "signals";
}

export function missionProgress(runs: Run[]) {
  if (!runs.length) return 0;
  const latestRun = runs[runs.length - 1];
  if (latestRun.status === "pending") return latestRun.agentKey === "founder" ? 18 : 42;
  if (latestRun.status === "running")
    return latestRun.agentKey === "founder" ? (latestRun.reviewRound ? 92 : 24) : 58;
  const initialFounder = runs.find(run => run.agentKey === "founder" && !run.parentRunId);
  const specialists = runs.filter(run => run.agentKey !== "founder");
  const finalFounder = [...runs].reverse().find(run => run.agentKey === "founder" && run.parentRunId);
  if (finalFounder?.status === "succeeded") return 100;
  if (finalFounder?.status === "running") return 92;
  if (specialists.length && specialists.every(run => run.status === "succeeded")) return 82;
  if (specialists.some(run => run.status === "running")) return 58;
  if (specialists.some(run => run.status === "pending")) return 42;
  if (initialFounder?.status === "succeeded") return 30;
  return 12;
}
