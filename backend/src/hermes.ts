import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { jsonrepair } from "jsonrepair";
import { AgentResultSchema, GtmDataSchema, LandingBriefDataSchema, ResearchDataSchema, type AgentKey, type WorkerCommand } from "@founder/contracts";
import { config } from "./config.js";
import { peerReviewFormat, resultFormats, rolePrompts } from "./prompts.js";
import { searchLinkup } from "./linkup.js";
import { selectTemplate } from "./templates.js";
import { sanitizePreviewHtml } from "./cloudflare.js";

const exec = promisify(execFile);
const skillByAgent: Record<AgentKey, string> = {
  founder: "founder-orchestrator",
  research: "founder-research",
  landing_page: "founder-landing-page",
  go_to_market: "founder-go-to-market",
};

async function runtimeContext(agent: AgentKey, message: string, taskType: WorkerCommand["taskType"], preferredTemplate?: string): Promise<{ text: string; templateName?: string }> {
  if (agent === "founder" || taskType === "peer_review") return { text: "" };
  const researchQueries = taskType === "revise" ? [
    `${message}\nFind only recent primary evidence that could close material gaps in an existing market dossier.`,
    `${message}\nFind current community/channel rules relevant to validating this idea without spam.`,
  ] : [
    `${message}\nFind direct and indirect competitors. Prefer official product and pricing pages.`,
    `${message}\nFind credible evidence of the target user's problem, current alternatives, objections, and exact language.`,
    `${message}\nFind primary or authoritative numerical inputs for bottom-up market sizing. Include geography and dates.`,
    `${message}\nFind relevant Reddit communities, professional communities, and distribution channels plus their current promotion rules.`,
  ];
  const queries = agent === "research" ? researchQueries : agent === "go_to_market" ? [
    `${message}\nFind current platform/community rules, accepted post patterns, and promotional constraints for the proposed audience.`,
    `${message}\nFind where this audience actively asks for solutions and what language they use.`,
    `${message}\nFind comparable validation campaigns, offers, and channel signals without inventing benchmarks.`,
  ] : [`${message}\nFind current audience language and trustworthy claim support relevant to this landing page.`];
  const evidencePromise = Promise.all(queries.map(query => searchLinkup(query, 6, agent === "research" && taskType === "create" ? "deep" : "fast")));
  if (agent !== "landing_page") return { text: `RUNTIME LINKUP EVIDENCE SETS:\n${JSON.stringify(await evidencePromise)}` };
  const [evidence, template] = await Promise.all([evidencePromise, selectTemplate(message, preferredTemplate)]);
  return {
    templateName: template.selected.name,
    text: `RUNTIME LINKUP EVIDENCE:\n${JSON.stringify(evidence)}\n\nAPPROVED TEMPLATE CATALOGUE SELECTION:\n${JSON.stringify({ name: template.selected.name, score: template.selected.score, promptPath: template.selected.promptPath, alternatives: template.alternatives })}\n\nFULL APPROVED TEMPLATE PROMPT (DESIGN REFERENCE):\n${template.selected.prompt}`,
  };
}

export function extractJson(text: string) {
  const artifactKinds = ["research_report", "gtm_strategy", "social_posts", "landing_page_brief", "landing_page_html"];
  const hasMentionedArtifacts = (parsed: Record<string, unknown>) => {
    const container = parsed.artifacts;
    const present = new Set(Array.isArray(container) ? container.flatMap(item => item && typeof item === "object" && typeof (item as Record<string, unknown>).kind === "string" ? [(item as Record<string, unknown>).kind as string] : []) : container && typeof container === "object" ? Object.keys(container) : Object.keys(parsed));
    return artifactKinds.every(kind => !new RegExp(`(?:"kind"\\s*:\\s*"${kind}"|"${kind}"\\s*:)`).test(text) || present.has(kind));
  };
  const candidates: string[] = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) if (match[1]?.includes("{")) candidates.push(match[1].trim());
  let start = -1; let depth = 0; let quoted = false; let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "{") { if (depth === 0) start = index; depth += 1; }
    else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) { candidates.push(text.slice(start, index + 1)); start = -1; }
    }
  }
  const firstBrace = text.indexOf("{"); const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  if (!candidates.length) throw new Error("Hermes did not return a complete JSON object");
  let lastError: unknown;
  for (const candidate of [...new Set(candidates)].sort((a, b) => b.length - a.length)) {
    const normalized = candidate.replace(/,\s*,+/g, ",").replace(/([\[{])\s*,/g, "$1").replace(/,\s*([}\]])/g, "$1");
    for (const value of [candidate, normalized]) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && "summary" in parsed && hasMentionedArtifacts(parsed)) return parsed;
      } catch (error) { lastError = error; }
      try {
        const parsed = JSON.parse(jsonrepair(value));
        if (parsed && typeof parsed === "object" && "summary" in parsed && hasMentionedArtifacts(parsed)) return parsed;
      } catch (error) { lastError = error; }
    }
  }
  const namedArtifacts: Record<string, unknown> = {};
  for (const kind of artifactKinds) {
    const marker = text.indexOf(`"${kind}"`); if (marker < 0) continue;
    const colon = text.indexOf(":", marker + kind.length + 2); if (colon < 0) continue;
    const valueStart = text.slice(colon + 1).search(/\S/) + colon + 1;
    if (text[valueStart] === '"') {
      let slash = false;
      for (let index = valueStart + 1; index < text.length; index += 1) {
        const char = text[index]!;
        if (slash) slash = false;
        else if (char === "\\") slash = true;
        else if (char === '"') { try { namedArtifacts[kind] = JSON.parse(text.slice(valueStart, index + 1)); } catch { /* repaired envelope may be required */ } break; }
      }
      continue;
    }
    const open = text.indexOf("{", colon + 1); if (open < 0) continue;
    let objectDepth = 0; let inString = false; let slash = false; let close = -1;
    for (let index = open; index < text.length; index += 1) {
      const char = text[index]!;
      if (inString) { if (slash) slash = false; else if (char === "\\") slash = true; else if (char === '"') inString = false; continue; }
      if (char === '"') { inString = true; continue; }
      if (char === "{") objectDepth += 1;
      else if (char === "}") { objectDepth -= 1; if (objectDepth === 0) { close = index; break; } }
    }
    if (close < 0) continue;
    const value = text.slice(open, close + 1);
    try { namedArtifacts[kind] = JSON.parse(value); }
    catch { try { namedArtifacts[kind] = JSON.parse(jsonrepair(value)); } catch { /* strict schema reports unrecoverable fields later */ } }
  }
  if (Object.keys(namedArtifacts).length) return { summary: "Recovered structured specialist result", response: "Specialist work completed and passed through deterministic envelope recovery.", artifacts: namedArtifacts, delegatedAgents: [], reviewActions: [], reviewFindings: [], approved: false };
  throw lastError instanceof Error ? lastError : new Error("Hermes did not return the agent result object");
}

export async function runHermes(agent: AgentKey, command: WorkerCommand) {
  const context = command.context.map((item) => `${item.role}: ${item.content}`).join("\n");
  // Search from the compact root request. Revision commands contain previous artifacts
  // and review findings, which are useful to Hermes but terrible search queries.
  const preferredTemplate = command.taskType === "revise" ? command.message.match(/Template ID\s*:\s*([^\n]+)/i)?.[1]?.trim() : undefined;
  const runtime = await runtimeContext(agent, command.rootRequest ?? command.message, command.taskType, preferredTemplate);
  const freshContext = runtime.text;
  const reviewContext = command.reviewRound ? `This is manager review round ${command.reviewRound} of 5.` : "";
  const taskContext = `TASK TYPE: ${command.taskType}. WORKFLOW STAGE: ${command.stage ?? "unspecified"}. Input artifact IDs: ${command.inputArtifactIds.join(", ") || "none"}.`;
  const templateRequirement = runtime.templateName ? `CATALOGUE REQUIREMENT: You must adapt exactly the approved catalogue template named "${runtime.templateName}". In the landing_page_brief, include the exact line "Template ID: ${runtime.templateName}". Do not substitute a new layout or generic design direction.` : "";
  const outputFormat = command.taskType === "peer_review" ? peerReviewFormat : resultFormats[agent];
  const prompt = [`TRACE_ID: ${command.commandId}`, rolePrompts[agent], taskContext, `Conversation context:\n${context}`, `Original user request:\n${command.rootRequest ?? command.message}`, `Current request:\n${command.message}`, reviewContext, templateRequirement, freshContext, outputFormat].filter(Boolean).join("\n\n");
  const startedAt = Date.now();
  const attemptPrompts: string[] = [];
  let lastRawOutput = "";
  async function invoke(currentPrompt: string) {
    attemptPrompts.push(currentPrompt);
    const args = ["--skills", skillByAgent[agent], "-t", "skills", "-z", currentPrompt];
    if (config.HERMES_MODEL) args.push("--model", config.HERMES_MODEL);
    const { stdout, stderr } = await exec(config.HERMES_BIN, args, {
      cwd: new URL("..", import.meta.url), timeout: 180_000, maxBuffer: 2_000_000,
      env: { ...process.env, LINKUP_API_KEY: config.LINKUP_API_KEY, TEMPLATE_LIBRARY_PATH: config.TEMPLATE_LIBRARY_PATH },
    });
    if (stderr.trim()) console.warn("Hermes stderr:", stderr.slice(0, 500));
    lastRawOutput = stdout;
    const raw = extractJson(stdout) as Record<string, unknown>;
    if (!Array.isArray(raw.artifacts)) {
      const keyed = raw.artifacts && typeof raw.artifacts === "object" ? raw.artifacts as Record<string, unknown> : Object.fromEntries(["research_report", "gtm_strategy", "social_posts", "landing_page_brief", "landing_page_html"].filter(kind => raw[kind]).map(kind => [kind, raw[kind]]));
      raw.artifacts = Object.entries(keyed).flatMap<Record<string, unknown>>(([kind, candidate]) => {
        if (typeof candidate === "string") return [{ kind, title: kind.split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" "), content: candidate, sourceUrls: [] }];
        if (!candidate || typeof candidate !== "object") return [];
        const value = candidate as Record<string, unknown>;
        const directData = kind === "gtm_strategy" && "hypothesis" in value || kind === "research_report" && "verdict" in value || kind === "landing_page_brief" && "templateId" in value;
        const data = value.data && typeof value.data === "object" ? value.data : directData ? value : undefined;
        const readablePosts = data && Array.isArray((data as Record<string, unknown>).posts) ? ((data as Record<string, unknown>).posts as Array<Record<string, unknown>>).map(post => `## ${String(post.platform ?? "post")} · ${String(post.title ?? post.id ?? "draft")}\n\n${String(post.body ?? "")}`).join("\n\n") : "";
        return [{ kind, title: typeof value.title === "string" ? value.title : kind.split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" "), content: typeof value.content === "string" ? value.content : kind === "landing_page_html" && typeof value.html === "string" ? value.html : typeof value.markdown === "string" ? value.markdown : readablePosts || JSON.stringify(data ?? value, null, 2), data, sourceUrls: Array.isArray(value.sourceUrls) ? value.sourceUrls : [] }];
      });
    }
    if (!Array.isArray(raw.reviewFindings)) raw.reviewFindings = [];
    if (agent !== "founder") {
      raw.delegatedAgents = [];
      raw.reviewActions = [];
    }
    if (command.taskType === "peer_review") {
      // Review findings are the only durable output of a peer-review task.
      // Some models mirror findings into manager actions; discard that duplicate
      // envelope data before applying the strict common schema.
      raw.artifacts = [];
      raw.delegatedAgents = [];
      raw.reviewActions = [];
    }
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
    if (command.taskType === "peer_review" || agent === "founder") return [];
    const kinds = new Set(result.artifacts.map(artifact => artifact.kind));
    if (agent === "research") return kinds.has("research_report") ? [] : ["research_report"];
    if (agent === "landing_page") return ["landing_page_brief", "landing_page_html"].filter(kind => !kinds.has(kind as "landing_page_brief"));
    if (agent === "go_to_market") return ["gtm_strategy", "social_posts"].filter(kind => !kinds.has(kind as "gtm_strategy"));
    return [];
  }
  let parsedResult: ReturnType<typeof AgentResultSchema.parse> | undefined;
  let parseDefect = "";
  for (let attempt = 0; attempt < 3 && !parsedResult; attempt += 1) {
    const repairContext = attempt === 0 ? "" : `\n\nJSON REPAIR REQUIRED (attempt ${attempt + 1} of 3): ${parseDefect}\nThe previous response is below. Repair it into one valid JSON object matching the exact role-specific shape. Preserve its evidence and content, but emit no prose or markdown outside JSON. For Founder clarification or delegation, use artifacts: [], reviewActions: [], approved: false.\n\nPREVIOUS MALFORMED RESPONSE:\n${lastRawOutput.slice(0, 120_000)}`;
    try {
      parsedResult = await invoke(`${prompt}${repairContext}`);
    } catch (error) {
      parseDefect = error instanceof Error ? error.message.slice(0, 2_000) : "invalid structured response";
    }
  }
  if (!parsedResult) {
    console.warn("Hermes structured output tail:", lastRawOutput.slice(-4_000));
    throw new Error(`Hermes failed structured JSON repair after 3 attempts: ${parseDefect}`);
  }
  let result: ReturnType<typeof AgentResultSchema.parse> = parsedResult;
  const missingKinds = missing(result);
  if (missingKinds.length) result = await invoke(`${prompt}\n\nREPAIR REQUIRED: Your previous response omitted mandatory artifacts: ${missingKinds.join(", ")}. Return the exact role-specific shape now.`);
  const stillMissing = missing(result);
  if (stillMissing.length) throw new Error(`${agent} omitted mandatory artifacts after repair: ${stillMissing.join(", ")}`);
  if (agent === "landing_page") {
    const allowedKinds = new Set(["landing_page_brief", "landing_page_html"]);
    const unexpected = result.artifacts.filter(artifact => !allowedKinds.has(artifact.kind));
    if (unexpected.length) {
      result = await invoke(`${prompt}\n\nSCOPE VIOLATION: Return only landing_page_brief and landing_page_html artifacts. Remove all research, GTM, social, backend, product-feature, and other unrelated output. Focus exclusively on the landing-page UI.`);
      const repairedUnexpected = result.artifacts.filter(artifact => !allowedKinds.has(artifact.kind));
      if (repairedUnexpected.length) throw new Error(`Landing page agent returned out-of-scope artifacts: ${repairedUnexpected.map(artifact => artifact.kind).join(", ")}`);
    }
  }
  if (command.taskType !== "peer_review" && agent !== "founder") {
    const validateStructured = (candidate: typeof result) => {
      if (agent === "research") return ResearchDataSchema.parse(candidate.artifacts.find(item => item.kind === "research_report")?.data);
      if (agent === "go_to_market") return GtmDataSchema.parse(candidate.artifacts.find(item => item.kind === "gtm_strategy")?.data);
      return LandingBriefDataSchema.parse(candidate.artifacts.find(item => item.kind === "landing_page_brief")?.data);
    };
    try { validateStructured(result); }
    catch (error) {
      const defect = error instanceof Error ? error.message.slice(0, 3000) : "structured data missing";
      result = await invoke(`${prompt}\n\nSTRUCTURED DATA REPAIR REQUIRED: ${defect}\nReturn the complete role-specific result again. Preserve valid content, but make the artifact data exactly match the required schema. Use real JSON numbers and arrays, never markdown inside data.`);
      validateStructured(result);
    }
  }
  if (agent === "landing_page" && runtime.templateName) {
    const brief = result.artifacts.find(artifact => artifact.kind === "landing_page_brief")?.content ?? "";
    if (!new RegExp(`Template ID\\s*:\\s*${runtime.templateName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i").test(brief)) {
      result = await invoke(`${prompt}\\n\\nCATALOGUE COMPLIANCE FAILED: The landing_page_brief did not include the exact selected template ID "${runtime.templateName}". Return both mandatory artifacts again and include the exact line "Template ID: ${runtime.templateName}" in the brief.`);
      const repairedBrief = result.artifacts.find(artifact => artifact.kind === "landing_page_brief")?.content ?? "";
      if (!new RegExp(`Template ID\\s*:\\s*${runtime.templateName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i").test(repairedBrief)) throw new Error(`Landing page did not identify approved catalogue template ${runtime.templateName}`);
    }
  }
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
    if (!/<form\b[^>]*data-founder-waitlist/i.test(result.artifacts.find(artifact => artifact.kind === "landing_page_html")?.content ?? "")) {
      result = await invoke(`${prompt}\n\nVALIDATION FORM REQUIRED: Return both landing artifacts again. HTML must include exactly one form with data-founder-waitlist, an email input, a submit button, and data-founder-waitlist-status. Do not attach fake success behavior; runtime does that.`);
      const repairedHtml = result.artifacts.find(artifact => artifact.kind === "landing_page_html")?.content ?? "";
      sanitizePreviewHtml(repairedHtml);
      if (!/<form\b[^>]*data-founder-waitlist/i.test(repairedHtml)) throw new Error("Landing page omitted the real waitlist form hook");
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
