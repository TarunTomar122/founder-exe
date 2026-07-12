import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AgentResultSchema, type AgentKey, type WorkerCommand } from "@founder/contracts";
import { config } from "./config.js";
import { resultFormats, rolePrompts } from "./prompts.js";
import { searchLinkup } from "./linkup.js";
import { selectTemplates } from "./templates.js";
import { sanitizePreviewHtml } from "./cloudflare.js";

const exec = promisify(execFile);
const skillByAgent: Record<AgentKey, string> = {
  founder: "founder-orchestrator",
  research: "founder-research",
  landing_page: "founder-landing-page",
  go_to_market: "founder-go-to-market",
};

async function runtimeContext(agent: AgentKey, message: string) {
  if (agent === "founder") return "";
  const evidencePromise = searchLinkup(`${message}\nFind current products, competitors, communities, and user language relevant to this idea.`, 6);
  if (agent !== "landing_page") return `RUNTIME LINKUP EVIDENCE:\n${JSON.stringify(await evidencePromise)}`;
  const [evidence, templates] = await Promise.all([evidencePromise, selectTemplates(message)]);
  return `RUNTIME LINKUP EVIDENCE:\n${JSON.stringify(evidence)}\n\nRUNTIME TEMPLATE CANDIDATES:\n${JSON.stringify(templates)}`;
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Hermes did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export async function runHermes(agent: AgentKey, command: WorkerCommand) {
  const context = command.context.map((item) => `${item.role}: ${item.content}`).join("\n");
  const freshContext = await runtimeContext(agent, command.message);
  const reviewContext = command.reviewRound ? `This is manager review round ${command.reviewRound} of 5.` : "";
  const prompt = [`TRACE_ID: ${command.commandId}`, rolePrompts[agent], `Conversation context:\n${context}`, `Original user request:\n${command.rootRequest ?? command.message}`, `Current request:\n${command.message}`, reviewContext, freshContext, resultFormats[agent]].filter(Boolean).join("\n\n");
  const startedAt = Date.now();
  const attemptPrompts: string[] = [];
  async function invoke(currentPrompt: string) {
    attemptPrompts.push(currentPrompt);
    const args = ["--skills", skillByAgent[agent], "-t", "skills", "-z", currentPrompt];
    if (config.HERMES_MODEL) args.push("--model", config.HERMES_MODEL);
    const { stdout, stderr } = await exec(config.HERMES_BIN, args, {
      cwd: new URL("..", import.meta.url), timeout: 180_000, maxBuffer: 2_000_000,
      env: { ...process.env, LINKUP_API_KEY: config.LINKUP_API_KEY, TEMPLATE_LIBRARY_PATH: config.TEMPLATE_LIBRARY_PATH },
    });
    if (stderr.trim()) console.warn("Hermes stderr:", stderr.slice(0, 500));
    const raw = extractJson(stdout) as Record<string, unknown>;
    if (agent === "founder") {
      // Founder communicates through chat; specialist artifacts are the durable outputs.
      // Dropping its optional recap artifact prevents a harmless formatting mistake from
      // suppressing the final user-facing response after all specialist work has finished.
      raw.artifacts = [];
      if (Array.isArray(raw.reviewActions)) {
        const normalized = raw.reviewActions.flatMap((action) => {
          if (action && typeof action === "object" && "agent" in action && "feedback" in action) return [action];
          if (typeof action !== "string") return [];
          const lower = action.toLowerCase();
          const target = lower.includes("landing") || lower.includes("page") || lower.includes("html") ? "landing_page" : lower.includes("gtm") || lower.includes("social") || lower.includes("launch") ? "go_to_market" : lower.includes("research") || lower.includes("source") || lower.includes("competitor") ? "research" : null;
          return target ? [{ agent: target, feedback: action }] : [];
        });
        raw.reviewActions = normalized.slice(0, 3);
      }
    }
    return AgentResultSchema.parse(raw);
  }
  function missing(result: ReturnType<typeof AgentResultSchema.parse>) {
    const kinds = new Set(result.artifacts.map(artifact => artifact.kind));
    if (agent === "research") return kinds.has("research_report") ? [] : ["research_report"];
    if (agent === "landing_page") return ["landing_page_brief", "landing_page_html"].filter(kind => !kinds.has(kind as "landing_page_brief"));
    if (agent === "go_to_market") return ["gtm_strategy", "social_posts"].filter(kind => !kinds.has(kind as "gtm_strategy"));
    return [];
  }
  let result;
  try {
    result = await invoke(prompt);
  } catch {
    result = await invoke(`${prompt}\n\nSCHEMA REPAIR REQUIRED: Return valid JSON matching the exact role-specific shape. Do not omit required fields. For Founder clarification or delegation, use artifacts: [], reviewActions: [], approved: false.`);
  }
  const missingKinds = missing(result);
  if (missingKinds.length) result = await invoke(`${prompt}\n\nREPAIR REQUIRED: Your previous response omitted mandatory artifacts: ${missingKinds.join(", ")}. Return the exact role-specific shape now.`);
  const stillMissing = missing(result);
  if (stillMissing.length) throw new Error(`${agent} omitted mandatory artifacts after repair: ${stillMissing.join(", ")}`);
  if (agent === "landing_page") {
    const html = result.artifacts.find(artifact => artifact.kind === "landing_page_html")?.content ?? "";
    try {
      sanitizePreviewHtml(html);
    } catch (error) {
      const defect = error instanceof Error ? error.message : "HTML validation failed";
      result = await invoke(`${prompt}\n\nDETERMINISTIC HTML REVIEW FAILED: ${defect}. Repair the landing page against this exact defect. Return both mandatory landing artifacts again. Use actual newlines and never simulate a successful form submission.`);
      const repairedHtml = result.artifacts.find(artifact => artifact.kind === "landing_page_html")?.content ?? "";
      sanitizePreviewHtml(repairedHtml);
    }
  }
  const emptyUsage = { sessionIds: [], model: null, provider: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0, actualCostUsd: null, apiCallCount: 0, toolCallCount: 0 };
  let usage = emptyUsage;
  try {
    const usageScript = fileURLToPath(new URL("../scripts/hermes-usage.py", import.meta.url));
    const stateDatabase = `${process.env.HOME ?? "/home/ubuntu"}/.hermes/state.db`;
    const { stdout } = await exec("python3", [usageScript, command.commandId, stateDatabase], { timeout: 15_000, maxBuffer: 200_000 });
    usage = { ...emptyUsage, ...JSON.parse(stdout) };
  } catch (error) {
    console.warn("Hermes usage lookup failed:", error instanceof Error ? error.message : error);
  }
  return {
    result,
    latencyMs: Date.now() - startedAt,
    trace: {
      prompt: attemptPrompts.at(-1) ?? prompt,
      attemptPrompts: attemptPrompts.map(value => value.slice(0, 120_000)),
      response: result.response,
      ...usage,
      attemptCount: attemptPrompts.length,
    },
  };
}
