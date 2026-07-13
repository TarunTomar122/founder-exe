import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  ArrowRight,
  ArrowClockwise,
  ArrowUp,
  ArrowsIn,
  ArrowsOut,
  Atom,
  Buildings,
  CalendarDots,
  CaretRight,
  ChartBar,
  Check,
  CheckCircle,
  CirclesThreePlus,
  Clock,
  Code,
  Compass,
  Copy,
  DownloadSimple,
  FileText,
  Files,
  Globe,
  LinkSimple,
  ListChecks,
  MagnifyingGlass,
  Megaphone,
  Play,
  Quotes,
  RocketLaunch,
  ShareNetwork,
  ShieldWarning,
  SpinnerGap,
  SpeakerHigh,
  Stop,
  SquaresFour,
  Target,
  TrendUp,
  Users,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

const api = anyApi as any;

type AgentKey = "founder" | "research" | "landing_page" | "go_to_market";
type RuntimeStatus = "ready" | "queued" | "working" | "complete" | "error";
type WorkspaceView = "map" | "team" | "tasks" | "outputs";
type WorkflowStage = "discovery" | "research" | "research_ready" | "building" | "cross_review" | "launch_ready" | "launched" | "measuring" | "complete";

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
  taskType?: "orchestrate" | "create" | "peer_review" | "revise" | "synthesize" | "measure";
  stage?: WorkflowStage;
  inputArtifactIds?: string[];
  createdAt: number;
  updatedAt: number;
};

type Run = {
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

type Message = {
  _id: string;
  role: "user" | "assistant";
  agentKey?: AgentKey;
  audience?: "user" | "internal";
  content: string;
  createdAt: number;
};

type ReviewFinding = { _id: string; runId: string; reviewerAgent: AgentKey; targetAgent: AgentKey; targetArtifactId?: string; targetArtifactKind: string; severity: "note" | "material" | "blocking"; feedback: string; acceptanceCriteria: string; round: number; status: "open" | "resolved" | "accepted"; createdAt: number };
type Campaign = { _id: string; publicKey: string; status: "draft" | "ready" | "live" | "paused" | "complete"; landingUrl?: string };
type ValidationSummary = { views: number; uniqueVisitors: number; ctaClicks: number; signups: number; conversionRate: number; bySource: Array<{ source: string; views: number; signups: number }> };

type Artifact = {
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

type Project = {
  _id: string;
  name: string;
  description?: string;
  isShowcase?: boolean;
  createdAt: number;
  conversations: Array<{ _id: string; title: string; status: string; createdAt: number; updatedAt: number }>;
};

type BillingPlan = {
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
  if (run.taskType === "peer_review") return `review ${run.command?.inputArtifactIds?.length ?? run.inputArtifactIds?.length ?? 0} team output${(run.command?.inputArtifactIds?.length ?? run.inputArtifactIds?.length ?? 0) === 1 ? "" : "s"}`;
  if (run.taskType === "revise") return `revise ${TASK_BRIEFS[run.agentKey]}`;
  if (run.taskType === "synthesize") return run.stage === "research_ready" ? "brief the user on market evidence" : "final campaign review";
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

function Onboarding({ ownerKey, projects, showcases, plan, onReady, onOpen, onUpgrade }: { ownerKey: string; projects: Project[]; showcases: Project[]; plan?: BillingPlan; onReady: (companyId: string, companyName: string) => void; onOpen: (project: Project, conversationId?: string) => void; onUpgrade: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bootstrap = useMutation(api.conversations.bootstrap);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (plan && !plan.canCreate) { onUpgrade(); return; }
    setBusy(true);
    try {
      const id = await bootstrap({ name: name.trim(), ownerKey });
      onReady(id, name.trim());
    } catch {
      setError("could not start this company. try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header"><Brand /><nav><span>How it works</span><span>Example projects</span><strong>{plan?.plan === "free" ? "First validation free" : `${plan?.plan ?? "private"} access`}</strong></nav></header>
      <section className="onboarding-modern">
        <div className="onboarding-copy">
          <div className="onboarding-badge"><span /> Research before you build</div>
          <h1>Find out if your idea<br />deserves to exist.</h1>
          <p className="lede">Founder turns a rough idea into cited market research, a reviewed validation campaign, a real waitlist page, and measurable demand signals—before you spend weeks building.</p>
          <div className="onboarding-steps"><article><b>01</b><div><strong>Pressure-test the idea</strong><small>Market size, competitors, audience evidence, positioning and risky assumptions.</small></div></article><article><b>02</b><div><strong>Launch the smallest useful test</strong><small>A reviewed campaign and landing page with real waitlist capture.</small></div></article><article><b>03</b><div><strong>Make a decision from behavior</strong><small>See which channels create visits, clicks and qualified signups.</small></div></article></div>
        </div>
        <aside className="onboarding-start-card">
          <header><span>New validation</span><small>About 5 minutes to first research</small></header>
          {plan?.canCreate === false ? (
            <div className="onboarding-paywall">
              <span>Free project used</span>
              <strong>Start another validation</strong>
              <p>Builder unlocks more monthly projects for $9. Your existing work stays available.</p>
              <button onClick={onUpgrade}>Upgrade with Dodo <ArrowRight size={17} /></button>
            </div>
          ) : (
            <form className="setup-form" onSubmit={submit}>
              <label>Project or idea name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. invoicing for freelance designers" required autoFocus /></label>
              <button disabled={busy}>{busy ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />} Start with Founder</button>
              <small>{plan?.plan === "internal" ? "Internal access active" : plan?.plan === "builder" ? "Builder usage active" : "No card required for your first project"}</small>
              {error && <p className="setup-error"><WarningCircle size={15} />{error}</p>}
            </form>
          )}
          <footer><div>{AGENTS.map(agent => <img src={agent.avatar} alt="" key={agent.key} />)}</div><span>Founder coordinates research, GTM and landing review</span></footer>
        </aside>
      </section>
      {(!!projects.length || !!showcases.length) && <section className="onboarding-projects"><header><div><span>Your workspace</span><h2>Continue where you left off</h2></div><small>Everything is saved automatically</small></header><div>{projects.slice(0, 6).map(project => <button type="button" key={project._id} onClick={() => onOpen(project)}><span className="project-initial">{project.name.slice(0, 1)}</span><div><strong>{project.name}</strong><small>{project.conversations.length} validation{project.conversations.length === 1 ? "" : "s"}</small></div><ArrowRight size={15} /></button>)}{showcases.map(project => <button type="button" key={project._id} onClick={() => onOpen(project)}><span className="project-initial showcase"><Check size={15} /></span><div><strong>{project.name}</strong><small>{project.description}</small></div><ArrowRight size={15} /></button>)}</div></section>}
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
            className={`artifact-card artifact-${artifact.kind} ${artifact.kind === "landing_page_preview" ? "is-live-preview" : ""}`}
            onClick={() => artifact.kind === "landing_page_preview" && artifact.sourceUrls[0] ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer") : onOpen(artifact)}
            key={artifact._id}
          >
            <div className="artifact-card-top"><span><ArtifactIcon kind={artifact.kind} /></span><em>output {String(artifacts.length - index).padStart(2, "0")}</em><ArrowRight size={15} /></div>
            <small>{artifact.kind === "landing_page_preview" ? "● live page — click to open" : artifact.kind.replaceAll("_", " ")}</small>
            <strong>{artifact.title}</strong>
            <p>{artifact.content.slice(0, 130)}{artifact.content.length > 130 ? "…" : ""}</p>
            {(artifact.kind === "research_report" || artifact.kind === "gtm_strategy" || artifact.kind === "social_posts") && <div className="artifact-visual-cue"><span>{artifact.kind === "research_report" ? <ChartBar size={13} /> : <ShareNetwork size={13} />} visual report</span><div>{artifact.sourceUrls.slice(0, 4).map(url => <SourceLogo url={url} key={url} />)}</div></div>}
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
  for (const message of messages.filter(message => message.audience !== "internal")) {
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
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
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

  function speak(id: string, content: string) {
    if (!("speechSynthesis" in window)) { setVoiceError("voice is not supported in this browser"); return; }
    if (speakingId === id && speechRef.current) {
      window.speechSynthesis.cancel();
      speechRef.current = null;
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    setVoiceError(null);
    setSpeakingId(id);
    const utterance = new SpeechSynthesisUtterance(content.slice(0, 1800));
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /samantha|ava|daniel|google uk english/i.test(voice.name)) ?? voices.find(voice => voice.lang.startsWith("en")) ?? null;
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    utterance.onend = () => { speechRef.current = null; setSpeakingId(null); };
    utterance.onerror = () => { speechRef.current = null; setSpeakingId(null); setVoiceError("voice playback failed"); };
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
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
                  <div className="message-head"><span>{agent.name}</span><button onClick={() => speak(item.id, item.content)} aria-label={speakingId === item.id ? "stop voice" : `listen to ${agent.name}`} title="browser voice">{speakingId === item.id ? <Stop size={12} weight="fill" /> : <SpeakerHigh size={13} />}{speakingId === item.id ? "stop" : "listen"}</button></div>
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
          {voiceError && <p className="voice-error">{voiceError}</p>}
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

function currentArtifact(artifacts: Artifact[], kind: string) {
  return [...artifacts].reverse().find(artifact => artifact.kind === kind && artifact.status !== "superseded") ?? [...artifacts].reverse().find(artifact => artifact.kind === kind);
}

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function MarketWorkspace({ artifact, stage, reviews, onApprove, onOpen }: { artifact?: Artifact; stage?: WorkflowStage; reviews: ReviewFinding[]; onApprove: () => void; onOpen: (artifact: Artifact) => void }) {
  const data = artifact?.data as any;
  if (artifact && !data?.icp) return <div className="legacy-deliverable"><div><FileText size={22} /><span><small>saved research</small><strong>{artifact.title}</strong><p>This project predates the structured market workspace. Its cited dossier is preserved exactly as it was generated.</p></span></div><button onClick={() => onOpen(artifact)}>open full dossier <ArrowRight size={14} /></button></div>;
  if (!artifact) return <div className="validation-empty"><MagnifyingGlass size={28} /><strong>research is building the evidence dossier.</strong><p>competitors, market sizing, customer signals, communities and assumptions will appear here as structured evidence.</p></div>;
  const maxMarket = Math.max(1, ...((data.marketSize ?? []).map((item: any) => item.valueHigh)));
  const relevantReviews = reviews.filter(review => review.targetArtifactKind === "research_report");
  return <div className="market-workspace">
    <section className={`market-verdict verdict-${data.verdict}`}><span>research verdict</span><strong>{String(data.verdict).replace("_", " ")}</strong><p>{data.decision}</p><button onClick={() => onOpen(artifact)}>open cited dossier <ArrowRight size={13} /></button></section>
    <section className="icp-card"><span>who hurts first</span><h3>{data.icp.segment}</h3><dl><div><dt>pain</dt><dd>{data.icp.problem}</dd></div><div><dt>trigger</dt><dd>{data.icp.trigger}</dd></div><div><dt>today</dt><dd>{data.icp.currentAlternative}</dd></div></dl></section>
    <section className="market-sizing"><header><div><span>market model</span><h3>ranges with the math exposed.</h3></div><small>no fake precision</small></header>{(data.marketSize ?? []).length ? data.marketSize.map((item: any) => <article key={item.label}><div><strong>{item.label}</strong><span className={`confidence-${item.confidence}`}>{item.confidence} confidence</span></div><b>{money(item.valueBase, item.currency)}</b><div className="market-range"><i style={{ width: `${Math.max(4, item.valueHigh / maxMarket * 100)}%` }} /></div><small>{money(item.valueLow, item.currency)} – {money(item.valueHigh, item.currency)} · {item.period}</small><p>{item.formula}</p></article>) : <p className="evidence-missing">credible sizing inputs were not available; research refused to invent a number.</p>}</section>
    <section className="position-card"><span>positioning gap</span><h3>{data.positioning?.promise}</h3><p>{data.positioning?.gap}</p><div>{(data.positioning?.risks ?? []).map((risk: string) => <em key={risk}><ShieldWarning size={12} />{risk}</em>)}</div></section>
    <section className="competitor-board"><header><span>competitive field</span><strong>{data.competitors?.length ?? 0} alternatives mapped</strong></header><div>{(data.competitors ?? []).map((item: any) => <article key={item.name}><h4>{item.name}</h4><p>{item.promise}</p><dl><div><dt>audience</dt><dd>{item.audience}</dd></div><div><dt>price</dt><dd>{item.pricing}</dd></div><div><dt>open gap</dt><dd>{item.gap}</dd></div></dl><footer>{item.sourceUrls?.length ?? 0} sources</footer></article>)}</div></section>
    <section className="signal-grid"><header><span>customer signals</span><strong>evidence, not vibes</strong></header><div>{(data.signals ?? []).map((signal: any) => <article key={signal.theme}><span className={`confidence-${signal.confidence}`}>{signal.confidence}</span><h4>{signal.theme}</h4><p>{signal.evidence}</p><small>{signal.sourceUrls?.length ?? 0} linked sources</small></article>)}</div></section>
    <section className="assumption-board"><header><span>riskiest assumptions</span><strong>what to test next</strong></header>{(data.assumptions ?? []).map((item: any) => <article key={item.assumption}><i className={`impact-${item.impact}`} /><div><strong>{item.assumption}</strong><small>{item.evidenceStrength} evidence · {item.impact} impact</small><p>{item.nextTest}</p></div></article>)}</section>
    {!!relevantReviews.length && <section className="review-board"><header><span>team review</span><strong>{relevantReviews.filter(review => review.status !== "open").length}/{relevantReviews.length} closed</strong></header>{relevantReviews.map(review => <article key={review._id} className={`finding-${review.severity}`}><img src={agentFor(review.reviewerAgent).avatar} alt="" /><div><strong>{agentFor(review.reviewerAgent).name} · {review.severity}</strong><p>{review.feedback}</p><small>{review.status} · pass when: {review.acceptanceCriteria}</small></div></article>)}</section>}
    {stage === "research_ready" && <section className="approval-gate"><CheckCircle size={22} /><div><strong>research is ready for your decision.</strong><p>keep discussing with founder or lock this evidence so GTM can design the test.</p></div><button onClick={onApprove}>approve research <ArrowRight size={14} /></button></section>}
  </div>;
}

function attributedLanding(url: string, platform: string, contentId: string) {
  const value = new URL(url); value.searchParams.set("utm_source", platform); value.searchParams.set("utm_medium", "organic"); value.searchParams.set("utm_campaign", "validation"); value.searchParams.set("utm_content", contentId); return value.toString();
}

function CampaignWorkspace({ artifact, campaign, stage, approvals, onApproveLaunch, onShare, onOpen }: { artifact?: Artifact; campaign?: Campaign; stage?: WorkflowStage; approvals: any[]; onApproveLaunch: () => void; onShare: (post: any) => void; onOpen: (artifact: Artifact) => void }) {
  const data = artifact?.data as any;
  if (artifact && !data?.channels) return <div className="legacy-deliverable"><div><Megaphone size={22} /><span><small>saved campaign</small><strong>{artifact.title}</strong><p>This earlier campaign remains available as its original complete report.</p></span></div><button onClick={() => onOpen(artifact)}>open campaign report <ArrowRight size={14} /></button></div>;
  if (!artifact) return <div className="validation-empty"><RocketLaunch size={28} /><strong>campaign work begins after research approval.</strong><p>GTM will score channels, build measurable experiments and draft platform-native content from the approved evidence.</p></div>;
  return <div className="campaign-workspace">
    <section className="campaign-thesis"><span>validation hypothesis</span><h3>{data.hypothesis}</h3><div><p><b>audience</b>{data.audience}</p><p><b>offer</b>{data.offer}</p><p><b>signal</b>{data.conversionEvent}</p></div></section>
    <section className="channel-board"><header><span>channel selection</span><strong>chosen for learning speed</strong></header>{data.channels.map((channel: any) => { const raw = [channel.intent, channel.reachability, channel.feedbackSpeed].map(Number); const scale = Math.max(...raw) <= 1 ? 100 : 10; const percentages = raw.map(value => Math.max(0, Math.min(100, value * scale))); const score = Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length); return <article key={`${channel.platform}-${channel.community ?? ""}`}><div className="channel-score"><strong>{score}</strong><small>/100</small></div><div><span>{channel.platform}{channel.community ? ` / ${channel.community}` : ""}</span><p>{channel.rationale}</p><div className="channel-bars"><i style={{ width: `${percentages[0]}%` }} /><i style={{ width: `${percentages[1]}%` }} /><i style={{ width: `${percentages[2]}%` }} /></div><small>{channel.rulesSummary}</small></div><em className={`risk-${channel.promotionRisk}`}>{channel.promotionRisk} promo risk</em></article>})}</section>
    <section className="experiment-timeline"><header><span>experiment calendar</span><strong>{data.experiments.length} measurable moves</strong></header>{data.experiments.map((experiment: any, index: number) => <article key={`${experiment.day}-${index}`}><b>day {experiment.day}</b><i /><div><strong>{experiment.platform} · {experiment.action}</strong><p>{experiment.asset}</p><small>measure {experiment.metric} · win: {experiment.successThreshold}</small><em>learn: {experiment.learningGoal}</em></div></article>)}</section>
    <section className="threshold-board"><article><span>continue</span><p>{data.thresholds.continue}</p></article><article><span>revise</span><p>{data.thresholds.revise}</p></article><article><span>stop</span><p>{data.thresholds.stop}</p></article></section>
    <section className="content-studio"><header><div><span>content studio</span><strong>platform-native, approval-safe.</strong></div><small>{campaign?.landingUrl ? "live link injected" : "waiting for landing url"}</small></header><div>{data.posts.map((post: any) => { const approved = approvals.some(item => item.objectType === "content" && item.objectId === post.id && item.decision === "approved"); const body = campaign?.landingUrl ? post.body.replaceAll("{{LANDING_URL}}", attributedLanding(campaign.landingUrl, post.platform, post.id)) : post.body; return <article key={post.id} className={`post-card platform-${post.platform}`}><header><div><span>{post.platform}</span><strong>{post.community ?? post.variant}</strong></div><em className={`risk-${post.risk}`}>{post.risk} risk</em></header>{post.title && <h4>{post.title}</h4>}<pre>{body}</pre><div className="post-rule"><ShieldWarning size={13} /><span>{post.ruleNotes}</span></div><footer><span>{body.length} chars · {post.variant}</span><button onClick={() => navigator.clipboard.writeText(body)}><Copy size={13} /> copy</button><button className="post-share" disabled={!campaign?.landingUrl || !["launched", "measuring", "complete"].includes(stage ?? "")} onClick={() => onShare({ ...post, body })}>{approved ? "open again" : "approve & open"} <ArrowRight size={13} /></button></footer></article>})}</div></section>
    {stage === "launch_ready" && <section className="approval-gate launch-gate"><RocketLaunch size={22} /><div><strong>the team approved one coherent campaign.</strong><p>you still control every external action. approve launch to unlock platform composers.</p></div><button onClick={onApproveLaunch}>approve launch <ArrowRight size={14} /></button></section>}
  </div>;
}

function SignalsWorkspace({ validation, campaign }: { validation?: ValidationSummary; campaign?: Campaign }) {
  const value = validation ?? { views: 0, uniqueVisitors: 0, ctaClicks: 0, signups: 0, conversionRate: 0, bySource: [] };
  return <div className="signals-workspace"><section className="signal-hero"><span>live validation</span><h3>{campaign?.status === "live" ? "the market is answering now." : "measurement starts when you approve launch."}</h3><p>views, intent clicks and real waitlist signups flow back from the stable Cloudflare page into Convex.</p></section><section className="funnel-grid"><article><span>page views</span><strong>{value.views}</strong><small>{value.uniqueVisitors} unique</small></article><i /><article><span>cta clicks</span><strong>{value.ctaClicks}</strong><small>{value.views ? `${Math.round(value.ctaClicks / value.views * 100)}%` : "—"} click rate</small></article><i /><article><span>signups</span><strong>{value.signups}</strong><small>{value.views ? `${(value.conversionRate * 100).toFixed(1)}%` : "—"} conversion</small></article></section><section className="source-performance"><header><span>source performance</span><strong>attributed by campaign link</strong></header>{value.bySource.length ? value.bySource.map(item => <article key={item.source}><strong>{item.source}</strong><div><i style={{ width: `${Math.max(3, value.views ? item.views / value.views * 100 : 0)}%` }} /></div><span>{item.views} views · {item.signups} signups</span></article>) : <div className="validation-empty compact"><TrendUp size={22} /><strong>no traffic yet</strong><p>share an approved draft and this board updates live.</p></div>}</section></div>;
}

function ResultsPanel({ data, runs, artifacts, events, onOpenTask, onOpenArtifact, onOpenSite, onApproveResearch, onApproveLaunch, onShare }: { data: any; runs: Run[]; artifacts: Artifact[]; events: any[]; onOpenTask: (run: Run) => void; onOpenArtifact: (artifact: Artifact) => void; onOpenSite: (site: SiteView) => void; onApproveResearch: () => void; onApproveLaunch: () => void; onShare: (post: any) => void }) {
  const [tab, setTab] = useState<"market" | "campaign" | "landing" | "signals" | "proof">("market");
  const research = currentArtifact(artifacts, "research_report"); const gtm = currentArtifact(artifacts, "gtm_strategy");
  const site = siteFor([...artifacts].reverse(), artifacts); const stage = data?.conversation?.stage as WorkflowStage | undefined;
  const reviews: ReviewFinding[] = data?.reviews ?? []; const approvals = data?.approvals ?? []; const ordered = [...runs].reverse();
  return <div className="panel-body results-panel validation-results"><div className="validation-tabs"><button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>market</button><button className={tab === "campaign" ? "active" : ""} onClick={() => setTab("campaign")}>campaign</button><button className={tab === "landing" ? "active" : ""} onClick={() => setTab("landing")}>landing</button><button className={tab === "signals" ? "active" : ""} onClick={() => setTab("signals")}>signals</button><button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}>proof</button></div><div className="results-scroll">
    {tab === "market" && <MarketWorkspace artifact={research} stage={stage} reviews={reviews} onApprove={onApproveResearch} onOpen={onOpenArtifact} />}
    {tab === "campaign" && <CampaignWorkspace artifact={gtm} campaign={data?.campaign} stage={stage} approvals={approvals} onApproveLaunch={onApproveLaunch} onShare={onShare} onOpen={onOpenArtifact} />}
    {tab === "landing" && <>{site ? <><button className="site-card validation-site-card" onClick={() => onOpenSite(site)}><span className="site-card-chrome"><i /><i /><i /><em>{site.url ? new URL(site.url).hostname : "built by landing"}</em></span><span className="site-card-body"><Globe size={26} /><strong>{site.title}</strong><small>stable url · real waitlist · attributed analytics</small></span></button>{site.url && <a className="landing-open" href={site.url} target="_blank" rel="noreferrer"><Globe size={15} /> open live validation page <ArrowRight size={14} /></a>}</> : <div className="validation-empty"><Globe size={28} /><strong>landing starts after GTM is reviewed.</strong><p>it will inherit approved evidence, campaign message and CTA, then Research and GTM both review it.</p></div>}<section className="review-board"><header><span>landing cross-review</span><strong>{reviews.filter(review => review.targetArtifactKind.includes("landing")).length} findings</strong></header>{reviews.filter(review => review.targetArtifactKind.includes("landing")).map(review => <article key={review._id} className={`finding-${review.severity}`}><img src={agentFor(review.reviewerAgent).avatar} alt="" /><div><strong>{agentFor(review.reviewerAgent).name} · {review.status}</strong><p>{review.feedback}</p><small>pass when: {review.acceptanceCriteria}</small></div></article>)}</section></>}
    {tab === "signals" && <SignalsWorkspace validation={data?.validation} campaign={data?.campaign} />}
    {tab === "proof" && <><section className="workflow-stage"><span>workflow stage</span><strong>{stage?.replaceAll("_", " ") ?? "legacy run"}</strong><div>{["discovery", "research", "research_ready", "building", "cross_review", "launch_ready", "launched"].map(item => <i className={item === stage ? "active" : ""} key={item} title={item} />)}</div></section>{ordered.map(run => { const agent = agentFor(run.agentKey); const state = runStateWord(run); return <button className={`trace-card trace-${state}`} key={run._id} onClick={() => onOpenTask(run)}><span className="trace-rail"><i /><em /></span><span className="trace-main"><span className="trace-head"><img src={agent.avatar} alt="" /><span><strong>{agent.name} · {run.taskType ?? "legacy task"}</strong><small>{run.stage?.replaceAll("_", " ") ?? (run.parentRunId ? "team handoff" : "user request")}</small></span><b className={`state-chip chip-${state}`}>{state}</b></span><span className="trace-body">{run.summary || (run.status === "running" ? THINKING[run.agentKey] : run.error ?? "waiting")}</span><span className="trace-foot"><span><Clock size={12} /> {formatDuration(run.latencyMs)}</span><span>{formatTokens((run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0))} tokens</span></span></span></button>})}{!!events.length && <div className="event-ledger"><span>team activity</span>{[...events].reverse().slice(0, 14).map(event => <div key={event._id}><i className={`event-${event.type}`} /><p>{String(event.detail).toLowerCase()}</p><time>{formatTime(event.createdAt)}</time></div>)}</div>}</>}
  </div></div>;
}

function SettingsPanel({ companyName, companyId, conversationId, projects, plan, onOpenProject, onSwitch, onNewIdea, onUpgrade }: { companyName: string; companyId: string; conversationId: string | null; projects: Project[]; plan?: BillingPlan; onOpenProject: (project: Project, conversationId?: string) => void; onSwitch: () => void; onNewIdea: () => void; onUpgrade: () => void }) {
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
      <div className={`billing-card ${plan?.plan !== "free" ? "is-paid" : ""}`}>
        <div><span>{plan?.plan === "internal" ? "internal access" : plan?.plan === "builder" ? "builder plan" : "free plan"}</span><strong>{plan?.plan === "internal" ? "bypass active" : plan?.plan === "builder" ? "$9 / month" : "$0 forever"}</strong></div>
        <p>{plan?.plan === "internal" ? "internal browser access is active. dodo checkout is bypassed." : plan?.plan === "builder" ? "more monthly usage is unlocked on this browser." : "one complete project is free. upgrade when you are ready for more usage."}</p>
        {plan?.plan !== "internal" && <div className="usage-track"><i style={{ width: `${Math.min(100, ((plan?.used ?? 0) / (plan?.limit ?? 1)) * 100)}%` }} /></div>}
        <small>{plan?.plan === "internal" ? `${plan.used} internal projects created` : `${plan?.used ?? 0} / ${plan?.limit ?? 1} projects used`}</small>
        {plan?.plan === "free" && <button onClick={onUpgrade}>unlock more usage <ArrowRight size={14} /></button>}
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

type ReportSection = { title: string; lines: string[] };

function cleanMarkdown(value: string) {
  return value.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/\*\*/g, "").trim();
}

function parseReport(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  let current: ReportSection = { title: "overview", lines: [] };
  for (const original of content.split("\n")) {
    const line = original.trim();
    const markdownHeading = line.match(/^#{1,4}\s+(.+)/);
    const plainHeading = line.match(/^([A-Za-z][^:]{2,52}):$/);
    if (markdownHeading || plainHeading) {
      if (current.lines.some(Boolean)) sections.push(current);
      current = { title: cleanMarkdown(markdownHeading?.[1] ?? plainHeading?.[1] ?? "section"), lines: [] };
    } else if (line) current.lines.push(line);
  }
  if (current.lines.some(Boolean)) sections.push(current);
  return sections.length ? sections : [{ title: "overview", lines: content.split("\n").filter(Boolean) }];
}

function sectionSlug(title: string, index: number) {
  return `report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || index}`;
}

function SectionIcon({ title, size = 18 }: { title: string; size?: number }) {
  const value = title.toLowerCase();
  if (/competitor|landscape|alternative/.test(value)) return <Buildings size={size} />;
  if (/audience|user|customer|persona|community/.test(value)) return <Users size={size} />;
  if (/risk|threat|warning|constraint/.test(value)) return <ShieldWarning size={size} />;
  if (/position|gap|opportunity|recommend/.test(value)) return <Target size={size} />;
  if (/metric|signal|market|trend|growth/.test(value)) return <TrendUp size={size} />;
  if (/week|day|timeline|sequence|plan|experiment/.test(value)) return <CalendarDots size={size} />;
  if (/channel|distribution|platform/.test(value)) return <ShareNetwork size={size} />;
  if (/message|post|copy|content/.test(value)) return <Megaphone size={size} />;
  if (/quote|language|voice/.test(value)) return <Quotes size={size} />;
  return <Compass size={size} />;
}

function RichInline({ children }: { children: string }) {
  const parts = children.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g);
  return <>{parts.map((part, index) => {
    const markdown = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    const raw = part.match(/^https?:\/\//) ? part.replace(/[),.;]+$/, "") : null;
    if (markdown) return <a href={markdown[2]} target="_blank" rel="noreferrer" key={index}>{markdown[1]} <ArrowRight size={11} /></a>;
    if (raw) return <a href={raw} target="_blank" rel="noreferrer" key={index}>{new URL(raw).hostname} <ArrowRight size={11} /></a>;
    return <span key={index}>{part.replace(/\*\*/g, "")}</span>;
  })}</>;
}

function ReportSectionBody({ lines }: { lines: string[] }) {
  const tableLines = lines.filter(line => line.includes("|") && line.split("|").filter(Boolean).length > 1);
  const tableRows = tableLines.map(line => line.split("|").map(cell => cleanMarkdown(cell)).filter(Boolean)).filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
  const prose = lines.filter(line => !tableLines.includes(line));
  return (
    <>
      {tableRows.length > 1 && (
        <div className="visual-table-wrap"><table><thead><tr>{tableRows[0].map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead><tbody>{tableRows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><RichInline>{cell}</RichInline></td>)}</tr>)}</tbody></table></div>
      )}
      <div className="visual-prose">
        {prose.map((line, index) => {
          const bullet = /^[-*]\s+/.test(line);
          const numbered = /^\d+[.)]\s+/.test(line);
          return <p className={bullet || numbered ? "visual-bullet" : ""} key={index}>{(bullet || numbered) && <b>{numbered ? line.match(/^\d+/)?.[0] : ""}</b>}<RichInline>{cleanMarkdown(line)}</RichInline></p>;
        })}
      </div>
    </>
  );
}

function SourceLogo({ url }: { url: string }) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" />;
}

function ResearchVisual({ artifact }: { artifact: Artifact }) {
  const sections = parseReport(artifact.content);
  const competitors = sections.find(section => /competitor|landscape|alternative/i.test(section.title));
  const competitorRows = competitors?.lines.filter(line => line.includes("|")).length ?? 0;
  return (
    <div className="visual-report research-report">
      <section className="report-hero">
        <div><span><ChartBar size={16} /> market intelligence</span><h3>the signal, without the wall of text.</h3><p>scan the market shape, jump to a finding, then open the evidence behind it.</p></div>
        <div className="report-stats"><div><strong>{Math.max(0, competitorRows - 2)}</strong><small>competitors mapped</small></div><div><strong>{sections.length}</strong><small>insight areas</small></div><div><strong>{artifact.sourceUrls.length}</strong><small>live sources</small></div></div>
      </section>
      <nav className="report-jump" aria-label="report sections">{sections.slice(0, 8).map((section, index) => <a href={`#${sectionSlug(section.title, index)}`} key={index}><SectionIcon title={section.title} size={13} /> {section.title}</a>)}</nav>
      {!!artifact.sourceUrls.length && <div className="source-logo-rail"><span>evidence from</span>{artifact.sourceUrls.slice(0, 7).map(url => <a href={url} target="_blank" rel="noreferrer" title={new URL(url).hostname} key={url}><SourceLogo url={url} /><small>{new URL(url).hostname.replace(/^www\./, "")}</small></a>)}</div>}
      <div className="report-section-grid">{sections.map((section, index) => {
        const wide = /competitor|landscape|recommend|summary|overview/i.test(section.title) || section.lines.some(line => line.includes("|"));
        return <article className={`visual-section ${wide ? "is-wide" : ""}`} id={sectionSlug(section.title, index)} key={index}><header><span><SectionIcon title={section.title} /></span><div><small>{String(index + 1).padStart(2, "0")}</small><h4>{section.title}</h4></div></header><ReportSectionBody lines={section.lines} /></article>;
      })}</div>
    </div>
  );
}

function GtmVisual({ artifact }: { artifact: Artifact }) {
  const sections = parseReport(artifact.content);
  const isPosts = artifact.kind === "social_posts";
  const copySection = async (section: ReportSection) => { try { await navigator.clipboard.writeText(section.lines.map(cleanMarkdown).join("\n")); } catch { /* Clipboard can be unavailable in embedded browsers. */ } };
  return (
    <div className={`visual-report gtm-report ${isPosts ? "social-report" : ""}`}>
      <section className="report-hero">
        <div><span><Megaphone size={16} /> {isPosts ? "content studio" : "launch control"}</span><h3>{isPosts ? "platform-ready posts, separated and ready to ship." : "a launch plan you can read like a campaign board."}</h3><p>{isPosts ? "each post gets its own canvas, channel cue, and copy action." : "channels, experiments, timing, metrics, and stop conditions stay visible at a glance."}</p></div>
        <div className="report-stats"><div><strong>{sections.length}</strong><small>{isPosts ? "post blocks" : "campaign blocks"}</small></div><div><strong>{artifact.sourceUrls.length}</strong><small>references</small></div><div><strong>14</strong><small>day launch lens</small></div></div>
      </section>
      <nav className="report-jump" aria-label="campaign sections">{sections.slice(0, 8).map((section, index) => <a href={`#${sectionSlug(section.title, index)}`} key={index}><SectionIcon title={section.title} size={13} /> {section.title}</a>)}</nav>
      <div className="gtm-flow">{sections.map((section, index) => {
        const timeline = /week|day|sequence|timeline|experiment/i.test(section.title);
        return <article className={`visual-section ${timeline ? "is-timeline" : ""} ${isPosts ? "is-post" : ""}`} id={sectionSlug(section.title, index)} key={index}><header><span><SectionIcon title={section.title} /></span><div><small>{timeline ? `phase ${index + 1}` : `block ${index + 1}`}</small><h4>{section.title}</h4></div>{isPosts && <button onClick={() => void copySection(section)} title="copy post"><Copy size={14} /> copy</button>}</header><ReportSectionBody lines={section.lines} /></article>;
      })}</div>
      {!!artifact.sourceUrls.length && <div className="source-logo-rail"><span>campaign references</span>{artifact.sourceUrls.slice(0, 7).map(url => <a href={url} target="_blank" rel="noreferrer" title={new URL(url).hostname} key={url}><SourceLogo url={url} /><small>{new URL(url).hostname.replace(/^www\./, "")}</small></a>)}</div>}
    </div>
  );
}

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
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    function keyDown(event: globalThis.KeyboardEvent) { if (event.key === "Escape") fullscreen ? setFullscreen(false) : onClose(); }
    window.addEventListener("keydown", keyDown); return () => window.removeEventListener("keydown", keyDown);
  }, [fullscreen, onClose]);
  const isResearch = artifact.kind === "research_report";
  const isGtm = artifact.kind === "gtm_strategy" || artifact.kind === "social_posts";
  return (
    <div className="artifact-overlay" role="dialog" aria-modal="true" aria-label={artifact.title} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <article className={`artifact-modal ${fullscreen ? "is-fullscreen" : ""} ${isResearch || isGtm ? "is-visual-report" : ""}`}>
        <header>
          <div className="artifact-modal-icon"><ArtifactIcon kind={artifact.kind} /></div>
          <div><span>{artifact.kind.replaceAll("_", " ")}</span><h2>{artifact.title}</h2></div>
          <div className="artifact-modal-actions"><button onClick={() => saveTextFile(`${artifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, artifact.content, "text/markdown")} aria-label="download report" title="download"><DownloadSimple size={17} /></button><button onClick={() => setFullscreen(value => !value)} aria-label={fullscreen ? "exit fullscreen" : "open fullscreen"} title={fullscreen ? "exit fullscreen" : "fullscreen"}>{fullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}</button><button onClick={onClose} aria-label="close preview"><X size={19} /></button></div>
        </header>
        <div className="artifact-meta">
          <span><Clock size={13} /> {formatTime(artifact.createdAt)}</span>
          <span><LinkSimple size={13} /> {artifact.sourceUrls.length} sources</span>
          <span><Check size={13} /> saved forever</span>
        </div>
        {isResearch ? <ResearchVisual artifact={artifact} /> : isGtm ? <GtmVisual artifact={artifact} /> : <ArtifactText content={artifact.content} />}
        {!!artifact.sourceUrls.length && (
          <footer>
            <span>sources</span>
            {artifact.sourceUrls.map((url, index) => (
              <a href={url} target="_blank" rel="noreferrer" key={url}><b>{String(index + 1).padStart(2, "0")}</b><SourceLogo url={url} /><span>{new URL(url).hostname}</span><ArrowRight size={13} /></a>
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
  const detail = useQuery(api.conversations.getRunTrace, { runId: run._id as never }) as { trace?: Run["trace"]; command?: RunCommand; artifacts?: Artifact[] } | null | undefined;
  const trace = detail?.trace ?? run.trace;
  const command = detail?.command ?? run.command;
  const fullRun = { ...run, trace, command };
  const agent = agentFor(run.agentKey);
  const state = runStateWord(run);
  const outputs = detail?.artifacts ?? artifacts.filter(artifact => artifact.runId === run._id);
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="task detail" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-drawer">
        <button className="drawer-close" onClick={onClose} aria-label="close task"><X size={17} /></button>
        <div className="run-export-buttons"><button onClick={() => saveTextFile(`founder-trace-${run._id}.json`, JSON.stringify({ run: fullRun, artifacts: outputs }, null, 2), "application/json")}><DownloadSimple size={13} /> JSON</button><button onClick={() => saveTextFile(`founder-trace-${run._id}.md`, runMarkdown(fullRun, artifacts), "text/markdown")}><DownloadSimple size={13} /> Markdown</button></div>
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
          <div><span>model</span><strong>{trace?.model ?? "historical / unavailable"}</strong></div>
          <div><span>provider</span><strong>{trace?.provider ?? "—"}</strong></div>
          <div><span>input tokens</span><strong>{formatTokens(trace?.inputTokens)}</strong></div>
          <div><span>output tokens</span><strong>{formatTokens(trace?.outputTokens)}</strong></div>
          <div><span>cache read</span><strong>{formatTokens(trace?.cacheReadTokens)}</strong></div>
          <div><span>reasoning</span><strong>{formatTokens(trace?.reasoningTokens)}</strong></div>
          <div><span>API / tool calls</span><strong>{trace ? `${trace.apiCallCount} / ${trace.toolCallCount}` : "—"}</strong></div>
          <div><span>tracked cost</span><strong>{formatCost(fullRun)}</strong></div>
        </div>
        <details className="trace-disclosure" open><summary>message sent to agent</summary><pre>{command?.message ?? (detail === undefined ? "Loading exact command…" : "Unavailable for this historical run.")}</pre></details>
        <details className="trace-disclosure"><summary>conversation context ({command?.context.length ?? 0} messages)</summary><div className="trace-context">{command?.context.map((item, index) => <p key={index}><b>{item.role}</b>{item.content}</p>) ?? <p>{detail === undefined ? "Loading…" : "Unavailable."}</p>}</div></details>
        <details className="trace-disclosure"><summary>exact Hermes prompt · {trace?.attemptCount ?? 0} attempt{trace?.attemptCount === 1 ? "" : "s"}</summary><pre>{trace?.prompt || (detail === undefined ? "Loading exact prompt…" : "Unavailable for this historical run.")}</pre></details>
        <details className="trace-disclosure" open><summary>reply returned by agent</summary><pre>{trace?.response || run.summary || run.error || (detail === undefined ? "Loading exact reply…" : "No reply recorded.")}</pre></details>
        {!!trace?.sessionIds.length && <div className="trace-session"><span>Hermes sessions</span><code>{trace.sessionIds.join(" · ")}</code></div>}
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

function ProjectSwitcher({ projects, showcases, currentId, plan, onClose, onOpen, onNewProject, onNewMission }: { projects: Project[]; showcases: Project[]; currentId: string | null; plan?: BillingPlan; onClose: () => void; onOpen: (project: Project, conversationId?: string) => void; onNewProject: () => void; onNewMission: (project: Project) => void }) {
  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="companies" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="task-drawer project-drawer">
        <button className="drawer-close" onClick={onClose} aria-label="close companies"><X size={17} /></button>
        <div><p className="panel-kicker">founder.exe workspaces</p><h2>your companies</h2></div>
        <button className={`create-project-button ${plan?.canCreate === false ? "is-locked" : ""}`} onClick={onNewProject}><span>+</span><div><strong>{plan?.canCreate === false ? "unlock more usage" : "start a new idea"}</strong><small>{plan?.canCreate === false ? "$9/month unlocks more usage" : plan?.plan === "free" ? "your first project is free" : "builder usage is active"}</small></div><ArrowRight size={16} /></button>
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

function BillingModal({ plan, busy, error, onClose, onCheckout, onBypass }: { plan?: BillingPlan; busy: boolean; error: string | null; onClose: () => void; onCheckout: () => void; onBypass: () => void }) {
  return (
    <div className="billing-backdrop" role="dialog" aria-modal="true" aria-label="upgrade to builder" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="billing-modal">
        <button className="billing-close" onClick={onClose} aria-label="close billing"><X size={17} /></button>
        <p className="panel-kicker">builder plan</p>
        <h2>build more than one thing.</h2>
        <p className="billing-lede">your first project is free and stays free. builder unlocks more usage for everything you want to create.</p>
        <div className="billing-price"><strong>$9</strong><span>usd<br />per month</span></div>
        <div className="billing-features">
          <p><CheckCircle size={16} weight="fill" /> more monthly usage</p>
          <p><CheckCircle size={16} weight="fill" /> all four specialist agents</p>
          <p><CheckCircle size={16} weight="fill" /> research, pages and launch plans saved</p>
          <p><CheckCircle size={16} weight="fill" /> secure checkout powered by dodo</p>
        </div>
        {error && <div className="billing-error"><WarningCircle size={15} /> {error}</div>}
        {plan?.plan === "builder" || plan?.plan === "internal" ? <button className="billing-cta" onClick={onClose}><Check size={17} /> {plan.plan === "internal" ? "internal access is active" : "builder is active"}</button> : <button className="billing-cta" onClick={onCheckout} disabled={busy}>{busy ? <SpinnerGap className="spin" size={17} /> : <ArrowRight size={17} />} continue to secure checkout</button>}
        <>
          <button className="billing-bypass" onClick={onBypass} disabled={busy}><Code size={14} /> continue without payment <span>(test mode)</span></button>
          <small className="billing-test-note">test mode — no dodo checkout or charge</small>
        </>
        <small>cancel anytime in dodo. usage refreshes monthly.</small>
      </section>
    </div>
  );
}

/* ---------------- app shell ---------------- */

type JourneyView = "idea" | "market" | "campaign" | "landing" | "signals" | "team";

const JOURNEY: Array<{ key: JourneyView; label: string; icon: typeof Compass }> = [
  { key: "idea", label: "idea", icon: Compass }, { key: "market", label: "market", icon: ChartBar }, { key: "campaign", label: "campaign", icon: RocketLaunch }, { key: "landing", label: "landing", icon: Globe }, { key: "signals", label: "signals", icon: TrendUp }, { key: "team", label: "team", icon: UsersThree },
];

const STAGE_ORDER: WorkflowStage[] = ["discovery", "research", "research_ready", "building", "cross_review", "launch_ready", "launched", "measuring", "complete"];

function suggestedView(stage?: WorkflowStage): JourneyView {
  if (!stage || stage === "discovery") return "idea";
  if (["research", "research_ready"].includes(stage)) return "market";
  if (stage === "building") return "campaign";
  if (["cross_review", "launch_ready"].includes(stage)) return "landing";
  return "signals";
}

function IdeaWorkspace({ data, runs, sources, onGo }: { data: any; runs: Run[]; sources: number; onGo: (view: JourneyView) => void }) {
  const stage = data?.conversation?.stage as WorkflowStage | undefined;
  const research = currentArtifact(data?.artifacts ?? [], "research_report");
  const gtm = currentArtifact(data?.artifacts ?? [], "gtm_strategy");
  const landing = currentArtifact(data?.artifacts ?? [], "landing_page_preview");
  const stageIndex = stage ? STAGE_ORDER.indexOf(stage) : -1;
  return <div className="idea-workspace">
    <section className="idea-hero"><div><span>validation command center</span><h1>{data?.conversation?.title ?? "tell founder the messy version."}</h1><p>{data ? "founder is turning this idea into evidence, a measurable campaign, and a real signal from the market." : "describe what it does and who feels the pain. founder will ask what matters before the team moves."}</p></div><div className="idea-pulse"><i className={runs.some(run => run.status === "running") ? "is-live" : ""} /><strong>{runs.some(run => run.status === "running") ? "team working" : stage?.replaceAll("_", " ") ?? "waiting for your pitch"}</strong><small>convex live workflow</small></div></section>
    <section className="journey-overview"><header><span>from idea to signal</span><strong>nothing advances without evidence or approval.</strong></header><div>{STAGE_ORDER.slice(0, 7).map((item, index) => <article className={`${index < stageIndex ? "is-done" : ""} ${item === stage ? "is-current" : ""}`} key={item}><i>{index < stageIndex ? <Check size={12} /> : String(index + 1).padStart(2, "0")}</i><strong>{item.replaceAll("_", " ")}</strong><small>{item === "research_ready" || item === "launch_ready" ? "your decision" : index % 2 ? "team review" : "agent work"}</small></article>)}</div></section>
    <section className="idea-stats"><article><span>evidence</span><strong>{sources}</strong><small>unique sources</small></article><article><span>agent work</span><strong>{runs.filter(run => run.status === "succeeded").length}</strong><small>{runs.length} tasks total</small></article><article><span>peer review</span><strong>{runs.filter(run => run.taskType === "peer_review").length}</strong><small>cross-checks run</small></article><article><span>real signals</span><strong>{data?.validation?.signups ?? 0}</strong><small>waitlist signups</small></article></section>
    <section className="deliverable-roadmap"><header><span>your validation stack</span><strong>open any layer</strong></header><div><button onClick={() => onGo("market")} className={research ? "is-ready" : ""}><ChartBar size={20} /><div><strong>market dossier</strong><small>{research ? `${research.data?.competitors?.length ?? 0} competitors · ${research.sourceUrls.length} sources` : "research queued after founder understands the idea"}</small></div><ArrowRight size={15} /></button><button onClick={() => onGo("campaign")} className={gtm ? "is-ready" : ""}><RocketLaunch size={20} /><div><strong>validation campaign</strong><small>{gtm ? `${gtm.data?.channels?.length ?? 0} channels · ${gtm.data?.posts?.length ?? 0} drafts` : "blocked until research is approved"}</small></div><ArrowRight size={15} /></button><button onClick={() => onGo("landing")} className={landing ? "is-ready" : ""}><Globe size={20} /><div><strong>stable waitlist page</strong><small>{landing ? "live capture and attribution connected" : "built after campaign message is reviewed"}</small></div><ArrowRight size={15} /></button><button onClick={() => onGo("signals")} className={data?.campaign?.status === "live" ? "is-ready" : ""}><TrendUp size={20} /><div><strong>demand signals</strong><small>{data?.campaign?.status === "live" ? "measuring the live campaign" : "starts after your launch approval"}</small></div><ArrowRight size={15} /></button></div></section>
  </div>;
}

function LandingWorkspace({ artifacts, reviews, onOpenSite, onOpenArtifact }: { artifacts: Artifact[]; reviews: ReviewFinding[]; onOpenSite: (site: SiteView) => void; onOpenArtifact: (artifact: Artifact) => void }) {
  const site = siteFor([...artifacts].reverse(), artifacts); const brief = currentArtifact(artifacts, "landing_page_brief"); const landingReviews = reviews.filter(review => review.targetArtifactKind.includes("landing"));
  return <div className="landing-workspace">{site ? <section className="landing-hero"><button className="site-card validation-site-card" onClick={() => onOpenSite(site)}><span className="site-card-chrome"><i /><i /><i /><em>{site.url ? new URL(site.url).hostname : "built by landing"}</em></span><span className="site-card-body"><Globe size={30} /><strong>{site.title}</strong><small>stable url · real waitlist · attributed analytics</small></span></button><div>{site.url && <a className="landing-open" href={site.url} target="_blank" rel="noreferrer"><Globe size={15} /> open live validation page <ArrowRight size={14} /></a>}{brief && <button className="landing-brief-button" onClick={() => onOpenArtifact(brief)}><FileText size={15} /> open message + claim brief</button>}</div></section> : <div className="validation-empty"><Globe size={30} /><strong>the page waits for an approved strategy.</strong><p>landing consumes the research and campaign, then both specialists review every claim and CTA before founder presents it.</p></div>}{brief?.data && <section className="landing-contract"><header><span>conversion contract</span><strong>what this page must prove</strong></header><div><article><span>audience</span><p>{brief.data.audience}</p></article><article><span>five-second promise</span><p>{brief.data.promise}</p></article><article><span>primary action</span><p>{brief.data.primaryCta}</p></article><article><span>qualifying question</span><p>{brief.data.waitlistQuestion}</p></article></div></section>}<section className="review-board landing-review-board"><header><span>cross-review ledger</span><strong>{landingReviews.filter(review => review.status !== "open").length}/{landingReviews.length} closed</strong></header>{landingReviews.length ? landingReviews.map(review => <article key={review._id} className={`finding-${review.severity}`}><img src={agentFor(review.reviewerAgent).avatar} alt="" /><div><strong>{agentFor(review.reviewerAgent).name} · round {review.round}</strong><p>{review.feedback}</p><small>{review.status} · pass when: {review.acceptanceCriteria}</small></div></article>) : <div className="validation-empty compact"><ShieldWarning size={22} /><strong>reviews appear with the first page draft.</strong><p>research checks truth; GTM checks conversion and message continuity.</p></div>}</section></div>;
}

function TeamWorkspace({ runs, reviews, events, onOpenTask, onExport }: { runs: Run[]; reviews: ReviewFinding[]; events: any[]; onOpenTask: (run: Run) => void; onExport: (format: "json" | "markdown") => void }) {
  return <div className="team-workspace"><section className="team-export"><div><span>portable mission record</span><strong>share the complete work, not a screenshot.</strong></div><button onClick={() => onExport("json")}><DownloadSimple size={14} /> JSON</button><button onClick={() => onExport("markdown")}><DownloadSimple size={14} /> Markdown</button></section><section className="team-roster"><header><span>the validation crew</span><strong>every handoff is real and inspectable</strong></header><div>{AGENTS.map(agent => { const own = runs.filter(run => run.agentKey === agent.key); const latest = own.at(-1); return <article key={agent.key}><img src={agent.avatar} alt="" /><div><span>{agent.role}</span><strong>{agent.name}</strong><p>{latest ? runLabel(latest) : "waiting for the workflow"}</p></div><em className={`state-chip chip-${statusFor(agent.key, runs)}`}>{statusFor(agent.key, runs)}</em></article>})}</div></section><section className="handoff-graph"><header><span>work graph</span><strong>create → review → revise → synthesize</strong></header>{runs.length ? runs.map((run, index) => <button key={run._id} onClick={() => onOpenTask(run)}><i>{String(index + 1).padStart(2, "0")}</i><img src={agentFor(run.agentKey).avatar} alt="" /><div><strong>{agentFor(run.agentKey).name} · {run.taskType ?? "legacy"}</strong><small>{run.stage?.replaceAll("_", " ") ?? "legacy"} · {runLabel(run)}</small></div><em className={`state-chip chip-${runStateWord(run)}`}>{runStateWord(run)}</em></button>) : <div className="validation-empty compact"><Atom size={22} /><strong>the graph starts after your first message.</strong></div>}</section><section className="review-board"><header><span>review findings</span><strong>{reviews.length} checks</strong></header>{reviews.map(review => <article key={review._id} className={`finding-${review.severity}`}><img src={agentFor(review.reviewerAgent).avatar} alt="" /><div><strong>{agentFor(review.reviewerAgent).name} reviewed {review.targetArtifactKind.replaceAll("_", " ")}</strong><p>{review.feedback}</p><small>{review.status} · {review.acceptanceCriteria}</small></div></article>)}</section><section className="event-ledger team-event-ledger"><span>workflow ledger</span>{[...events].reverse().slice(0, 20).map(event => <div key={event._id}><i className={`event-${event.type}`} /><p>{String(event.detail).toLowerCase()}</p><time>{formatTime(event.createdAt)}</time></div>)}</section></div>;
}

function ActivityPanel({ runs, reviews, events, onOpenTask }: { runs: Run[]; reviews: ReviewFinding[]; events: any[]; onOpenTask: (run: Run) => void }) {
  const active = runs.filter(run => ["pending", "running"].includes(run.status));
  return <div className="panel-body activity-panel"><p className="panel-kicker">team room</p><h2>watch the work move.</h2>{active.length ? <div className="activity-live">{active.map(run => <button key={run._id} onClick={() => onOpenTask(run)}><img src={agentFor(run.agentKey).avatar} alt="" /><div><strong>{agentFor(run.agentKey).name} · {run.taskType}</strong><small>{THINKING[run.agentKey]}</small></div><SpinnerGap className="spin" size={15} /></button>)}</div> : <div className="activity-quiet"><CheckCircle size={20} /><span>no agent is running right now</span></div>}<div className="activity-feed">{[...events].reverse().slice(0, 18).map(event => <article key={event._id}><i className={`event-${event.type}`} /><div><strong>{String(event.type).replaceAll("_", " ")}</strong><p>{event.detail}</p></div><time>{formatTime(event.createdAt)}</time></article>)}</div>{!!reviews.length && <div className="activity-reviews"><p className="panel-kicker">latest peer checks</p>{[...reviews].reverse().slice(0, 5).map(review => <article key={review._id}><img src={agentFor(review.reviewerAgent).avatar} alt="" /><div><strong>{review.severity} · {review.status}</strong><p>{review.feedback}</p></div></article>)}</div>}</div>;
}

export function App() {
  const devSeed = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const [ownerKey] = useState(() => {
    const existing = localStorage.getItem("founder.ownerKey");
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`; localStorage.setItem("founder.ownerKey", created); return created;
  });
  const [companyId, setCompanyId] = useState<string | null>(() => devSeed?.get("company") || localStorage.getItem("founder.companyId"));
  const [companyName, setCompanyName] = useState(() => devSeed?.get("name") || localStorage.getItem("founder.companyName") || "your company");
  const [isShowcase, setIsShowcase] = useState(() => localStorage.getItem("founder.isShowcase") === "true");
  const [conversationId, setConversationId] = useState<string | null>(() => devSeed?.get("conversation") || localStorage.getItem("founder.conversationId"));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [journeyView, setJourneyView] = useState<JourneyView>("idea");
  const [nav, setNav] = useState<"founder" | "activity" | "settings">("founder");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Artifact | null>(null);
  const [site, setSite] = useState<SiteView | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingAccess, setBillingAccess] = useState<"free" | "builder" | "internal">(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") { localStorage.setItem("founder.billingAccess", "builder"); return "builder"; }
    const saved = localStorage.getItem("founder.billingAccess");
    return saved === "builder" || saved === "internal" ? saved : "free";
  });
  const [internalMode] = useState(() => {
    const enabled = import.meta.env.DEV || localStorage.getItem("founder.internalMode") === "true" || new URLSearchParams(window.location.search).get("internal") === "1";
    if (enabled) localStorage.setItem("founder.internalMode", "true");
    return enabled;
  });
  const createConversation = useMutation(api.conversations.createConversation);
  const sendMessage = useMutation(api.conversations.sendMessage);
  const approveResearchMutation = useMutation(api.conversations.approveResearch);
  const approveLaunchMutation = useMutation(api.conversations.approveLaunch);
  const approveContentMutation = useMutation(api.conversations.approveContent);
  const retryFailedTaskMutation = useMutation(api.conversations.retryLatestFailedReview);
  const data = useQuery(api.conversations.getConversation, conversationId ? { conversationId: conversationId as never } : "skip") as any;
  const projects = (useQuery(api.conversations.listProjects, { ownerKey }) as Project[] | undefined) ?? [];
  const showcases = (useQuery(api.conversations.listShowcases, {}) as Project[] | undefined) ?? [];
  const plan = useMemo<BillingPlan>(() => {
    const free = billingAccess === "free";
    return { plan: billingAccess, status: billingAccess, used: projects.length, limit: free ? 1 : 999, remaining: free ? Math.max(0, 1 - projects.length) : 999, canCreate: !free || projects.length < 1, canBypass: internalMode, bypassActive: billingAccess === "internal" };
  }, [billingAccess, internalMode, projects.length]);
  const runs: Run[] = (data?.runs ?? []).map((run: Run) => ({ ...run, command: (data?.commands ?? []).find((command: RunCommand) => command._id === run.commandId) }));
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const events: any[] = data?.events ?? [];
  const progress = missionProgress(runs);
  const workingCount = runs.filter(run => run.status === "running").length;
  const sources = new Set(artifacts.flatMap(artifact => artifact.sourceUrls)).size;
  const active = runs.some(run => ["pending", "running"].includes(run.status));
  const unresolvedFailure = [...runs].reverse().find((run, reverseIndex) => run.status === "failed" && !runs.slice(runs.length - reverseIndex).some(candidate => candidate.agentKey === run.agentKey && candidate.taskType === run.taskType && candidate.status === "succeeded"));
  const openRun = openRunId ? runs.find(run => run._id === openRunId) ?? null : null;

  function exportMission(format: "json" | "markdown") {
    const slug = (data?.conversation?.title ?? "mission").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mission";
    if (format === "json") {
      saveTextFile(`founder-trace-${slug}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), conversation: data?.conversation, company: data?.company, campaign: data?.campaign, validation: data?.validation, runs, commands: data?.commands ?? [], messages: data?.messages ?? [], events, reviews: data?.reviews ?? [], approvals: data?.approvals ?? [], artifacts }, null, 2), "application/json");
      return;
    }
    const totals = runs.reduce((value, run) => value + (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0), 0);
    const reviewSummary = (data?.reviews ?? []).map((review: ReviewFinding) => `- [${review.status}] ${review.reviewerAgent} → ${review.targetArtifactKind} (${review.severity}): ${review.feedback}\n  Pass when: ${review.acceptanceCriteria}`).join("\n") || "- No peer findings recorded.";
    const markdown = `# Founder.exe mission trace: ${data?.conversation?.title ?? "Untitled"}\n\n- Exported: ${new Date().toISOString()}\n- Workflow stage: ${data?.conversation?.stage ?? "legacy"}\n- Runs: ${runs.length}\n- Total tokens: ${totals}\n- Sources: ${sources}\n- Landing page: ${data?.campaign?.landingUrl ?? "not deployed"}\n- Waitlist signups: ${data?.validation?.signups ?? 0}\n\n## Peer-review ledger\n\n${reviewSummary}\n\n---\n\n${runs.map(run => runMarkdown(run, artifacts)).join("\n\n---\n\n")}`;
    saveTextFile(`founder-trace-${slug}.md`, markdown, "text/markdown");
  }

  useEffect(() => { if (data?.company?.name && !isShowcase) setCompanyName(data.company.name); }, [data?.company?.name, isShowcase]);
  const lastStage = useRef<WorkflowStage | undefined>(undefined);
  useEffect(() => {
    const stage = data?.conversation?.stage as WorkflowStage | undefined;
    if (stage && stage !== lastStage.current) { lastStage.current = stage; setJourneyView(suggestedView(stage)); }
  }, [data?.conversation?.stage]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success" && url.searchParams.get("internal") !== "1") return;
    url.searchParams.delete("checkout");
    url.searchParams.delete("internal");
    window.history.replaceState({}, "", url);
  }, []);

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
    if (plan && !plan.canCreate) { setShowProjects(false); setShowBilling(true); return; }
    localStorage.removeItem("founder.companyId"); localStorage.removeItem("founder.companyName"); localStorage.removeItem("founder.conversationId"); localStorage.removeItem("founder.isShowcase");
    setCompanyId(null); setCompanyName("your company"); setConversationId(null); setIsShowcase(false); setShowProjects(false);
  }

  async function upgrade() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    const checkoutUrl = import.meta.env.VITE_DODO_CHECKOUT_URL;
    if (!checkoutUrl) { setCheckoutError("add VITE_DODO_CHECKOUT_URL to frontend/.env.local"); setCheckoutBusy(false); return; }
    window.location.assign(checkoutUrl);
  }

  function bypassBilling() {
    setCheckoutError(null);
    localStorage.setItem("founder.billingAccess", "internal");
    setBillingAccess("internal");
    setShowBilling(false);
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

  async function approveResearch() {
    if (!conversationId || sending) return; setSending(true);
    try { await approveResearchMutation({ conversationId: conversationId as never }); }
    finally { setSending(false); }
  }

  async function approveLaunch() {
    if (!conversationId || sending) return; setSending(true);
    try { await approveLaunchMutation({ conversationId: conversationId as never }); }
    finally { setSending(false); }
  }

  async function retryFailedTask() {
    if (!conversationId || sending) return; setSending(true);
    try { await retryFailedTaskMutation({ conversationId: conversationId as never }); setNav("activity"); }
    finally { setSending(false); }
  }

  async function sharePost(post: any) {
    if (!conversationId || !data?.campaign?.landingUrl) return;
    const popup = window.open("about:blank", "founder-share", "popup,width=760,height=720,scrollbars=yes,resizable=yes");
    try {
      await approveContentMutation({ conversationId: conversationId as never, contentId: post.id });
      await navigator.clipboard.writeText(post.body).catch(() => undefined);
      const siteUrl = (import.meta.env.VITE_CONVEX_SITE_URL || String(import.meta.env.VITE_CONVEX_URL ?? "").replace(".convex.cloud", ".convex.site"));
      void fetch(`${siteUrl}/validation/event`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignKey: data.campaign.publicKey, type: "composer_opened", platform: post.platform, contentId: post.id }) }).catch(() => undefined);
      const landing = attributedLanding(data.campaign.landingUrl, post.platform, post.id);
      let target = landing;
      if (post.platform === "x") target = `https://x.com/intent/tweet?text=${encodeURIComponent(post.body)}`;
      else if (post.platform === "linkedin") target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(landing)}`;
      else if (post.platform === "whatsapp") target = `https://wa.me/?text=${encodeURIComponent(post.body)}`;
      else if (post.platform === "reddit") {
        const community = String(post.community ?? "").replace(/^r\//, "").replace(/[^a-zA-Z0-9_]/g, "");
        target = community ? `https://www.reddit.com/r/${community}/submit?type=SELF` : "https://www.reddit.com/submit";
      }
      if (popup) popup.location.href = target; else window.open(target, "_blank", "noopener,noreferrer");
    } catch { popup?.close(); }
  }

  if (!companyId) return <><Onboarding ownerKey={ownerKey} projects={projects} showcases={showcases} plan={plan} onReady={ready} onOpen={openProject} onUpgrade={() => setShowBilling(true)} />{showBilling && <BillingModal plan={plan} busy={checkoutBusy} error={checkoutError} onClose={() => setShowBilling(false)} onCheckout={() => void upgrade()} onBypass={bypassBilling} />}</>;

  return (
    <main className="app-shell validation-shell">
      <section className="workspace validation-main">
        <header className="workspace-header validation-header">
          <Brand />
          <button className="company-label" onClick={() => setShowProjects(true)}><span>{isShowcase ? "showcase" : "company"}</span><strong>{companyName}</strong><small>switch ▾</small></button>
          <div className="runtime"><span className={`runtime-pulse ${active ? "" : "idle"}`} />{workingCount ? `${workingCount} working` : active ? "queued" : String(data?.conversation?.stage ?? "ready").replaceAll("_", " ")}</div>
          <span className={`plan-chip plan-${plan.plan}`}>{plan.plan} · {plan.plan === "free" ? `${plan.used}/1` : "usage active"}</span>
          <button className="new-idea-button" onClick={newProject}>new idea</button>
        </header>
        <nav className="journey-nav" aria-label="validation journey">{JOURNEY.map(item => { const Icon = item.icon; return <button key={item.key} className={journeyView === item.key ? "active" : ""} onClick={() => setJourneyView(item.key)}><Icon size={16} /><span>{item.label}</span>{item.key === "market" && currentArtifact(artifacts, "research_report") && <i />}{item.key === "campaign" && currentArtifact(artifacts, "gtm_strategy") && <i />}{item.key === "landing" && data?.campaign?.landingUrl && <i />}{item.key === "signals" && data?.validation?.signups > 0 && <b>{data.validation.signups}</b>}</button>})}<div className="journey-progress"><i style={{ width: `${progress}%` }} /></div></nav>
        {unresolvedFailure && !active && <div className="mission-recovery"><div><ShieldWarning size={18} /><span><strong>{agentFor(unresolvedFailure.agentKey).name} needs another pass.</strong><small>{unresolvedFailure.error ?? "The last response could not be validated."}</small></span></div><button onClick={() => void retryFailedTask()} disabled={sending}><ArrowClockwise size={15} /> retry task</button></div>}
        <div className="journey-canvas">
          {journeyView === "idea" && <IdeaWorkspace data={data ? { ...data, artifacts } : data} runs={runs} sources={sources} onGo={setJourneyView} />}
          {journeyView === "market" && <MarketWorkspace artifact={currentArtifact(artifacts, "research_report")} stage={data?.conversation?.stage} reviews={data?.reviews ?? []} onApprove={() => void approveResearch()} onOpen={setPreview} />}
          {journeyView === "campaign" && <CampaignWorkspace artifact={currentArtifact(artifacts, "gtm_strategy")} campaign={data?.campaign} stage={data?.conversation?.stage} approvals={data?.approvals ?? []} onApproveLaunch={() => void approveLaunch()} onShare={post => void sharePost(post)} onOpen={setPreview} />}
          {journeyView === "landing" && <LandingWorkspace artifacts={artifacts} reviews={data?.reviews ?? []} onOpenSite={setSite} onOpenArtifact={setPreview} />}
          {journeyView === "signals" && <SignalsWorkspace validation={data?.validation} campaign={data?.campaign} />}
          {journeyView === "team" && <TeamWorkspace runs={runs} reviews={data?.reviews ?? []} events={events} onOpenTask={run => setOpenRunId(run._id)} onExport={exportMission} />}
        </div>
      </section>

      <button className="mobile-founder-trigger" onClick={() => { setNav("founder"); setMobilePanelOpen(true); }}><img src={agentFor("founder").avatar} alt="" /><span><small>founder</small><strong>talk or change something</strong></span><ArrowUp size={15} /></button>
      <aside className={`command-panel ${mobilePanelOpen ? "is-mobile-open" : ""}`}>
        <div className="product-nav">
          <button className={nav === "founder" ? "active" : ""} onClick={() => setNav("founder")}>founder</button>
          <button className={nav === "activity" ? "active" : ""} onClick={() => setNav("activity")}>team room</button>
          <button className={nav === "settings" ? "active" : ""} onClick={() => setNav("settings")}>settings</button>
          <button className="mobile-panel-close" onClick={() => setMobilePanelOpen(false)} aria-label="close founder panel"><X size={18} /></button>
        </div>
        {nav === "settings"
          ? <SettingsPanel companyName={companyName} companyId={companyId} conversationId={conversationId} projects={projects} plan={plan} onOpenProject={openProject} onSwitch={() => setShowProjects(true)} onNewIdea={newProject} onUpgrade={() => setShowBilling(true)} />
          : nav === "activity"
          ? <ActivityPanel runs={runs} reviews={data?.reviews ?? []} events={events} onOpenTask={run => setOpenRunId(run._id)} />
          : <Chat data={data} message={message} setMessage={setMessage} onSend={() => dispatch()} onPreset={(text: string) => { setMessage(text); void dispatch(text); }} sending={sending} onOpenTask={run => setOpenRunId(run._id)} onOpenArtifact={setPreview} onOpenSite={setSite} readOnly={isShowcase} />}
      </aside>

      {openRun && <TaskDrawer run={openRun} artifacts={artifacts} onClose={() => setOpenRunId(null)} onOpenArtifact={setPreview} />}
      {site && <SiteViewer site={site} onClose={() => setSite(null)} />}
      {preview && <ArtifactPreview artifact={preview} onClose={() => setPreview(null)} />}
      {showProjects && <ProjectSwitcher projects={projects} showcases={showcases} currentId={companyId} plan={plan} onClose={() => setShowProjects(false)} onOpen={openProject} onNewProject={newProject} onNewMission={newMission} />}
      {showBilling && <BillingModal plan={plan} busy={checkoutBusy} error={checkoutError} onClose={() => setShowBilling(false)} onCheckout={() => void upgrade()} onBypass={bypassBilling} />}
    </main>
  );
}
