import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AgentResultSchema, type AgentKey, type WorkerCommand } from "@founder/contracts";
import { config } from "./config.js";
import { resultFormats, rolePrompts } from "./prompts.js";
import { searchLinkup } from "./linkup.js";
import { selectTemplates } from "./templates.js";

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
  const prompt = [rolePrompts[agent], `Conversation context:\n${context}`, `Current request:\n${command.message}`, freshContext, resultFormats[agent]].filter(Boolean).join("\n\n");
  const startedAt = Date.now();
  async function invoke(currentPrompt: string) {
    const args = ["--skills", skillByAgent[agent], "-t", "skills", "-z", currentPrompt];
    if (config.HERMES_MODEL) args.push("--model", config.HERMES_MODEL);
    const { stdout, stderr } = await exec(config.HERMES_BIN, args, {
      cwd: new URL("..", import.meta.url), timeout: 180_000, maxBuffer: 2_000_000,
      env: { ...process.env, LINKUP_API_KEY: config.LINKUP_API_KEY, TEMPLATE_LIBRARY_PATH: config.TEMPLATE_LIBRARY_PATH },
    });
    if (stderr.trim()) console.warn("Hermes stderr:", stderr.slice(0, 500));
    return AgentResultSchema.parse(extractJson(stdout));
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
    result = await invoke(`${prompt}\n\nSCHEMA REPAIR REQUIRED: Return valid JSON matching the exact role-specific shape. Do not omit kind, title, content, sourceUrls, or delegatedAgents. For Founder clarification/delegation/final synthesis, use artifacts: [].`);
  }
  const missingKinds = missing(result);
  if (missingKinds.length) result = await invoke(`${prompt}\n\nREPAIR REQUIRED: Your previous response omitted mandatory artifacts: ${missingKinds.join(", ")}. Return the exact role-specific shape now.`);
  const stillMissing = missing(result);
  if (stillMissing.length) throw new Error(`${agent} omitted mandatory artifacts after repair: ${stillMissing.join(", ")}`);
  return { result, latencyMs: Date.now() - startedAt };
}
