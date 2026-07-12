import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  ArrowRight,
  ArrowUp,
  Atom,
  CaretRight,
  Check,
  CheckCircle,
  CirclesThreePlus,
  Clock,
  Code,
  DownloadSimple,
  FileText,
  Files,
  Globe,
  LinkSimple,
  ListChecks,
  MagnifyingGlass,
  Play,
  RocketLaunch,
  SpinnerGap,
  SquaresFour,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const api = anyApi as any;

type AgentKey = "founder" | "research" | "landing_page" | "go_to_market";
type RuntimeStatus = "ready" | "queued" | "working" | "complete" | "error";
type WorkspaceView = "map" | "team" | "tasks" | "outputs";

type RunTrace = {
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

type RunCommand = {
  _id: string;
  message: string;
  rootRequest?: string;
  context: Array<{ role: "user" | "assistant"; content: string }>;
  reviewRound?: number;
  createdAt: number;
  updatedAt: number;
};

type Run = {
  _id: string;
  commandId: string;
  agentKey: AgentKey;
  parentRunId?: string;
  reviewRound?: number;
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

type Message = {
  _id: string;
  role: "user" | "assistant";
  agentKey?: AgentKey;
  content: string;
  createdAt: number;
};

type Artifact = {
  _id: string;
  runId: string;
  kind: string;
  title: string;
  content: string;
  sourceUrls: string[];
  createdAt: number;
};

type Project = {
  _id: string;
  name: string;
  description?: string;
  isShowcase?: boolean;
  createdAt: number;
  conversations: Array<{ _id: string; title: string; status: string; createdAt: number; updatedAt: number }>;
};

type BillingPlan = {
  plan: "free" | "builder";
  paid: boolean;
  canCreate: boolean;
  used: number;
  limit: number;
  canBypass: boolean;
};

const AGENTS: Array<{ key: AgentKey; name: string; shortName: string; role: string; avatar: string; description: string; accent: string }> = [
  { key: "founder", name: "founder", shortName: "founder", role: "manager", avatar: "/agents/founder_agent.png", description: "runs the company. asks you the sharp questions, hands work to the right specialist, and comes back with one clear answer.", accent: "lime" },
  { key: "research", name: "research", shortName: "research", role: "market intel", avatar: "/agents/research_agent.png", description: "reads the live market. maps your closest competitors and only keeps claims it can back with a real source.", accent: "cyan" },
  { key: "landing_page", name: "landing", shortName: "landing", role: "page builder", avatar: "/agents/product_agent.png", description: "picks an approved template and writes your complete landing page — headline, sections, and final copy.", accent: "violet" },
  { key: "go_to_market", name: "gtm", shortName: "gtm", role: "distribution", avatar: "/agents/growth_agent.png", description: "plans the launch. builds the channel strategy and writes the platform-specific posts to ship it.", accent: "amber" },
];

const TASK_BRIEFS: Record<AgentKey, string> = {
  founder: "read everything the team made and bring back one clear answer",
  research: "map the closest competitors and bring back cited proof",
  landing_page: "pick an approved template and write the full page",
  go_to_market: "plan the launch and draft the platform posts",
};

const THINKING: Record<AgentKey, string> = {
  founder: "reading the team's work, deciding what actually matters…",
  research: "reading live sources, keeping only claims i can cite…",
  landing_page: "choosing a template, writing the final copy…",
  go_to_market: "sequencing the launch, drafting the posts…",
};

const MISSIONS = [
  { icon: MagnifyingGlass, label: "map my market", text: "research my closest competitors, identify an honest positioning gap, and give me a cited recommendation." },
  { icon: Code, label: "build a landing page", text: "research the audience, select the best approved template, and create a complete landing-page brief with final copy." },
  { icon: RocketLaunch, label: "plan my launch", text: "create a two-week go-to-market strategy and platform-specific launch posts for my product." },
];

function agentFor(key: AgentKey) {
  return AGENTS.find(agent => agent.key === key) ?? AGENTS[0];
}

function formatTime(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function formatDuration(milliseconds?: number) {
  if (!milliseconds) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds > 10_000 ? 0 : 1)}s`;
}

function formatTokens(value?: number) {
  if (!value) return "0";
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}k` : String(value);
}

function formatCost(run: Run) {
  const value = run.trace?.actualCostUsd ?? run.trace?.estimatedCostUsd;
  return value == null ? "—" : `$${value.toFixed(4)}`;
}

function saveTextFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function runMarkdown(run: Run, artifacts: Artifact[]) {
  const command = run.command;
  const trace = run.trace;
  const outputs = artifacts.filter(artifact => artifact.runId === run._id);
  return `# ${agentFor(run.agentKey).name} trace\n\n- Run: ${run._id}\n- Parent: ${run.parentRunId ?? "user"}\n- Status: ${run.status}\n- Model: ${trace?.model ?? "unavailable"}\n- Duration: ${formatDuration(run.latencyMs)}\n- Tokens: ${trace ? `${trace.inputTokens} input / ${trace.outputTokens} output / ${trace.reasoningTokens} reasoning` : "unavailable"}\n- Cost: ${formatCost(run)}\n\n## Task envelope\n\n${command?.message ?? "Unavailable for this historical run."}\n\n## Conversation context\n\n${command?.context.map(item => `**${item.role}:** ${item.content}`).join("\n\n") ?? "Unavailable."}\n\n## Exact prompt\n\n\`\`\`text\n${trace?.prompt ?? "Unavailable for this historical run."}\n\`\`\`\n\n## Reply\n\n${trace?.response ?? run.summary ?? run.error ?? "No reply recorded."}\n\n## Outputs\n\n${outputs.map(output => `- ${output.kind}: ${output.title}`).join("\n") || "None"}\n`;
}

function statusFor(agent: AgentKey, runs: Run[]): RuntimeStatus {
  const run = [...runs].reverse().find(item => item.agentKey === agent);
  if (!run) return "ready";
  if (run.status === "pending") return "queued";
  if (run.status === "running") return "working";
  if (run.status === "failed") return "error";
  return "complete";
}

function runLabel(run: Run) {
  if (!run.parentRunId) return run.agentKey === "founder" ? "understand the idea + assign the team" : TASK_BRIEFS[run.agentKey];
  return run.agentKey === "founder" ? TASK_BRIEFS.founder : TASK_BRIEFS[run.agentKey];
}

function runStateWord(run: Run): RuntimeStatus {
  if (run.status === "pending") return "queued";
  if (run.status === "running") return "working";
  if (run.status === "failed") return "error";
  return "complete";
}

function missionProgress(runs: Run[]) {
  if (!runs.length) return 0;
  const latestRun = runs[runs.length - 1];
  if (latestRun.status === "pending") return latestRun.agentKey === "founder" ? 18 : 42;
  if (latestRun.status === "running") return latestRun.agentKey === "founder" ? (latestRun.reviewRound ? 92 : 24) : 58;
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

function Brand() {
  return <div className="brand-lockup" aria-label="founder.exe"><strong>founder<span>.exe</span></strong></div>;
}

function StatusDot({ status }: { status: RuntimeStatus }) {
  return <span className={`status-dot dot-${status}`} aria-hidden="true" />;
}

/* ---------------- onboarding ---------------- */

function BillingModal({ ownerKey, plan, onClose }: { ownerKey: string; plan: BillingPlan; onClose: () => void }) {
  const [busy, setBusy] = useState<"checkout" | "bypass" | null>(null);
  const [error, setError] = useState("");
  const createCheckout = useAction(api.billingActions.createCheckout);
  const activateBypass = useMutation(api.billing.activateInternalBypass);

  async function checkout() {
    setBusy("checkout"); setError("");
    try {
      const result = await createCheckout({ ownerKey, returnUrl: `${window.location.origin}?billing=return` });
      window.location.assign(result.checkoutUrl);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message.includes("DODO_NOT_CONFIGURED") ? "dodo test checkout is not configured on this deployment yet." : "checkout could not start. try again in a moment.");
      setBusy(null);
    }
  }

  async function bypass() {
    setBusy("bypass"); setError("");
    try { await activateBypass({ ownerKey }); onClose(); }
    catch { setError("this browser is not on the internal testing allowlist."); setBusy(null); }
  }

  return (
    <div className="billing-overlay" role="dialog" aria-modal="true" aria-labelledby="billing-title">
      <section className="billing-modal">
        <button className="billing-close" onClick={onClose} aria-label="close"><X size={18} /></button>
        <span className="billing-kicker">free build shipped // upgrade to continue</span>
        <h2 id="billing-title">keep your agent company running.</h2>
        <p>your first idea was on us. builder gives this browser up to five new companies every utc month.</p>
        <div className="billing-price"><strong><sup>$</sup>9</strong><span>usd<br />per month</span></div>
        <ul><li><Check size={15} /> 5 new projects each month</li><li><Check size={15} /> research, landing and gtm agents</li><li><Check size={15} /> full traces, artifacts and exports</li></ul>
        {error && <div className="billing-error"><WarningCircle size={16} />{error}</div>}
        <button className="billing-checkout" disabled={!!busy} onClick={checkout}>{busy === "checkout" ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />} continue with dodo</button>
        {plan.canBypass && <button className="billing-bypass" disabled={!!busy} onClick={bypass}>{busy === "bypass" ? "unlocking…" : "bypass for internal testing"}</button>}
        <small>dodo payments · test mode until live credentials are installed</small>
      </section>
    </div>
  );
}

function Onboarding({ ownerKey, projects, showcases, onReady, onOpen }: { ownerKey: string; projects: Project[]; showcases: Project[]; onReady: (companyId: string, companyName: string) => void; onOpen: (project: Project, conversationId?: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [error, setError] = useState("");
  const bootstrap = useMutation(api.conversations.bootstrap);
  const plan = useQuery(api.billing.getPlan, { ownerKey }) as BillingPlan | undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (plan && !plan.canCreate) { setBillingOpen(true); return; }
    setBusy(true);
    try {
      const id = await bootstrap({ name: name.trim(), ownerKey });
      onReady(id, name.trim());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (message.includes("BILLING_REQUIRED")) setBillingOpen(true);
      else setError("could not start this company. try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header"><Brand /><span>{plan ? `${plan.plan} // ${plan.used} of ${plan.limit} builds used` : "private runtime // loading"}</span></header>
      <section className="onboarding-grid">
        <div className="onboarding-copy">
          <p className="kicker">from shower idea to real thing</p>
          <h1>dump the idea.<br /><span>watch it get built.</span></h1>
          <p className="lede">name your company, then tell founder the messy version. it will ask you the sharp questions, put research, landing and gtm to work, and show you every task as it happens.</p>
          <form className="setup-form" onSubmit={submit}>
            <label>idea / company name<input value={name} onChange={event => setName(event.target.value)} placeholder="my weird little idea" required autoFocus /></label>
            <button disabled={busy}>{busy ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />} meet founder</button>
            {error && <p className="setup-error"><WarningCircle size={15} />{error}</p>}
          </form>
          {!!projects.length && (
            <div className="recent-projects">
              <span>your companies</span>
              {projects.slice(0, 4).map(project => (
                <button type="button" key={project._id} onClick={() => onOpen(project)}>
                  <div><strong>{project.name}</strong><small>{project.conversations.length} mission{project.conversations.length === 1 ? "" : "s"}</small></div>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
          {!!showcases.length && <div className="recent-projects"><span>featured showcase</span>{showcases.map(project => <button type="button" key={project._id} onClick={() => onOpen(project)}><div><strong>{project.name}</strong><small>{project.description}</small></div><CheckCircle size={15} /></button>)}</div>}
        </div>
        <div className="onboarding-orbit" aria-label="your four-agent company">
          <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
          {AGENTS.map(agent => (
            <div className={`onboarding-agent onboard-${agent.key}`} key={agent.key}>
              <span><img src={agent.avatar} alt="" /></span><b>{agent.shortName}</b>
            </div>
          ))}
          <div className="orbit-label"><small>your company</small><strong>4 agents</strong><span>ready to work</span></div>
        </div>
      </section>
      {billingOpen && plan && <BillingModal ownerKey={ownerKey} plan={plan} onClose={() => setBillingOpen(false)} />}
    </main>
  );
}

/* ---------------- left workspace views ---------------- */

function taskLine(agent: AgentKey, runs: Run[]) {
  const run = [...runs].reverse().find(item => item.agentKey === agent);
  if (!run) return "waiting for the first mission";
  if (run.status === "pending") return "queued — waiting for a free desk in the cloud";
  if (run.status === "running") return THINKING[agent];
  if (run.status === "failed") return run.error ? `hit a problem: ${run.error.slice(0, 90)}` : "hit a problem on the last task";
  return run.summary || "finished the last task";
}

const MAP_POINTS: Record<Exclude<AgentKey, "founder">, { x: number; y: number }> = {
  research: { x: 50, y: 15 },
  landing_page: { x: 17, y: 79 },
  go_to_market: { x: 83, y: 79 },
};

function CompanyMap({ runs, selected, onSelect }: { runs: Run[]; selected: AgentKey | null; onSelect: (key: AgentKey) => void }) {
  const founder = AGENTS[0];
  const founderStatus = statusFor("founder", runs);
  return (
    <section className="company-map" aria-label="company map">
      <div className="map-orbit" aria-hidden="true" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {AGENTS.slice(1).map(agent => {
          const point = MAP_POINTS[agent.key as Exclude<AgentKey, "founder">];
          const status = statusFor(agent.key, runs);
          const active = status === "working" || status === "queued";
          return (
            <g key={agent.key}>
              <line x1="50" y1="50" x2={point.x} y2={point.y} />
              {active && <line className="active-line" x1="50" y1="50" x2={point.x} y2={point.y} />}
              {status === "complete" && <line className="done-line" x1="50" y1="50" x2={point.x} y2={point.y} />}
            </g>
          );
        })}
      </svg>
      <button className={`founder-node ${selected === "founder" ? "is-selected" : ""} node-${founderStatus}`} onClick={() => onSelect("founder")} aria-pressed={selected === "founder"}>
        <span className="founder-portrait"><img src={founder.avatar} alt="" /><StatusDot status={founderStatus} /></span>
        <span><strong>founder</strong><small>{founderStatus}</small></span>
      </button>
      {AGENTS.slice(1).map((agent, index) => {
        const status = statusFor(agent.key, runs);
        return (
          <button key={agent.key} className={`agent-node agent-pos-${index} ${selected === agent.key ? "is-selected" : ""}`} onClick={() => onSelect(agent.key)} aria-pressed={selected === agent.key} aria-label={`inspect ${agent.name}, ${status}`}>
            <span className="portrait-frame"><img src={agent.avatar} alt="" /><StatusDot status={status} /></span>
            <span className="agent-label"><strong>{agent.role}</strong><small>{status}</small></span>
          </button>
        );
      })}
    </section>
  );
}

function EmployeeGrid({ runs, selected, onSelect }: { runs: Run[]; selected: AgentKey | null; onSelect: (key: AgentKey) => void }) {
  return (
    <section className="employee-grid" aria-label="employee grid">
      {AGENTS.map(agent => {
        const status = statusFor(agent.key, runs);
        return (
          <button className={`employee-card ${selected === agent.key ? "is-selected" : ""}`} key={agent.key} onClick={() => onSelect(agent.key)} aria-pressed={selected === agent.key}>
            <span className="employee-card-portrait"><img src={agent.avatar} alt="" /><StatusDot status={status} /></span>
            <span className="employee-card-copy">
              <span className="employee-card-topline"><strong>{agent.name}</strong><small>{runs.filter(run => run.agentKey === agent.key && run.status === "succeeded").length} done</small></span>
              <span className="employee-role">{agent.role}</span>
              <span className="employee-task">{taskLine(agent.key, runs)}</span>
            </span>
            <span className={`employee-status text-${status}`}>{status}</span>
          </button>
        );
      })}
    </section>
  );
}

function TaskBoard({ runs, events, onOpen, onExportJson, onExportMarkdown }: { runs: Run[]; events: any[]; onOpen: (run: Run) => void; onExportJson: () => void; onExportMarkdown: () => void }) {
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<"all" | AgentKey>("all");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const runMap = new Map(runs.map(run => [run._id, run]));
  const depth = (run: Run) => { let value = 0; let parent = run.parentRunId ? runMap.get(run.parentRunId) : undefined; while (parent && value < 5) { value += 1; parent = parent.parentRunId ? runMap.get(parent.parentRunId) : undefined; } return value; };
  const ordered = runs.filter(run => agentFilter === "all" || run.agentKey === agentFilter).filter(run => `${agentFor(run.agentKey).name} ${run.summary ?? ""} ${run.command?.message ?? ""} ${run.trace?.response ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const totalTokens = runs.reduce((sum, run) => sum + (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0), 0);
  const totalCost = runs.reduce((sum, run) => sum + (run.trace?.actualCostUsd ?? run.trace?.estimatedCostUsd ?? 0), 0);
  const median = (values: number[]) => { const sorted = values.filter(Boolean).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };
  const medianLatency = median(runs.map(run => run.latencyMs ?? 0));
  const medianTokens = median(runs.map(run => (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0)));
  const compared = compareIds.map(id => runMap.get(id)).filter(Boolean) as Run[];
  function toggleCompare(id: string) { setCompareIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current.slice(-1), id]); }
  return (
    <section className="task-board" aria-label="mission tasks">
      <div className="board-head trace-board-head"><div><p className="panel-kicker">observable agent trace</p><h1>every call, message, token and handoff.</h1></div><div className="trace-export"><button onClick={onExportJson}><DownloadSimple size={14} /> json</button><button onClick={onExportMarkdown}><DownloadSimple size={14} /> markdown</button></div></div>
      <div className="trace-totals"><div><span>runs</span><strong>{runs.length}</strong></div><div><span>tokens</span><strong>{formatTokens(totalTokens)}</strong></div><div><span>tracked cost</span><strong>${totalCost.toFixed(4)}</strong></div><div><span>failures</span><strong>{runs.filter(run => run.status === "failed").length}</strong></div></div>
      <div className="trace-controls"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="search prompts, replies, tasks…" />{(["all", ...AGENTS.map(agent => agent.key)] as const).map(key => <button className={agentFilter === key ? "active" : ""} key={key} onClick={() => setAgentFilter(key)}>{key === "all" ? "all" : agentFor(key).name}</button>)}</div>
      {!ordered.length && <div className="board-empty"><Atom size={30} /><strong>no tasks yet</strong><p>give founder a mission and every task will show up here as it runs.</p></div>}
      <div className="task-rows">
        {ordered.map((run, index) => {
          const agent = agentFor(run.agentKey);
          const state = runStateWord(run);
          const tokens = (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0);
          const parent = run.parentRunId ? runMap.get(run.parentRunId) : undefined;
          const anomaly = run.status === "failed" ? "failure" : medianLatency && (run.latencyMs ?? 0) > medianLatency * 1.75 ? "latency spike" : medianTokens && tokens > medianTokens * 1.35 ? "token spike" : null;
          return (
            <div className={`trace-row-shell depth-${Math.min(3, depth(run))}`} key={run._id} style={{ paddingLeft: `${depth(run) * 22}px` }}>
              <button className={`task-row row-${state}`} onClick={() => onOpen(run)}>
                <span className="task-index">{String(index + 1).padStart(2, "0")}</span><img src={agent.avatar} alt="" />
                <span className="task-copy"><strong>{agent.name} · {runLabel(run)}</strong><small>{parent ? `called by ${agentFor(parent.agentKey).name}` : "called by user"} · {formatDuration(run.latencyMs)} · {formatTokens(tokens)} tokens · {formatCost(run)}</small></span>
                {anomaly && <span className="trace-alert">{anomaly}</span>}
                <em className={`state-chip chip-${state}`}>{state === "working" ? <Play size={11} weight="fill" /> : state === "error" ? <WarningCircle size={12} /> : state === "complete" ? <CheckCircle size={12} /> : <Clock size={12} />}{state}</em><CaretRight size={15} className="task-caret" />
              </button>
              <button className={`compare-toggle ${compareIds.includes(run._id) ? "active" : ""}`} onClick={() => toggleCompare(run._id)}>{compareIds.includes(run._id) ? "selected" : "compare"}</button>
            </div>
          );
        })}
      </div>
      {compared.length === 2 && <div className="trace-compare"><header><span>run comparison</span><button onClick={() => setCompareIds([])}>clear</button></header><div>{compared.map(run => <article key={run._id}><strong>{agentFor(run.agentKey).name}</strong><small>{run._id.slice(-8)}</small><dl><div><dt>duration</dt><dd>{formatDuration(run.latencyMs)}</dd></div><div><dt>input</dt><dd>{formatTokens(run.trace?.inputTokens)}</dd></div><div><dt>output</dt><dd>{formatTokens(run.trace?.outputTokens)}</dd></div><div><dt>cost</dt><dd>{formatCost(run)}</dd></div><div><dt>attempts</dt><dd>{run.trace?.attemptCount ?? "—"}</dd></div></dl><p>{run.summary ?? run.error ?? "No summary"}</p></article>)}</div></div>}
      {!!events.length && (
        <div className="event-ledger">
          <span>what just happened</span>
          {[...events].reverse().slice(0, 10).map(event => (
            <div key={event._id}><i className={`event-${event.type}`} /><p>{String(event.detail).toLowerCase()}</p><time>{formatTime(event.createdAt)}</time></div>
          ))}
        </div>
      )}
    </section>
  );
}

function ArtifactIcon({ kind }: { kind: string }) {
  if (kind.includes("preview")) return <Globe size={18} />;
  if (kind.includes("research")) return <MagnifyingGlass size={18} />;
  if (kind.includes("landing")) return <Code size={18} />;
  if (kind.includes("gtm") || kind.includes("social")) return <RocketLaunch size={18} />;
  return <FileText size={18} />;
}

function OutputsBoard({ artifacts, onOpen }: { artifacts: Artifact[]; onOpen: (artifact: Artifact) => void }) {
  return (
    <section className="outputs-board" aria-label="finished work">
      <div className="board-head"><p className="panel-kicker">finished work</p><h1>everything the team made, ready to open.</h1></div>
      {!artifacts.length && <div className="board-empty"><Files size={30} /><strong>nothing made yet</strong><p>research reports, your landing page, launch posts and the final answer will collect here.</p></div>}
      <div className="outputs-grid">
        {[...artifacts].reverse().map((artifact, index) => (
          <button
            className={`artifact-card ${artifact.kind === "landing_page_preview" ? "is-live-preview" : ""}`}
            onClick={() => artifact.kind === "landing_page_preview" && artifact.sourceUrls[0] ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer") : onOpen(artifact)}
            key={artifact._id}
          >
            <div className="artifact-card-top"><span><ArtifactIcon kind={artifact.kind} /></span><em>output {String(artifacts.length - index).padStart(2, "0")}</em><ArrowRight size={15} /></div>
            <small>{artifact.kind === "landing_page_preview" ? "● live page — click to open" : artifact.kind.replaceAll("_", " ")}</small>
            <strong>{artifact.title}</strong>
            <p>{artifact.content.slice(0, 130)}{artifact.content.length > 130 ? "…" : ""}</p>
            <footer><span>{artifact.sourceUrls.length} sources</span><time>{formatTime(artifact.createdAt)}</time></footer>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- right command panel ---------------- */

type FeedItem =
  | { kind: "user"; id: string; content: string; at: number }
  | { kind: "agent"; id: string; agentKey: AgentKey; content: string; at: number }
  | { kind: "handoff"; id: string; agentKey: AgentKey; at: number };

function buildFeed(messages: Message[], runs: Run[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const message of messages) {
    if (message.role === "user") items.push({ kind: "user", id: message._id, content: message.content, at: message.createdAt });
    else items.push({ kind: "agent", id: message._id, agentKey: message.agentKey ?? "founder", content: message.content, at: message.createdAt });
  }
  for (const run of runs) {
    if (run.parentRunId && run.agentKey !== "founder") items.push({ kind: "handoff", id: `handoff-${run._id}`, agentKey: run.agentKey, at: run.startedAt - 1 });
  }
  return items.sort((a, b) => a.at - b.at);
}

type SiteView = { title: string; url?: string; html?: string };

function isSiteKind(kind: string) {
  return kind === "landing_page_preview" || kind === "landing_page_html";
}

function siteFor(outputs: Artifact[], allArtifacts: Artifact[]): SiteView | null {
  const preview = outputs.find(artifact => artifact.kind === "landing_page_preview");
  const html = outputs.find(artifact => artifact.kind === "landing_page_html") ?? [...allArtifacts].reverse().find(artifact => artifact.kind === "landing_page_html");
  if (!preview && !html) return null;
  return { title: preview?.title ?? html?.title ?? "your landing page", url: preview?.sourceUrls[0], html: html?.content };
}

function Chat({ data, message, setMessage, onSend, onPreset, sending, onOpenTask, onOpenArtifact, onOpenSite, readOnly }: { data: any; message: string; setMessage: (value: string) => void; onSend: () => void; onPreset: (text: string) => void; sending: boolean; onOpenTask: (run: Run) => void; onOpenArtifact: (artifact: Artifact) => void; onOpenSite: (site: SiteView) => void; readOnly?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const messages: Message[] = data?.messages ?? [];
  const commands: RunCommand[] = data?.commands ?? [];
  const runs: Run[] = (data?.runs ?? []).map((run: Run) => ({ ...run, command: commands.find(command => command._id === run.commandId) }));
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const feed = useMemo(() => buildFeed(messages, runs), [messages, runs]);
  const workingRuns = runs.filter(run => ["pending", "running"].includes(run.status));
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [feed.length, workingRuns.length]);

  function toggleExpanded(id: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function runForMessage(agentKey: AgentKey, at: number) {
    return runs.find(run => run.agentKey === agentKey && run.completedAt && Math.abs(run.completedAt - at) < 5000) ?? null;
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); }
  }

  return (
    <div className="panel-body chat-body">
      {!!workingRuns.length && (
        <div className="running-stack" aria-label="running tasks">
          {workingRuns.map(run => {
            const agent = agentFor(run.agentKey);
            return (
              <button className="running-task" key={run._id} onClick={() => onOpenTask(run)}>
                <span className="task-state-icon">{run.status === "running" ? <Play size={12} weight="fill" /> : <Clock size={12} />}</span>
                <strong>{agent.name}</strong>
                <span>{runLabel(run)}</span>
                <em>{run.status === "running" ? "working" : "queued"}</em>
              </button>
            );
          })}
        </div>
      )}
      <div className="chat-scroll" ref={scrollRef}>
        {!feed.length && (
          <div className="chat-empty">
            <span className="founder-mark"><img src="/agents/founder_agent.png" alt="" /></span>
            <p className="kicker">founder is in</p>
            <h2>tell me the idea. the messy version is fine.</h2>
            <p>what is it, who is it for, and what do you wish existed by friday? i'll ask a couple of sharp questions, then hand the work to research, landing and gtm. you can watch every task and open everything they make.</p>
            <div className="mission-presets">
              {MISSIONS.map(item => { const Icon = item.icon; return (
                <button onClick={() => onPreset(item.text)} key={item.label}>
                  <span><Icon size={19} /></span>
                  <div><strong>{item.label}</strong><small>{item.text}</small></div>
                  <ArrowRight size={15} />
                </button>
              ); })}
            </div>
          </div>
        )}
        <div className="message-thread">
          {feed.map(item => {
            if (item.kind === "user") return <div className="chat-message user-message" key={item.id}><span>you</span><p>{item.content}</p><time>{formatTime(item.at)}</time></div>;
            if (item.kind === "handoff") {
              const agent = agentFor(item.agentKey);
              return (
                <div className="chat-message handoff-message" key={item.id}>
                  <img src="/agents/founder_agent.png" alt="" />
                  <div>
                    <span>founder → {agent.name}</span>
                    <p>okay {agent.name} — take over this one. {TASK_BRIEFS[item.agentKey]}.</p>
                    <time>{formatTime(item.at)}</time>
                  </div>
                </div>
              );
            }
            const agent = agentFor(item.agentKey);
            const run = runForMessage(item.agentKey, item.at);
            const outputs = run ? artifacts.filter(artifact => artifact.runId === run._id) : [];
            const site = siteFor(outputs, artifacts);
            const files = outputs.filter(artifact => !isSiteKind(artifact.kind));
            const isLong = item.content.length > 320;
            const isOpen = expanded.has(item.id);
            return (
              <div className={`chat-message agent-message from-${item.agentKey}`} key={item.id}>
                <img src={agent.avatar} alt="" />
                <div>
                  <span>{agent.name}</span>
                  <p className={isLong && !isOpen ? "clamped" : ""}>{item.content}</p>
                  {isLong && <button className="read-toggle" onClick={() => toggleExpanded(item.id)}>{isOpen ? "show less" : "read everything"}</button>}
                  {(!!files.length || !!site && !!outputs.some(artifact => isSiteKind(artifact.kind)) || !!run) && (
                    <div className="message-notch">
                      {site && outputs.some(artifact => isSiteKind(artifact.kind)) && (
                        <button className="notch-chip notch-site" onClick={() => onOpenSite(site)}><Globe size={13} /> view the website</button>
                      )}
                      {files.map(artifact => (
                        <button className="notch-chip" key={artifact._id} onClick={() => onOpenArtifact(artifact)}><ArtifactIcon kind={artifact.kind} /> {artifact.title.length > 34 ? `${artifact.title.slice(0, 34)}…` : artifact.title}</button>
                      ))}
                      {run && <button className="notch-chip notch-task" onClick={() => onOpenTask(run)}><ListChecks size={13} /> how i did it</button>}
                    </div>
                  )}
                  <time>{formatTime(item.at)}</time>
                </div>
              </div>
            );
          })}
          {workingRuns.map(run => {
            const agent = agentFor(run.agentKey);
            return (
              <div className="company-working" key={`working-${run._id}`}>
                <img src={agent.avatar} alt="" />
                <span className="working-pulse"><i /><i /><i /></span>
                <div><strong>{agent.name}</strong><small>{run.status === "running" ? THINKING[run.agentKey] : "queued — waiting for a free desk in the cloud"}</small></div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="composer-wrap">
        {readOnly && <div className="quick-chips"><span>featured showcase · approved run · read only</span></div>}
        {!readOnly && !!feed.length && <div className="quick-chips">{MISSIONS.map(item => <button key={item.label} onClick={() => onPreset(item.text)}>{item.label}</button>)}</div>}
        {!readOnly && <div className="composer">
          <textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={keyDown} placeholder="tell founder what you want to happen…" rows={1} aria-label="message founder" />
          <button onClick={onSend} disabled={!message.trim() || sending} aria-label="send to founder">{sending ? <SpinnerGap className="spin" size={17} /> : <ArrowUp size={17} weight="bold" />}</button>
        </div>}
        {!readOnly && <p>enter to send <span>·</span> shift + enter for a new line <em>founder assigns the team for you</em></p>}
      </div>
    </div>
  );
}

function AgentPanel({ agentKey, runs, artifacts, onClose, onOpenTask }: { agentKey: AgentKey; runs: Run[]; artifacts: Artifact[]; onClose: () => void; onOpenTask: (run: Run) => void }) {
  const agent = agentFor(agentKey);
  const status = statusFor(agentKey, runs);
  const own = [...runs].reverse().filter(run => run.agentKey === agentKey);
  const latest = own[0];
  const outputs = latest ? artifacts.filter(artifact => artifact.runId === latest._id) : [];
  return (
    <div className="panel-body detail-panel">
      <button className="panel-back" onClick={onClose}><ArrowRight size={13} style={{ transform: "rotate(180deg)" }} /> back to chat</button>
      <div className="agent-detail-head">
        <img src={agent.avatar} alt="" />
        <div><p className="panel-kicker">employee file</p><h2>{agent.name}</h2><span>{agent.role}</span></div>
        <em className={`state-chip chip-${status}`}>{status}</em>
      </div>
      <p className="agent-bio">{agent.description}</p>
      <div className="detail-row"><span>right now</span><strong>{taskLine(agentKey, runs)}</strong></div>
      <div className="detail-row"><span>tasks run</span><strong>{own.length} total · {own.filter(run => run.status === "succeeded").length} finished</strong></div>
      <div className="detail-row"><span>last active</span><strong>{latest ? formatTime(latest.startedAt) : "not yet"}</strong></div>
      <div className="detail-row"><span>things made</span><strong>{outputs.length} on the latest task</strong></div>
      {!!own.length && (
        <div className="detail-tasks">
          <p className="panel-kicker">recent tasks — click to inspect</p>
          {own.slice(0, 4).map(run => (
            <button className="mini-task" key={run._id} onClick={() => onOpenTask(run)}>
              <StatusDot status={runStateWord(run)} />
              <span>{runLabel(run)}</span>
              <time>{formatTime(run.startedAt)}</time>
            </button>
          ))}
        </div>
      )}
      <div className="permission-card"><CheckCircle size={17} weight="fill" /><p><strong>everything is on the record.</strong><br />every task this agent runs is stored with its result, timing, and sources — nothing happens off the books.</p></div>
    </div>
  );
}

/* ---------------- results (proof / evals / landing) ---------------- */

type EvalCheck = { label: string; detail: string; state: "pass" | "waiting" | "open" };

function buildChecks(runs: Run[], artifacts: Artifact[]): EvalCheck[] {
  const busy = runs.some(run => ["pending", "running"].includes(run.status));
  const state = (pass: boolean): EvalCheck["state"] => pass ? "pass" : busy ? "waiting" : "open";
  return [
    { label: "founder understood the idea", detail: "founder finished its first pass on your message", state: state(runs.some(run => run.agentKey === "founder" && !run.parentRunId && run.status === "succeeded")) },
    { label: "research backed claims with sources", detail: "at least one research output cites a real link", state: state(artifacts.some(artifact => artifact.kind.includes("research") && artifact.sourceUrls.length > 0)) },
    { label: "landing page written", detail: "a full page brief or live preview exists", state: state(artifacts.some(artifact => artifact.kind.includes("landing"))) },
    { label: "launch plan drafted", detail: "gtm produced a strategy or platform posts", state: state(artifacts.some(artifact => artifact.kind.includes("gtm") || artifact.kind.includes("social"))) },
    { label: "final answer delivered", detail: "founder read everything and synthesized one answer", state: state(runs.some(run => run.agentKey === "founder" && !!run.parentRunId && run.status === "succeeded")) },
    { label: "zero failed tasks", detail: "every task in this mission finished cleanly", state: runs.length ? (runs.every(run => run.status !== "failed") ? "pass" : "open") : "waiting" },
  ];
}

function evalMarkdown(title: string, checks: EvalCheck[], runs: Run[], artifacts: Artifact[]) {
  const passed = checks.filter(check => check.state === "pass").length;
  const sources = new Set(artifacts.flatMap(artifact => artifact.sourceUrls)).size;
  const done = runs.filter(run => run.status === "succeeded");
  const avg = done.length ? Math.round(done.reduce((total, run) => total + (run.latencyMs ?? 0), 0) / done.length / 1000) : 0;
  return [
    `# eval report — ${title || "no mission yet"}`,
    "",
    `score: ${passed} / ${checks.length} checks passing`,
    "",
    "## checks",
    ...checks.map(check => `- ${check.state === "pass" ? "[x]" : "[ ]"} ${check.label} — ${check.state === "pass" ? "passing" : check.state === "waiting" ? "still working" : "not yet"} (${check.detail})`),
    "",
    "## numbers",
    `- tasks finished: ${done.length} of ${runs.length}`,
    `- things produced: ${artifacts.length}`,
    `- sources cited: ${sources}`,
    `- average task time: ${avg ? `${avg}s` : "—"}`,
    "",
    "every number above comes straight from the stored record of this mission. nothing is estimated.",
  ].join("\n");
}

function ResultsPanel({ conversationTitle, runs, artifacts, events, onOpenTask, onOpenArtifact, onOpenSite, onPreset }: { conversationTitle?: string; runs: Run[]; artifacts: Artifact[]; events: any[]; onOpenTask: (run: Run) => void; onOpenArtifact: (artifact: Artifact) => void; onOpenSite: (site: SiteView) => void; onPreset: (text: string) => void }) {
  const [tab, setTab] = useState<"proof" | "evals" | "landing">("proof");
  const checks = useMemo(() => buildChecks(runs, artifacts), [runs, artifacts]);
  const passed = checks.filter(check => check.state === "pass").length;
  const site = siteFor([...artifacts].reverse(), artifacts);
  const landingDocs = [...artifacts].reverse().filter(artifact => artifact.kind.includes("landing") && artifact.kind !== "landing_page_html");
  const ordered = [...runs].reverse();

  function openReport() {
    onOpenArtifact({
      _id: "local-eval-report",
      runId: "",
      kind: "eval_report",
      title: "mission eval report",
      content: evalMarkdown(conversationTitle ?? "", checks, runs, artifacts),
      sourceUrls: [],
      createdAt: Date.now(),
    });
  }

  return (
    <div className="panel-body results-panel">
      <div className="replay-tabs">
        <button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}>proof</button>
        <button className={tab === "evals" ? "active" : ""} onClick={() => setTab("evals")}>evals</button>
        <button className={tab === "landing" ? "active" : ""} onClick={() => setTab("landing")}>landing</button>
      </div>
      <div className="results-scroll">
        {tab === "proof" && (
          <>
            <p className="panel-kicker">every trace, on the record</p>
            {!ordered.length && <div className="board-empty"><Atom size={26} /><strong>no traces yet</strong><p>as soon as founder starts working, every task shows up here with its result and timing.</p></div>}
            {ordered.map(run => {
              const agent = agentFor(run.agentKey);
              const state = runStateWord(run);
              return (
                <button className={`trace-card trace-${state}`} key={run._id} onClick={() => onOpenTask(run)}>
                  <span className="trace-rail"><i /><em /></span>
                  <span className="trace-main">
                    <span className="trace-head"><img src={agent.avatar} alt="" /><span><strong>{agent.name}</strong><small>{run.parentRunId ? "handed over by founder" : "started from your message"}</small></span><b className={`state-chip chip-${state}`}>{state}</b></span>
                    <span className="trace-body">{run.summary || (run.status === "running" ? THINKING[run.agentKey] : run.status === "failed" ? (run.error ?? "something went wrong") : "waiting to start…")}</span>
                    <span className="trace-foot"><span><Clock size={12} /> {formatDuration(run.latencyMs)}</span><time>{formatTime(run.startedAt)}</time></span>
                  </span>
                </button>
              );
            })}
            {!!events.length && (
              <div className="event-ledger">
                <span>what just happened</span>
                {[...events].reverse().slice(0, 8).map(event => (
                  <div key={event._id}><i className={`event-${event.type}`} /><p>{String(event.detail).toLowerCase()}</p><time>{formatTime(event.createdAt)}</time></div>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "evals" && (
          <>
            <div className="eval-score">
              <div><strong>{passed}/{checks.length}</strong><span>checks passing</span></div>
              <div className="score-bars">{checks.map(check => <i key={check.label} className={`bar-${check.state}`} />)}</div>
              <small>{runs.some(run => ["pending", "running"].includes(run.status)) ? "still running" : passed === checks.length && checks.length ? "all green" : "live"}</small>
            </div>
            <div className="eval-table">
              <div className="eval-row eval-head"><strong>check</strong><span>meaning</span><span>state</span></div>
              {checks.map(check => (
                <div className="eval-row" key={check.label}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                  <span className={`eval-state eval-${check.state}`}>{check.state === "pass" ? <><CheckCircle size={13} weight="fill" /> pass</> : check.state === "waiting" ? <><Clock size={13} /> working</> : <><WarningCircle size={13} /> not yet</>}</span>
                </div>
              ))}
            </div>
            <button className="report-button" onClick={openReport}><FileText size={15} /> open the full eval report (markdown)</button>
            <p className="results-note">every check reads the stored record of this mission — no setup, no engineering. the report updates itself as agents finish.</p>
          </>
        )}
        {tab === "landing" && (
          <>
            <p className="panel-kicker">your landing page</p>
            {site ? (
              <>
                <button className="site-card" onClick={() => onOpenSite(site)}>
                  <span className="site-card-chrome"><i /><i /><i /><em>{site.url ? new URL(site.url).hostname : "built by landing"}</em></span>
                  <span className="site-card-body"><Globe size={26} /><strong>{site.title}</strong><small>click to view the website right here</small></span>
                </button>
                {site.url && <a className="landing-open" href={site.url} target="_blank" rel="noreferrer"><Globe size={15} /> open the live page in a new tab <ArrowRight size={14} /></a>}
              </>
            ) : (
              <div className="board-empty"><Globe size={26} /><strong>no live page yet</strong><p>ask founder to build a landing page and the live preview will show up right here.</p><button className="report-button" onClick={() => onPreset(MISSIONS[1].text)}><Code size={15} /> build my landing page</button></div>
            )}
            {landingDocs.map(artifact => (
              <button className="drawer-output" key={artifact._id} onClick={() => artifact.kind === "landing_page_preview" && artifact.sourceUrls[0] ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer") : onOpenArtifact(artifact)}>
                <span><ArtifactIcon kind={artifact.kind} /></span>
                <div><strong>{artifact.title}</strong><small>{artifact.kind.replaceAll("_", " ")} · {formatTime(artifact.createdAt)}</small></div>
                <ArrowRight size={14} />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ companyName, companyId, conversationId, projects, onOpenProject, onSwitch, onNewIdea }: { companyName: string; companyId: string; conversationId: string | null; projects: Project[]; onOpenProject: (project: Project, conversationId?: string) => void; onSwitch: () => void; onNewIdea: () => void }) {
  const current = projects.find(project => project._id === companyId);
  return (
    <div className="panel-body detail-panel settings-panel">
      <p className="panel-kicker">settings</p>
      <div className="settings-card">
        <span>this company</span>
        <strong>{companyName}</strong>
        <small>{current ? `${current.conversations.length} saved mission${current.conversations.length === 1 ? "" : "s"}` : "loading…"} · everything is saved in the cloud automatically</small>
        <div className="settings-actions">
          <button onClick={onSwitch}>switch company</button>
          <button onClick={onNewIdea}>start a new idea</button>
        </div>
      </div>
      {!!current?.conversations.length && (
        <div className="detail-tasks">
          <p className="panel-kicker">missions in this company</p>
          {current.conversations.map(conversation => (
            <button className={`mini-task ${conversation._id === conversationId ? "is-current" : ""}`} key={conversation._id} onClick={() => onOpenProject(current, conversation._id)}>
              <StatusDot status={conversation._id === conversationId ? "working" : "ready"} />
              <span>{conversation.title}</span>
              <time>{new Date(conversation.updatedAt).toLocaleDateString()}</time>
            </button>
          ))}
        </div>
      )}
      <div className="detail-tasks">
        <p className="panel-kicker">how this works</p>
        <div className="how-row"><b>1</b><div><strong>you talk to founder</strong><small>plain words. no setup, no jargon.</small></div></div>
        <div className="how-row"><b>2</b><div><strong>founder assigns the team</strong><small>research, landing and gtm each take a task.</small></div></div>
        <div className="how-row"><b>3</b><div><strong>you watch and open everything</strong><small>tasks, traces, evals and the live page — all on the record.</small></div></div>
      </div>
      <div className="permission-card"><CheckCircle size={17} weight="fill" /><p><strong>your work is safe.</strong><br />missions live in the cloud, tied to this browser's key. switching devices? just keep this browser signed in for now.</p></div>
    </div>
  );
}

/* ---------------- overlays ---------------- */

function ArtifactText({ content }: { content: string }) {
  return (
    <div className="artifact-document">
      {content.split("\n").map((line, index) => {
        const clean = line.trim();
        if (!clean) return <div className="document-space" key={index} />;
        if (/^#{1,3}\s/.test(clean)) return <h3 key={index}>{clean.replace(/^#{1,3}\s/, "")}</h3>;
        if (/^[A-Za-z][^:]{1,40}:$/.test(clean)) return <h3 key={index}>{clean.slice(0, -1)}</h3>;
        if (/^[-*]\s/.test(clean)) return <p className="document-bullet" key={index}>{clean.replace(/^[-*]\s/, "")}</p>;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

function ArtifactPreview({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  return (
    <div className="artifact-overlay" role="dialog" aria-modal="true" aria-label={artifact.title} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="artifact-modal">
        <header>
          <div className="artifact-modal-icon"><ArtifactIcon kind={artifact.kind} /></div>
          <div><span>{artifact.kind.replaceAll("_", " ")}</span><h2>{artifact.title}</h2></div>
          <button onClick={onClose} aria-label="close preview"><X size={19} /></button>
        </header>
        <div className="artifact-meta">
          <span><Clock size={13} /> {formatTime(artifact.createdAt)}</span>
          <span><LinkSimple size={13} /> {artifact.sourceUrls.length} sources</span>
          <span><Check size={13} /> saved forever</span>
        </div>
        <ArtifactText content={artifact.content} />
        {!!artifact.sourceUrls.length && (
          <footer>
            <span>sources</span>
            {artifact.sourceUrls.map((url, index) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}><b>{String(index + 1).padStart(2, "0")}</b><span>{new URL(url).hostname}</span><ArrowRight size={13} /></a>
            ))}
          </footer>
        )}
      </article>
    </div>
  );
}

function SiteViewer({ site, onClose }: { site: SiteView; onClose: () => void }) {
  return (
    <div className="artifact-overlay" role="dialog" aria-modal="true" aria-label={site.title} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className="site-viewer">
        <header>
          <span className="site-chrome"><i /><i /><i /></span>
          <div><span>{site.url ? new URL(site.url).hostname : "built in-house by landing"}</span><h2>{site.title}</h2></div>
          {site.url && <a className="site-live-button" href={site.url} target="_blank" rel="noreferrer"><Globe size={14} /> open live</a>}
          <button onClick={onClose} aria-label="close website"><X size={19} /></button>
        </header>
        <div className="site-viewer-frame">
          {site.html
            ? <iframe srcDoc={site.html} title={site.title} sandbox="allow-scripts" />
            : <iframe src={site.url} title={site.title} sandbox="allow-scripts allow-same-origin" />}
        </div>
        <footer>if the page looks blank here, it doesn't allow embedding — use "open live" to see it in a new tab.</footer>
      </article>
    </div>
  );
}

function TaskDrawer({ run, artifacts, onClose, onOpenArtifact }: { run: Run; artifacts: Artifact[]; onClose: () => void; onOpenArtifact: (artifact: Artifact) => void }) {
  const agent = agentFor(run.agentKey);
  const state = runStateWord(run);
  const outputs = artifacts.filter(artifact => artifact.runId === run._id);
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="task detail" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-drawer">
        <button className="drawer-close" onClick={onClose} aria-label="close task"><X size={17} /></button>
        <div className="run-export-buttons"><button onClick={() => saveTextFile(`founder-trace-${run._id}.json`, JSON.stringify({ run, artifacts: outputs }, null, 2), "application/json")}><DownloadSimple size={13} /> JSON</button><button onClick={() => saveTextFile(`founder-trace-${run._id}.md`, runMarkdown(run, artifacts), "text/markdown")}><DownloadSimple size={13} /> Markdown</button></div>
        <div className="drawer-agent">
          <img src={agent.avatar} alt="" />
          <div><p className="panel-kicker">task file</p><h2>{agent.name} · {runLabel(run)}</h2><em className={`state-chip chip-${state}`}>{state}</em></div>
        </div>
        <div className="drawer-section">
          <p className="panel-kicker">what {agent.name} says</p>
          {run.summary
            ? <p className="drawer-summary">"{run.summary}"</p>
            : run.status === "failed"
            ? <p className="drawer-summary drawer-error">"i hit a problem: {run.error ?? "something went wrong on my side"}. founder can send me back in."</p>
            : run.status === "running"
            ? <p className="drawer-summary">"{THINKING[run.agentKey]}"</p>
            : <p className="drawer-summary">"i'm queued up — i'll start the moment a desk frees up in the cloud."</p>}
        </div>
        <div className="drawer-timeline">
          <div><span>started</span><strong>{formatTime(run.startedAt)}</strong></div>
          <div><span>finished</span><strong>{run.completedAt ? formatTime(run.completedAt) : "—"}</strong></div>
          <div><span>took</span><strong>{formatDuration(run.latencyMs)}</strong></div>
          <div><span>assigned by</span><strong>{run.parentRunId ? "founder" : "you"}</strong></div>
        </div>
        <div className="trace-telemetry-grid">
          <div><span>model</span><strong>{run.trace?.model ?? "historical / unavailable"}</strong></div>
          <div><span>provider</span><strong>{run.trace?.provider ?? "—"}</strong></div>
          <div><span>input tokens</span><strong>{formatTokens(run.trace?.inputTokens)}</strong></div>
          <div><span>output tokens</span><strong>{formatTokens(run.trace?.outputTokens)}</strong></div>
          <div><span>cache read</span><strong>{formatTokens(run.trace?.cacheReadTokens)}</strong></div>
          <div><span>reasoning</span><strong>{formatTokens(run.trace?.reasoningTokens)}</strong></div>
          <div><span>API / tool calls</span><strong>{run.trace ? `${run.trace.apiCallCount} / ${run.trace.toolCallCount}` : "—"}</strong></div>
          <div><span>tracked cost</span><strong>{formatCost(run)}</strong></div>
        </div>
        <details className="trace-disclosure" open><summary>message sent to agent</summary><pre>{run.command?.message ?? "Unavailable for this historical run."}</pre></details>
        <details className="trace-disclosure"><summary>conversation context ({run.command?.context.length ?? 0} messages)</summary><div className="trace-context">{run.command?.context.map((item, index) => <p key={index}><b>{item.role}</b>{item.content}</p>) ?? <p>Unavailable.</p>}</div></details>
        <details className="trace-disclosure"><summary>exact Hermes prompt · {run.trace?.attemptCount ?? 0} attempt{run.trace?.attemptCount === 1 ? "" : "s"}</summary><pre>{run.trace?.prompt ?? "Unavailable for this historical run."}</pre></details>
        <details className="trace-disclosure" open><summary>reply returned by agent</summary><pre>{run.trace?.response ?? run.summary ?? run.error ?? "No reply recorded."}</pre></details>
        {!!run.trace?.sessionIds.length && <div className="trace-session"><span>Hermes sessions</span><code>{run.trace.sessionIds.join(" · ")}</code></div>}
        <div className="drawer-section">
          <p className="panel-kicker">what it made ({outputs.length})</p>
          {!outputs.length && <p className="drawer-empty">nothing produced on this task {run.status === "succeeded" ? "— it was a thinking / handoff step." : "yet."}</p>}
          {outputs.map(artifact => (
            <button className="drawer-output" key={artifact._id} onClick={() => artifact.kind === "landing_page_preview" && artifact.sourceUrls[0] ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer") : onOpenArtifact(artifact)}>
              <span><ArtifactIcon kind={artifact.kind} /></span>
              <div><strong>{artifact.title}</strong><small>{artifact.kind === "landing_page_preview" ? "● live page — click to open" : artifact.kind.replaceAll("_", " ")} · {artifact.sourceUrls.length} sources</small></div>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProjectSwitcher({ projects, showcases, currentId, onClose, onOpen, onNewProject, onNewMission }: { projects: Project[]; showcases: Project[]; currentId: string | null; onClose: () => void; onOpen: (project: Project, conversationId?: string) => void; onNewProject: () => void; onNewMission: (project: Project) => void }) {
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="companies" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-drawer project-drawer">
        <button className="drawer-close" onClick={onClose} aria-label="close companies"><X size={17} /></button>
        <div><p className="panel-kicker">founder.exe workspaces</p><h2>your companies</h2></div>
        <button className="create-project-button" onClick={onNewProject}><span>+</span><div><strong>start a new idea</strong><small>clean company, founder interviews you from scratch</small></div><ArrowRight size={16} /></button>
        {!!showcases.length && <div className="project-list">{showcases.map(project => <article key={project._id}><button className="project-main" onClick={() => onOpen(project)}><div><span>featured showcase</span><strong>{project.name}</strong><small>{project.description}</small></div><CheckCircle size={15} /></button></article>)}</div>}
        <div className="project-list">
          {projects.map(project => (
            <article className={project._id === currentId ? "active" : ""} key={project._id}>
              <button className="project-main" onClick={() => onOpen(project)}>
                <div><span>{project._id === currentId ? "active company" : "company"}</span><strong>{project.name}</strong><small>{project.conversations.length} saved mission{project.conversations.length === 1 ? "" : "s"}</small></div>
                <ArrowRight size={15} />
              </button>
              <div className="project-missions">
                {project.conversations.map(conversation => (
                  <button key={conversation._id} onClick={() => onOpen(project, conversation._id)}>
                    <i /><div><strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleDateString()} · {conversation.status}</small></div>
                  </button>
                ))}
                <button className="new-mission" onClick={() => onNewMission(project)}>+ new mission</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------- app shell ---------------- */

export function App() {
  const [ownerKey] = useState(() => {
    const existing = localStorage.getItem("founder.ownerKey");
    if (existing) return existing;
    const created = crypto.randomUUID(); localStorage.setItem("founder.ownerKey", created); return created;
  });
  const [companyId, setCompanyId] = useState<string | null>(() => localStorage.getItem("founder.companyId"));
  const [companyName, setCompanyName] = useState(() => localStorage.getItem("founder.companyName") || "your company");
  const [isShowcase, setIsShowcase] = useState(() => localStorage.getItem("founder.isShowcase") === "true");
  const [conversationId, setConversationId] = useState<string | null>(() => localStorage.getItem("founder.conversationId"));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [view, setView] = useState<WorkspaceView>("map");
  const [nav, setNav] = useState<"home" | "results" | "settings">("home");
  const [selectedAgent, setSelectedAgent] = useState<AgentKey | null>(null);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Artifact | null>(null);
  const [site, setSite] = useState<SiteView | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const createConversation = useMutation(api.conversations.createConversation);
  const sendMessage = useMutation(api.conversations.sendMessage);
  const data = useQuery(api.conversations.getConversation, conversationId ? { conversationId: conversationId as never } : "skip") as any;
  const projects = (useQuery(api.conversations.listProjects, { ownerKey }) as Project[] | undefined) ?? [];
  const showcases = (useQuery(api.conversations.listShowcases, {}) as Project[] | undefined) ?? [];
  const billingPlan = useQuery(api.billing.getPlan, { ownerKey }) as BillingPlan | undefined;
  const runs: Run[] = data?.runs ?? [];
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const events: any[] = data?.events ?? [];
  const progress = missionProgress(runs);
  const workingCount = runs.filter(run => run.status === "running").length;
  const sources = new Set(artifacts.flatMap(artifact => artifact.sourceUrls)).size;
  const active = runs.some(run => ["pending", "running"].includes(run.status));
  const openRun = openRunId ? runs.find(run => run._id === openRunId) ?? null : null;

  function exportMission(format: "json" | "markdown") {
    const slug = (data?.conversation?.title ?? "mission").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mission";
    if (format === "json") {
      saveTextFile(`founder-trace-${slug}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), conversation: data?.conversation, company: data?.company, runs, messages: data?.messages ?? [], events, artifacts }, null, 2), "application/json");
      return;
    }
    const totals = runs.reduce((value, run) => value + (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0), 0);
    const markdown = `# Founder.exe mission trace: ${data?.conversation?.title ?? "Untitled"}\n\n- Exported: ${new Date().toISOString()}\n- Runs: ${runs.length}\n- Total tokens: ${totals}\n- Sources: ${sources}\n\n${runs.map(run => runMarkdown(run, artifacts)).join("\n\n---\n\n")}`;
    saveTextFile(`founder-trace-${slug}.md`, markdown, "text/markdown");
  }

  useEffect(() => { if (data?.company?.name && !isShowcase) setCompanyName(data.company.name); }, [data?.company?.name, isShowcase]);

  function ready(id: string, name: string) {
    localStorage.setItem("founder.companyId", id); localStorage.setItem("founder.companyName", name);
    localStorage.removeItem("founder.isShowcase"); setIsShowcase(false); setCompanyId(id); setCompanyName(name);
  }

  function openProject(project: Project, selectedConversationId?: string) {
    const nextConversation = selectedConversationId ?? project.conversations[0]?._id ?? null;
    localStorage.setItem("founder.companyId", project._id); localStorage.setItem("founder.companyName", project.name);
    localStorage.setItem("founder.isShowcase", String(!!project.isShowcase)); setIsShowcase(!!project.isShowcase);
    if (nextConversation) localStorage.setItem("founder.conversationId", nextConversation); else localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id); setCompanyName(project.name); setConversationId(nextConversation); setShowProjects(false);
  }

  function newProject() {
    localStorage.removeItem("founder.companyId"); localStorage.removeItem("founder.companyName"); localStorage.removeItem("founder.conversationId"); localStorage.removeItem("founder.isShowcase");
    setCompanyId(null); setCompanyName("your company"); setConversationId(null); setIsShowcase(false); setShowProjects(false);
  }

  function newMission(project: Project) {
    localStorage.setItem("founder.companyId", project._id); localStorage.setItem("founder.companyName", project.name); localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id); setCompanyName(project.name); setConversationId(null); setShowProjects(false);
  }

  async function dispatch(text = message) {
    const value = text.trim();
    if (!value || !companyId || sending || isShowcase) return;
    setSending(true);
    try {
      if (!conversationId) {
        const id = await createConversation({ companyId: companyId as never, message: value });
        localStorage.setItem("founder.conversationId", id); setConversationId(id);
      } else await sendMessage({ conversationId: conversationId as never, message: value });
      setMessage("");
    } finally { setSending(false); }
  }

  if (!companyId) return <Onboarding ownerKey={ownerKey} projects={projects} showcases={showcases} onReady={ready} onOpen={openProject} />;

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="workspace-header">
          <Brand />
          <button className="company-label" onClick={() => setShowProjects(true)}><span>{isShowcase ? "showcase" : "company"}</span><strong>{companyName}</strong><small>switch ▾</small></button>
          <div className="runtime"><span className={`runtime-pulse ${active ? "" : "idle"}`} />{workingCount ? `${workingCount} working` : active ? "queued" : "all quiet"}</div>
          {billingPlan && <span className={`plan-chip plan-${billingPlan.plan}`}>{billingPlan.plan} · {billingPlan.used}/{billingPlan.limit}</span>}
          <button className="new-idea-button" onClick={newProject}>new idea</button>
        </header>

        <div className="mission-strip">
          <div><p>current mission</p><strong>{data?.conversation?.title || "give founder something to chase"}</strong></div>
          <div className="mission-stat"><span>status</span><strong className={active ? "live" : progress === 100 ? "done" : ""}>{active ? "running" : progress === 100 ? "complete" : "ready"}</strong></div>
          <div className="mission-stat"><span>tasks done</span><strong>{runs.filter(run => run.status === "succeeded").length} / {runs.length}</strong></div>
          <div className="mission-stat"><span>proof</span><strong>{sources} sources</strong></div>
          <div className="mission-progress"><i style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="map-wrap">
          <div className="map-tools" aria-label="workspace views">
            <button title="company map" aria-label="company map" className={view === "map" ? "active" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}><CirclesThreePlus size={18} /></button>
            <button title="the team" aria-label="the team" className={view === "team" ? "active" : ""} aria-pressed={view === "team"} onClick={() => setView("team")}><SquaresFour size={18} /></button>
            <button title="task tracker" aria-label="task tracker" className={view === "tasks" ? "active" : ""} aria-pressed={view === "tasks"} onClick={() => setView("tasks")}><ListChecks size={18} />{!!runs.length && <b>{runs.length}</b>}</button>
            <button title="finished work" aria-label="finished work" className={view === "outputs" ? "active" : ""} aria-pressed={view === "outputs"} onClick={() => setView("outputs")}><Files size={18} />{!!artifacts.length && <b>{artifacts.length}</b>}</button>
          </div>
          {view === "map" && <CompanyMap runs={runs} selected={selectedAgent} onSelect={key => setSelectedAgent(current => current === key ? null : key)} />}
          {view === "team" && <EmployeeGrid runs={runs} selected={selectedAgent} onSelect={key => setSelectedAgent(current => current === key ? null : key)} />}
          {view === "tasks" && <TaskBoard runs={runs} events={events} onOpen={run => setOpenRunId(run._id)} onExportJson={() => exportMission("json")} onExportMarkdown={() => exportMission("markdown")} />}
          {view === "outputs" && <OutputsBoard artifacts={artifacts} onOpen={setPreview} />}
          {(view === "map" || view === "team") && <div className="workspace-foot"><UsersThree size={15} /><span>founder.exe / {companyName}</span><strong>4 agents · convex live</strong></div>}
        </div>
      </section>

      <aside className="command-panel">
        <div className="product-nav">
          <button className={nav === "home" ? "active" : ""} onClick={() => { setNav("home"); setSelectedAgent(null); }}>home</button>
          <button className={nav === "results" ? "active" : ""} onClick={() => { setNav("results"); setSelectedAgent(null); }}>results</button>
          <button className={nav === "settings" ? "active" : ""} onClick={() => { setNav("settings"); setSelectedAgent(null); }}>settings</button>
        </div>
        {selectedAgent
          ? <AgentPanel agentKey={selectedAgent} runs={runs} artifacts={artifacts} onClose={() => setSelectedAgent(null)} onOpenTask={run => setOpenRunId(run._id)} />
          : nav === "results"
          ? <ResultsPanel conversationTitle={data?.conversation?.title} runs={runs} artifacts={artifacts} events={events} onOpenTask={run => setOpenRunId(run._id)} onOpenArtifact={setPreview} onOpenSite={setSite} onPreset={(text: string) => { setNav("home"); setMessage(text); void dispatch(text); }} />
          : nav === "settings"
          ? <SettingsPanel companyName={companyName} companyId={companyId} conversationId={conversationId} projects={projects} onOpenProject={openProject} onSwitch={() => setShowProjects(true)} onNewIdea={newProject} />
          : <Chat data={data} message={message} setMessage={setMessage} onSend={() => dispatch()} onPreset={(text: string) => { setMessage(text); void dispatch(text); }} sending={sending} onOpenTask={run => setOpenRunId(run._id)} onOpenArtifact={setPreview} onOpenSite={setSite} readOnly={isShowcase} />}
      </aside>

      {openRun && <TaskDrawer run={openRun} artifacts={artifacts} onClose={() => setOpenRunId(null)} onOpenArtifact={setPreview} />}
      {site && <SiteViewer site={site} onClose={() => setSite(null)} />}
      {preview && <ArtifactPreview artifact={preview} onClose={() => setPreview(null)} />}
      {showProjects && <ProjectSwitcher projects={projects} showcases={showcases} currentId={companyId} onClose={() => setShowProjects(false)} onOpen={openProject} onNewProject={newProject} onNewMission={newMission} />}
    </main>
  );
}
