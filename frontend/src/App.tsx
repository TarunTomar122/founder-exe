import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  ArrowRight,
  ArrowUp,
  Atom,
  Check,
  Clock,
  Code,
  FileText,
  Globe,
  LinkSimple,
  MagnifyingGlass,
  RocketLaunch,
  Sparkle,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";

const api = anyApi as any;

type AgentKey = "founder" | "research" | "landing_page" | "go_to_market";
type RuntimeStatus = "ready" | "queued" | "working" | "complete" | "error";

type Run = {
  _id: string;
  agentKey: AgentKey;
  parentRunId?: string;
  status: "pending" | "running" | "succeeded" | "failed";
  summary?: string;
  error?: string;
  latencyMs?: number;
  startedAt: number;
  completedAt?: number;
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
  createdAt: number;
  conversations: Array<{ _id: string; title: string; status: string; createdAt: number; updatedAt: number }>;
};

const AGENTS: Array<{
  key: AgentKey;
  name: string;
  shortName: string;
  role: string;
  avatar: string;
  description: string;
  accent: string;
}> = [
  { key: "founder", name: "Founder", shortName: "FOUNDER", role: "Orchestrator", avatar: "/agents/founder_agent.png", description: "Plans the mission, activates specialists, and returns the final decision.", accent: "lime" },
  { key: "research", name: "Research", shortName: "RESEARCH", role: "Market intelligence", avatar: "/agents/research_agent.png", description: "Maps competitors, validates claims, and returns cited market evidence.", accent: "cyan" },
  { key: "landing_page", name: "Landing Page", shortName: "LANDING", role: "Conversion designer", avatar: "/agents/product_agent.png", description: "Selects an approved template and creates the complete page artifact.", accent: "violet" },
  { key: "go_to_market", name: "Go-to-Market", shortName: "GTM", role: "Distribution strategist", avatar: "/agents/growth_agent.png", description: "Builds channel strategy, launch experiments, and platform-native posts.", accent: "amber" },
];

const MISSIONS = [
  { icon: MagnifyingGlass, label: "Map my market", text: "Research my closest competitors, identify an honest positioning gap, and give me a cited recommendation." },
  { icon: Code, label: "Build a landing page", text: "Research the audience, select the best approved template, and create a complete landing-page brief with final copy." },
  { icon: RocketLaunch, label: "Plan my launch", text: "Create a two-week go-to-market strategy and platform-specific launch posts for my product." },
];

function formatTime(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function formatDuration(milliseconds?: number) {
  if (!milliseconds) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds > 10_000 ? 0 : 1)}s`;
}

function statusFor(agent: AgentKey, runs: Run[]): RuntimeStatus {
  const run = [...runs].reverse().find(item => item.agentKey === agent);
  if (!run) return "ready";
  if (run.status === "pending") return "queued";
  if (run.status === "running") return "working";
  if (run.status === "failed") return "error";
  return "complete";
}

function missionProgress(runs: Run[]) {
  if (!runs.length) return 0;
  const initialFounder = runs.find(run => run.agentKey === "founder" && !run.parentRunId);
  const specialists = runs.filter(run => run.agentKey !== "founder");
  const finalFounder = runs.find(run => run.agentKey === "founder" && run.parentRunId);
  if (finalFounder?.status === "succeeded") return 100;
  if (finalFounder?.status === "running") return 92;
  if (specialists.length && specialists.every(run => run.status === "succeeded")) return 82;
  if (specialists.some(run => run.status === "running")) return 58;
  if (specialists.some(run => run.status === "pending")) return 42;
  if (initialFounder?.status === "succeeded") return 30;
  return 12;
}

function Brand() {
  return <div className="brand" aria-label="Founder.exe"><strong>FOUNDER<span>.EXE</span></strong><small>AI GROWTH COMPANY</small></div>;
}

function Onboarding({ ownerKey, projects, onReady, onOpen }: { ownerKey: string; projects: Project[]; onReady: (companyId: string, companyName: string) => void; onOpen: (project: Project, conversationId?: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const bootstrap = useMutation(api.conversations.bootstrap);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const id = await bootstrap({ name: name.trim(), ownerKey });
      onReady(id, name.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header"><Brand /><span>PRIVATE RUNTIME // 01</span></header>
      <section className="onboarding-grid">
        <div className="onboarding-copy">
          <p className="kicker">FROM WASHROOM IDEA TO REAL THING</p>
          <h1>Dump the idea.<br /><span>Build the thing.</span></h1>
          <p className="lede">Name the workspace, then tell Founder the messy version. It will ask the sharp questions before activating Research, Landing Page, and Go-to-Market.</p>
          <form className="setup-form" onSubmit={submit}>
            <label>IDEA / COMPANY NAME<input value={name} onChange={event => setName(event.target.value)} placeholder="My weird little idea" required autoFocus /></label>
            <button disabled={busy}>{busy ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />} Meet Founder</button>
          </form>
          {!!projects.length && <div className="recent-projects"><span>YOUR PROJECTS</span>{projects.slice(0, 4).map(project => <button type="button" key={project._id} onClick={() => onOpen(project)}><div><strong>{project.name}</strong><small>{project.conversations.length} mission{project.conversations.length === 1 ? "" : "s"}</small></div><ArrowRight size={15} /></button>)}</div>}
        </div>
        <div className="onboarding-orbit" aria-label="Your four-agent company">
          <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
          {AGENTS.map(agent => <div className={`onboarding-agent onboard-${agent.key}`} key={agent.key}><span><img src={agent.avatar} alt="" /></span><b>{agent.shortName}</b></div>)}
          <div className="orbit-label"><small>YOUR COMPANY</small><strong>4 AGENTS</strong><span>READY TO ASSEMBLE</span></div>
        </div>
      </section>
    </main>
  );
}

function AgentMap({ runs, selected, onSelect }: { runs: Run[]; selected: AgentKey; onSelect: (key: AgentKey) => void }) {
  const activeSpecialist = [...runs].reverse().find(run => run.agentKey !== "founder" && ["pending", "running"].includes(run.status))?.agentKey;
  return (
    <section className="agent-map-panel panel">
      <div className="panel-heading"><div><span>COMPANY MAP</span><strong>Active team</strong></div><em>{runs.filter(run => run.status === "running").length} WORKING</em></div>
      <div className={`agent-map handoff-${activeSpecialist ?? "none"}`}>
        <div className="map-ring map-ring-outer" /><div className="map-ring map-ring-inner" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="50" x2="50" y2="11" /><line x1="50" y1="50" x2="16" y2="82" /><line x1="50" y1="50" x2="84" y2="82" />
          {activeSpecialist === "research" && <line className="active-line" x1="50" y1="50" x2="50" y2="11" />}
          {activeSpecialist === "landing_page" && <line className="active-line" x1="50" y1="50" x2="16" y2="82" />}
          {activeSpecialist === "go_to_market" && <line className="active-line" x1="50" y1="50" x2="84" y2="82" />}
        </svg>
        {AGENTS.map(agent => {
          const status = statusFor(agent.key, runs);
          return <button key={agent.key} className={`map-agent map-${agent.key} agent-${agent.accent} status-${status} ${selected === agent.key ? "selected" : ""}`} onClick={() => onSelect(agent.key)} aria-pressed={selected === agent.key}>
            <span className="agent-avatar"><img src={agent.avatar} alt="" /><i /></span><b>{agent.shortName}</b><small>{status}</small>
          </button>;
        })}
      </div>
    </section>
  );
}

function AgentDetail({ agentKey, runs, artifacts }: { agentKey: AgentKey; runs: Run[]; artifacts: Artifact[] }) {
  const agent = AGENTS.find(item => item.key === agentKey)!;
  const run = [...runs].reverse().find(item => item.agentKey === agentKey);
  const outputs = run ? artifacts.filter(artifact => artifact.runId === run._id) : [];
  const status = statusFor(agentKey, runs);
  return <section className={`agent-detail agent-${agent.accent}`}>
    <div className="agent-detail-head"><img src={agent.avatar} alt="" /><div><span>{agent.role}</span><h2>{agent.name}</h2></div><em className={`status-pill status-${status}`}>{status}</em></div>
    <p>{agent.description}</p>
    <dl><div><dt>LATEST RUN</dt><dd>{run ? formatTime(run.startedAt) : "Not activated"}</dd></div><div><dt>LATENCY</dt><dd>{formatDuration(run?.latencyMs)}</dd></div><div><dt>OUTPUTS</dt><dd>{outputs.length}</dd></div></dl>
    {run?.summary && <div className="run-summary"><span>SAFE RUN SUMMARY</span><p>{run.summary}</p></div>}
  </section>;
}

function MissionStrip({ title, progress, runs, artifacts }: { title?: string; progress: number; runs: Run[]; artifacts: Artifact[] }) {
  const active = runs.some(run => ["pending", "running"].includes(run.status));
  const sources = new Set(artifacts.flatMap(artifact => artifact.sourceUrls)).size;
  return <section className="mission-strip">
    <div className="mission-title"><span>CURRENT MISSION</span><strong>{title || "Give Founder a measurable mission"}</strong></div>
    <div className="mission-metric"><span>STATUS</span><strong className={active ? "live" : progress === 100 ? "done" : ""}><i />{active ? "RUNNING" : progress === 100 ? "COMPLETE" : "READY"}</strong></div>
    <div className="mission-metric"><span>RUNS</span><strong>{runs.filter(run => run.status === "succeeded").length}<small> / {runs.length || 0}</small></strong></div>
    <div className="mission-metric"><span>EVIDENCE</span><strong>{sources}<small> SOURCES</small></strong></div>
    <div className="mission-progress"><i style={{ width: `${progress}%` }} /></div>
  </section>;
}

function Chat({ data, message, setMessage, onSend, onPreset, sending }: any) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleMessages = data?.messages.filter((item: any) => item.role === "user" || item.agentKey === "founder") ?? [];
  const workingRuns = (data?.runs ?? []).filter((run: Run) => ["pending", "running"].includes(run.status));
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [visibleMessages.length, workingRuns.length]);

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); }
  }

  return <section className="chat-panel panel">
    <div className="panel-heading chat-heading"><div><span>FOUNDER CHANNEL</span><strong>Command center</strong></div><em><i /> CONVEX LIVE</em></div>
    <div className="chat-scroll" ref={scrollRef}>
      {!visibleMessages.length && <div className="chat-empty">
        <span className="founder-mark"><img src="/agents/founder_agent.png" alt="" /></span>
        <p className="kicker">FOUNDER IS READY</p><h2>Dump the raw idea here.</h2><p>It can be messy. Founder will first ask what it is, who needs it, and what we should make real next—then activate only the specialists it needs.</p>
        <div className="mission-presets">{MISSIONS.map(item => { const Icon = item.icon; return <button onClick={() => onPreset(item.text)} key={item.label}><span><Icon size={20} /></span><div><strong>{item.label}</strong><small>{item.text}</small></div><ArrowRight size={16} /></button>; })}</div>
      </div>}
      <div className="message-thread">
        {visibleMessages.map((item: any) => item.role === "user" ? <div className="chat-message user-message" key={item._id}><span>YOU</span><p>{item.content}</p><time>{formatTime(item.createdAt)}</time></div> : <div className="chat-message founder-message" key={item._id}><img src="/agents/founder_agent.png" alt="" /><div><span>FOUNDER</span><p>{item.content}</p><time>{formatTime(item.createdAt)}</time></div></div>)}
        {workingRuns.length > 0 && <div className="company-working"><span className="working-pulse"><i /><i /><i /></span><div><strong>{workingRuns.map((run: Run) => AGENTS.find(agent => agent.key === run.agentKey)?.name).join(" + ")}</strong><small>working in the cloud · safe trace is recording</small></div></div>}
      </div>
    </div>
    <div className="composer-wrap">
      {visibleMessages.length > 0 && <div className="quick-chips">{MISSIONS.map(item => <button key={item.label} onClick={() => onPreset(item.text)}>{item.label}</button>)}</div>}
      <div className="composer"><Sparkle size={18} /><textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={keyDown} placeholder="Give Founder a goal, constraint, or follow-up…" rows={1} /><button onClick={onSend} disabled={!message.trim() || sending} aria-label="Send to Founder">{sending ? <SpinnerGap className="spin" size={18} /> : <ArrowUp size={18} weight="bold" />}</button></div>
      <p>ENTER TO SEND <span>·</span> SHIFT + ENTER FOR NEW LINE <em>Founder delegates automatically</em></p>
    </div>
  </section>;
}

function ArtifactIcon({ kind }: { kind: string }) {
  if (kind.includes("preview")) return <Globe size={18} />;
  if (kind.includes("research")) return <MagnifyingGlass size={18} />;
  if (kind.includes("landing")) return <Code size={18} />;
  if (kind.includes("gtm") || kind.includes("social")) return <RocketLaunch size={18} />;
  return <FileText size={18} />;
}

function ArtifactText({ content }: { content: string }) {
  return <div className="artifact-document">{content.split("\n").map((line, index) => {
    const clean = line.trim();
    if (!clean) return <div className="document-space" key={index} />;
    if (/^#{1,3}\s/.test(clean)) return <h3 key={index}>{clean.replace(/^#{1,3}\s/, "")}</h3>;
    if (/^[A-Za-z][^:]{1,40}:$/.test(clean)) return <h3 key={index}>{clean.slice(0, -1)}</h3>;
    if (/^[-*]\s/.test(clean)) return <p className="document-bullet" key={index}>{clean.replace(/^[-*]\s/, "")}</p>;
    return <p key={index}>{line}</p>;
  })}</div>;
}

function ArtifactPreview({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  return <div className="artifact-overlay" role="dialog" aria-modal="true" aria-label={artifact.title} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="artifact-modal">
      <header><div className="artifact-modal-icon"><ArtifactIcon kind={artifact.kind} /></div><div><span>{artifact.kind.replaceAll("_", " ")}</span><h2>{artifact.title}</h2></div><button onClick={onClose} aria-label="Close preview"><X size={20} /></button></header>
      <div className="artifact-meta"><span><Clock size={14} /> {formatTime(artifact.createdAt)}</span><span><LinkSimple size={14} /> {artifact.sourceUrls.length} sources</span><span><Check size={14} /> Stored in Convex</span></div>
      <ArtifactText content={artifact.content} />
      {!!artifact.sourceUrls.length && <footer><span>SOURCES</span>{artifact.sourceUrls.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><b>{String(index + 1).padStart(2, "0")}</b><span>{new URL(url).hostname}</span><ArrowRight size={14} /></a>)}</footer>}
    </article>
  </div>;
}

function ArtifactRail({ artifacts, onOpen }: { artifacts: Artifact[]; onOpen: (artifact: Artifact) => void }) {
  return <div className="artifact-list">
    {!artifacts.length && <div className="rail-empty"><Atom size={28} /><strong>No artifacts yet</strong><p>Research reports, page briefs, strategies, and final outputs will collect here.</p></div>}
    {[...artifacts].reverse().map((artifact, index) => <button className={`artifact-card ${artifact.kind === "landing_page_preview" ? "is-live-preview" : ""}`} onClick={() => artifact.kind === "landing_page_preview" && artifact.sourceUrls[0] ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer") : onOpen(artifact)} key={artifact._id}>
      <div className="artifact-card-top"><span><ArtifactIcon kind={artifact.kind} /></span><em>OUTPUT {String(artifacts.length - index).padStart(2, "0")}</em><ArrowRight size={16} /></div>
      <small>{artifact.kind === "landing_page_preview" ? "● LIVE CLOUDFLARE PREVIEW" : artifact.kind.replaceAll("_", " ")}</small><strong>{artifact.title}</strong><p>{artifact.content.slice(0, 135)}{artifact.content.length > 135 ? "…" : ""}</p>
      <footer><span>{artifact.sourceUrls.length} sources</span><time>{formatTime(artifact.createdAt)}</time></footer>
    </button>)}
  </div>;
}

function TraceRail({ runs, events }: { runs: Run[]; events: any[] }) {
  return <div className="trace-list">
    {!runs.length && <div className="rail-empty"><Atom size={28} /><strong>No trace yet</strong><p>Every queued agent, completed run, latency, and safe output summary will appear here.</p></div>}
    {[...runs].reverse().map(run => {
      const agent = AGENTS.find(item => item.key === run.agentKey)!;
      const status = statusFor(run.agentKey, [run]);
      return <article className={`trace-card trace-${status}`} key={run._id}><div className="trace-rail"><i /><span /></div><div className="trace-main"><header><img src={agent.avatar} alt="" /><div><strong>{agent.name}</strong><small>{run.parentRunId ? "Delegated run" : "Orchestrator run"}</small></div><em>{run.status}</em></header>{run.summary ? <p>{run.summary}</p> : <p className="trace-wait">{run.status === "running" ? "Hermes is executing this task…" : "Waiting for worker lease…"}</p>}<footer><span><Clock size={13} /> {formatDuration(run.latencyMs)}</span><time>{formatTime(run.startedAt)}</time></footer></div></article>;
    })}
    {!!events.length && <div className="event-ledger"><span>EVENT LEDGER</span>{[...events].reverse().slice(0, 12).map(event => <div key={event._id}><i className={`event-${event.type}`} /><p>{event.detail}</p><time>{formatTime(event.createdAt)}</time></div>)}</div>}
  </div>;
}

function ProjectSwitcher({ projects, currentId, onClose, onOpen, onNewProject, onNewMission }: { projects: Project[]; currentId: string | null; onClose: () => void; onOpen: (project: Project, conversationId?: string) => void; onNewProject: () => void; onNewMission: (project: Project) => void }) {
  return <div className="project-overlay" role="dialog" aria-modal="true" aria-label="Projects" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="project-drawer">
      <header><div><span>FOUNDER.EXE WORKSPACES</span><h2>Your projects</h2></div><button onClick={onClose} aria-label="Close projects"><X size={19} /></button></header>
      <button className="create-project-button" onClick={onNewProject}><span>+</span><div><strong>Start a new idea</strong><small>Create a clean project and let Founder interview you</small></div><ArrowRight size={17} /></button>
      <div className="project-list">{projects.map(project => <article className={project._id === currentId ? "active" : ""} key={project._id}>
        <button className="project-main" onClick={() => onOpen(project)}><div><span>{project._id === currentId ? "ACTIVE PROJECT" : "PROJECT"}</span><strong>{project.name}</strong><small>{project.conversations.length} saved mission{project.conversations.length === 1 ? "" : "s"}</small></div><ArrowRight size={16} /></button>
        <div className="project-missions">{project.conversations.map(conversation => <button key={conversation._id} onClick={() => onOpen(project, conversation._id)}><i /><div><strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleDateString()} · {conversation.status}</small></div></button>)}<button className="new-mission" onClick={() => onNewMission(project)}>+ NEW MISSION</button></div>
      </article>)}</div>
    </section>
  </div>;
}

export function App() {
  const [ownerKey] = useState(() => {
    const existing = localStorage.getItem("founder.ownerKey");
    if (existing) return existing;
    const created = crypto.randomUUID(); localStorage.setItem("founder.ownerKey", created); return created;
  });
  const [companyId, setCompanyId] = useState<string | null>(() => localStorage.getItem("founder.companyId"));
  const [companyName, setCompanyName] = useState(() => localStorage.getItem("founder.companyName") || "Your company");
  const [conversationId, setConversationId] = useState<string | null>(() => localStorage.getItem("founder.conversationId"));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>("founder");
  const [railTab, setRailTab] = useState<"artifacts" | "trace">("artifacts");
  const [preview, setPreview] = useState<Artifact | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const createConversation = useMutation(api.conversations.createConversation);
  const sendMessage = useMutation(api.conversations.sendMessage);
  const data = useQuery(api.conversations.getConversation, conversationId ? { conversationId: conversationId as never } : "skip") as any;
  const projects = (useQuery(api.conversations.listProjects, { ownerKey }) as Project[] | undefined) ?? [];
  const runs: Run[] = data?.runs ?? [];
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const progress = missionProgress(runs);

  useEffect(() => { if (data?.company?.name) setCompanyName(data.company.name); }, [data?.company?.name]);
  useEffect(() => { const active = [...runs].reverse().find(run => run.status === "running"); if (active) setSelectedAgent(active.agentKey); }, [runs.map(run => `${run._id}:${run.status}`).join("|")]);

  function ready(id: string, name: string) {
    localStorage.setItem("founder.companyId", id); localStorage.setItem("founder.companyName", name);
    setCompanyId(id); setCompanyName(name);
  }

  function openProject(project: Project, selectedConversationId?: string) {
    const nextConversation = selectedConversationId ?? project.conversations[0]?._id ?? null;
    localStorage.setItem("founder.companyId", project._id); localStorage.setItem("founder.companyName", project.name);
    if (nextConversation) localStorage.setItem("founder.conversationId", nextConversation); else localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id); setCompanyName(project.name); setConversationId(nextConversation); setShowProjects(false);
  }

  function newProject() {
    localStorage.removeItem("founder.companyId"); localStorage.removeItem("founder.companyName"); localStorage.removeItem("founder.conversationId");
    setCompanyId(null); setCompanyName("Your company"); setConversationId(null); setShowProjects(false);
  }

  function newMission(project: Project) {
    localStorage.setItem("founder.companyId", project._id); localStorage.setItem("founder.companyName", project.name); localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id); setCompanyName(project.name); setConversationId(null); setShowProjects(false);
  }

  async function dispatch(text = message) {
    const value = text.trim();
    if (!value || !companyId || sending) return;
    setSending(true);
    try {
      if (!conversationId) {
        const id = await createConversation({ companyId: companyId as never, message: value });
        localStorage.setItem("founder.conversationId", id); setConversationId(id);
      } else await sendMessage({ conversationId: conversationId as never, message: value });
      setMessage("");
    } finally { setSending(false); }
  }

  if (!companyId) return <Onboarding ownerKey={ownerKey} projects={projects} onReady={ready} onOpen={openProject} />;

  return <main className="app-shell">
    <header className="topbar"><Brand /><button className="company-label" onClick={() => setShowProjects(true)}><span>PROJECT</span><strong>{companyName}</strong><small>SWITCH ▾</small></button><div className="runtime-state"><i /> CLOUD RUNTIME <b>ONLINE</b></div><button className="new-idea-button" onClick={newProject}>NEW PROJECT</button><button className="avatar-button" title="Local founder profile"><img src="/agents/founder_agent.png" alt="Founder profile" /></button></header>
    <MissionStrip title={data?.conversation?.title} progress={progress} runs={runs} artifacts={artifacts} />
    <div className="app-grid">
      <aside className="company-column"><AgentMap runs={runs} selected={selectedAgent} onSelect={setSelectedAgent} /><AgentDetail agentKey={selectedAgent} runs={runs} artifacts={artifacts} /></aside>
      <Chat data={data} message={message} setMessage={setMessage} onSend={() => dispatch()} onPreset={(text: string) => { setMessage(text); void dispatch(text); }} sending={sending} />
      <aside className="evidence-panel panel"><div className="rail-tabs"><button className={railTab === "artifacts" ? "active" : ""} onClick={() => setRailTab("artifacts")}><FileText size={15} /> OUTPUTS <b>{artifacts.length}</b></button><button className={railTab === "trace" ? "active" : ""} onClick={() => setRailTab("trace")}><Atom size={15} /> TRACE <b>{runs.length}</b></button></div>{railTab === "artifacts" ? <ArtifactRail artifacts={artifacts} onOpen={setPreview} /> : <TraceRail runs={runs} events={data?.events ?? []} />}</aside>
    </div>
    <footer className="system-footer"><span><i /> SYSTEM HEALTHY</span><span>CONVEX // DURABLE STATE</span><span>HERMES // LOCAL WORKER</span><span>LINKUP // SEARCH READY</span><time>{new Date().toISOString().slice(0, 10)}</time></footer>
    {preview && <ArtifactPreview artifact={preview} onClose={() => setPreview(null)} />}
    {showProjects && <ProjectSwitcher projects={projects} currentId={companyId} onClose={() => setShowProjects(false)} onOpen={openProject} onNewProject={newProject} onNewMission={newMission} />}
  </main>;
}
