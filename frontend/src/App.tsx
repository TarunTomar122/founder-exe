import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  Artifact,
  BillingPlan,
  Project,
  ReviewFinding,
  Run,
  RunCommand,
  SiteView,
  StageKey,
  WorkflowStage,
  agentFor,
  attributedLanding,
  currentArtifact,
  missionProgress,
  runMarkdown,
  saveTextFile,
  suggestedStage,
} from "./lib/core";
import {
  IconArrowUp,
  IconChart,
  IconChevronDown,
  IconCompass,
  IconGlobe,
  IconRefresh,
  IconRocket,
  IconTrend,
  IconUsers,
  IconWarning,
} from "./lib/icons";
import { Brand } from "./components/primitives";
import { Onboarding } from "./components/Onboarding";
import { FounderDrawer } from "./components/FounderDrawer";
import {
  ExecutionPanel,
  GtmStage,
  IdeaOverview,
  LandingStage,
  ResearchStage,
  SignalsStage,
  TeamStage,
} from "./components/stages";
import { ArtifactPreview, BillingModal, ProjectSwitcher, SiteViewer, TaskDrawer } from "./components/overlays";

const api = anyApi as any;

const STAGE_TABS: Array<{ key: StageKey; label: string; icon: typeof IconCompass }> = [
  { key: "idea", label: "Idea", icon: IconCompass },
  { key: "research", label: "Research", icon: IconChart },
  { key: "gtm", label: "GTM", icon: IconRocket },
  { key: "landing", label: "Landing", icon: IconGlobe },
  { key: "signals", label: "Signals", icon: IconTrend },
  { key: "team", label: "Team", icon: IconUsers },
];

const STAGE_HEAD: Record<StageKey, { kicker: string; title: string; blurb: string }> = {
  idea: { kicker: "Validation command center", title: "Tell Founder the messy version.", blurb: "Describe what it does and who feels the pain. Founder will ask what matters before the team moves." },
  research: { kicker: "Market intelligence", title: "Is there a real, reachable market?", blurb: "Cited competitors, honest sizing and the audience that hurts first — evidence before opinion." },
  gtm: { kicker: "Go-to-market", title: "How will the first users find this?", blurb: "Channel priorities, a measurable sequence, and platform-native posts ready to ship." },
  landing: { kicker: "Landing page", title: "The page that captures intent.", blurb: "A deployed waitlist page with real capture, reviewed by both specialists before it goes out." },
  signals: { kicker: "Demand signals", title: "What is the market actually doing?", blurb: "Real visits, clicks and signups attributed by source — the only opinion that counts." },
  team: { kicker: "The team", title: "Every handoff, on the record.", blurb: "A human-readable review timeline, with token, timing and tool detail one click away." },
};

export function App() {
  const devSeed = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
  const [ownerKey] = useState(() => {
    const existing = localStorage.getItem("founder.ownerKey");
    if (existing) return existing;
    const created = globalThis.crypto?.randomUUID?.() ?? `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("founder.ownerKey", created);
    return created;
  });
  const [companyId, setCompanyId] = useState<string | null>(() => devSeed?.get("company") || localStorage.getItem("founder.companyId"));
  const [companyName, setCompanyName] = useState(() => devSeed?.get("name") || localStorage.getItem("founder.companyName") || "your company");
  const [isShowcase, setIsShowcase] = useState(() => localStorage.getItem("founder.isShowcase") === "true");
  const [conversationId, setConversationId] = useState<string | null>(() => devSeed?.get("conversation") || localStorage.getItem("founder.conversationId"));
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<StageKey>("idea");
  const [founderTab, setFounderTab] = useState<"chat" | "room" | "settings">("chat");
  const [founderCollapsed, setFounderCollapsed] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Artifact | null>(null);
  const [site, setSite] = useState<SiteView | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [billingAccess, setBillingAccess] = useState<"free" | "builder" | "internal">(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      localStorage.setItem("founder.billingAccess", "builder");
      return "builder";
    }
    const saved = localStorage.getItem("founder.billingAccess");
    return saved === "builder" || saved === "internal" ? saved : "free";
  });
  const [internalMode] = useState(() => {
    const enabled =
      import.meta.env.DEV ||
      localStorage.getItem("founder.internalMode") === "true" ||
      new URLSearchParams(window.location.search).get("internal") === "1";
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
    return {
      plan: billingAccess,
      status: billingAccess,
      used: projects.length,
      limit: free ? 1 : 999,
      remaining: free ? Math.max(0, 1 - projects.length) : 999,
      canCreate: !free || projects.length < 1,
      canBypass: internalMode,
      bypassActive: billingAccess === "internal",
    };
  }, [billingAccess, internalMode, projects.length]);

  const runs: Run[] = (data?.runs ?? []).map((run: Run) => ({
    ...run,
    command: (data?.commands ?? []).find((command: RunCommand) => command._id === run.commandId),
  }));
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const events: any[] = data?.events ?? [];
  const reviews: ReviewFinding[] = data?.reviews ?? [];
  const progress = missionProgress(runs);
  const workingCount = runs.filter(run => run.status === "running").length;
  const sources = new Set(artifacts.flatMap(artifact => artifact.sourceUrls)).size;
  const active = runs.some(run => ["pending", "running"].includes(run.status));
  const unresolvedFailure = [...runs]
    .reverse()
    .find(
      (run, reverseIndex) =>
        run.status === "failed" &&
        !runs
          .slice(runs.length - reverseIndex)
          .some(candidate => candidate.agentKey === run.agentKey && candidate.taskType === run.taskType && candidate.status === "succeeded"),
    );
  const openRun = openRunId ? runs.find(run => run._id === openRunId) ?? null : null;
  const currentStage = data?.conversation?.stage as WorkflowStage | undefined;
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const activeButton = rail.querySelector<HTMLButtonElement>("button.active");
    activeButton?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [stage]);

  function exportMission(format: "json" | "markdown") {
    const slug =
      (data?.conversation?.title ?? "mission").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "mission";
    if (format === "json") {
      saveTextFile(
        `founder-trace-${slug}.json`,
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            conversation: data?.conversation,
            company: data?.company,
            campaign: data?.campaign,
            validation: data?.validation,
            runs,
            commands: data?.commands ?? [],
            messages: data?.messages ?? [],
            events,
            reviews,
            approvals: data?.approvals ?? [],
            artifacts,
          },
          null,
          2,
        ),
        "application/json",
      );
      return;
    }
    const totals = runs.reduce((value, run) => value + (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0), 0);
    const reviewSummary =
      reviews
        .map(
          (review: ReviewFinding) =>
            `- [${review.status}] ${review.reviewerAgent} → ${review.targetArtifactKind} (${review.severity}): ${review.feedback}\n  Pass when: ${review.acceptanceCriteria}`,
        )
        .join("\n") || "- No peer findings recorded.";
    const markdown = `# Founder.exe mission trace: ${data?.conversation?.title ?? "Untitled"}\n\n- Exported: ${new Date().toISOString()}\n- Workflow stage: ${data?.conversation?.stage ?? "legacy"}\n- Runs: ${runs.length}\n- Total tokens: ${totals}\n- Sources: ${sources}\n- Landing page: ${data?.campaign?.landingUrl ?? "not deployed"}\n- Waitlist signups: ${data?.validation?.signups ?? 0}\n\n## Peer-review ledger\n\n${reviewSummary}\n\n---\n\n${runs.map(run => runMarkdown(run, artifacts)).join("\n\n---\n\n")}`;
    saveTextFile(`founder-trace-${slug}.md`, markdown, "text/markdown");
  }

  useEffect(() => {
    if (data?.company?.name && !isShowcase) setCompanyName(data.company.name);
  }, [data?.company?.name, isShowcase]);

  const lastStage = useRef<WorkflowStage | undefined>(undefined);
  useEffect(() => {
    if (currentStage && currentStage !== lastStage.current) {
      lastStage.current = currentStage;
      setStage(suggestedStage(currentStage));
    }
  }, [currentStage]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== "success" && url.searchParams.get("internal") !== "1") return;
    url.searchParams.delete("checkout");
    url.searchParams.delete("internal");
    window.history.replaceState({}, "", url);
  }, []);

  function ready(id: string, name: string) {
    localStorage.setItem("founder.companyId", id);
    localStorage.setItem("founder.companyName", name);
    localStorage.removeItem("founder.isShowcase");
    setIsShowcase(false);
    setCompanyId(id);
    setCompanyName(name);
  }

  function openProject(project: Project, selectedConversationId?: string) {
    const nextConversation = selectedConversationId ?? project.conversations[0]?._id ?? null;
    localStorage.setItem("founder.companyId", project._id);
    localStorage.setItem("founder.companyName", project.name);
    localStorage.setItem("founder.isShowcase", String(!!project.isShowcase));
    setIsShowcase(!!project.isShowcase);
    if (nextConversation) localStorage.setItem("founder.conversationId", nextConversation);
    else localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id);
    setCompanyName(project.name);
    setConversationId(nextConversation);
    setShowProjects(false);
  }

  function newProject() {
    if (plan && !plan.canCreate) {
      setShowProjects(false);
      setShowBilling(true);
      return;
    }
    localStorage.removeItem("founder.companyId");
    localStorage.removeItem("founder.companyName");
    localStorage.removeItem("founder.conversationId");
    localStorage.removeItem("founder.isShowcase");
    setCompanyId(null);
    setCompanyName("your company");
    setConversationId(null);
    setIsShowcase(false);
    setShowProjects(false);
  }

  async function upgrade() {
    setCheckoutBusy(true);
    setCheckoutError(null);
    const checkoutUrl = import.meta.env.VITE_DODO_CHECKOUT_URL;
    if (!checkoutUrl) {
      setCheckoutError("add VITE_DODO_CHECKOUT_URL to frontend/.env.local");
      setCheckoutBusy(false);
      return;
    }
    window.location.assign(checkoutUrl);
  }

  function bypassBilling() {
    setCheckoutError(null);
    localStorage.setItem("founder.billingAccess", "internal");
    setBillingAccess("internal");
    setShowBilling(false);
  }

  function newMission(project: Project) {
    localStorage.setItem("founder.companyId", project._id);
    localStorage.setItem("founder.companyName", project.name);
    localStorage.removeItem("founder.conversationId");
    setCompanyId(project._id);
    setCompanyName(project.name);
    setConversationId(null);
    setShowProjects(false);
  }

  async function dispatch(text = message) {
    const value = text.trim();
    if (!value || !companyId || sending || isShowcase) return;
    setSending(true);
    try {
      if (!conversationId) {
        const id = await createConversation({ companyId: companyId as never, message: value });
        localStorage.setItem("founder.conversationId", id);
        setConversationId(id);
      } else await sendMessage({ conversationId: conversationId as never, message: value });
      setMessage("");
    } finally {
      setSending(false);
    }
  }

  async function approveResearch() {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      await approveResearchMutation({ conversationId: conversationId as never });
    } finally {
      setSending(false);
    }
  }

  async function approveLaunch() {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      await approveLaunchMutation({ conversationId: conversationId as never });
    } finally {
      setSending(false);
    }
  }

  async function retryFailedTask() {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      await retryFailedTaskMutation({ conversationId: conversationId as never });
      setFounderTab("room");
    } finally {
      setSending(false);
    }
  }

  async function sharePost(post: any) {
    if (!conversationId || !data?.campaign?.landingUrl) return;
    const popup = window.open("about:blank", "founder-share", "popup,width=760,height=720,scrollbars=yes,resizable=yes");
    try {
      await approveContentMutation({ conversationId: conversationId as never, contentId: post.id });
      await navigator.clipboard.writeText(post.body).catch(() => undefined);
      const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL || String(import.meta.env.VITE_CONVEX_URL ?? "").replace(".convex.cloud", ".convex.site");
      void fetch(`${siteUrl}/validation/event`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignKey: data.campaign.publicKey, type: "composer_opened", platform: post.platform, contentId: post.id }),
      }).catch(() => undefined);
      const landing = attributedLanding(data.campaign.landingUrl, post.platform, post.id);
      let target = landing;
      if (post.platform === "x") target = `https://x.com/intent/tweet?text=${encodeURIComponent(post.body)}`;
      else if (post.platform === "linkedin") target = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(landing)}`;
      else if (post.platform === "whatsapp") target = `https://wa.me/?text=${encodeURIComponent(post.body)}`;
      else if (post.platform === "reddit") {
        const community = String(post.community ?? "").replace(/^r\//, "").replace(/[^a-zA-Z0-9_]/g, "");
        target = community ? `https://www.reddit.com/r/${community}/submit?type=SELF` : "https://www.reddit.com/submit";
      }
      if (popup) popup.location.href = target;
      else window.open(target, "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
    }
  }

  function openTask(run: Run) {
    setOpenRunId(run._id);
  }

  if (!companyId)
    return (
      <>
        <Onboarding
          ownerKey={ownerKey}
          projects={projects}
          showcases={showcases}
          plan={plan}
          onReady={ready}
          onOpen={openProject}
          onUpgrade={() => setShowBilling(true)}
        />
        {showBilling && (
          <BillingModal
            plan={plan}
            busy={checkoutBusy}
            error={checkoutError}
            onClose={() => setShowBilling(false)}
            onCheckout={() => void upgrade()}
            onBypass={bypassBilling}
          />
        )}
      </>
    );

  const head = STAGE_HEAD[stage];
  const research = currentArtifact(artifacts, "research_report");
  const gtm = currentArtifact(artifacts, "gtm_strategy");
  const landing = currentArtifact(artifacts, "landing_page_preview");

  return (
    <main className="shell">
      <header className="app-header">
        <Brand />
        <button className="header-company" onClick={() => setShowProjects(true)}>
          <span className={`initial ${isShowcase ? "showcase" : ""}`}>{companyName.slice(0, 1)}</span>
          <div>
            <small>{isShowcase ? "showcase" : "company"}</small>
            <strong>{companyName}</strong>
          </div>
          <IconChevronDown size={15} />
        </button>
        <span className={`header-run ${active ? "is-live" : ""}`}>
          <span className={`dot ${active ? "working" : "ready"}`} />
          {workingCount ? `${workingCount} working` : active ? "queued" : String(currentStage ?? "ready").replaceAll("_", " ")}
        </span>
        <div className="header-spacer" />
        <span className={`plan-pill ${plan.plan}`}>{plan.plan === "free" ? `free · ${plan.used}/1` : `${plan.plan} · active`}</span>
        <button
          className="header-founder-toggle"
          onClick={() => {
            if (founderCollapsed) setFounderCollapsed(false);
            setMobilePanelOpen(true);
            setFounderTab("chat");
          }}
        >
          <img src={agentFor("founder").avatar} alt="" />
          <span>Founder</span>
        </button>
      </header>

      <div className="shell-body">
        <nav className="stage-rail" aria-label="Stages" ref={railRef}>
          {STAGE_TABS.map(item => {
            const Icon = item.icon;
            const dot =
              (item.key === "research" && research) ||
              (item.key === "gtm" && gtm) ||
              (item.key === "landing" && (landing || data?.campaign?.landingUrl));
            const count = item.key === "signals" && data?.validation?.signups > 0 ? data.validation.signups : null;
            return (
              <button key={item.key} className={stage === item.key ? "active" : ""} onClick={() => setStage(item.key)}>
                <Icon size={21} />
                <span>{item.label}</span>
                {dot && !count && <i className="rail-dot" />}
                {count ? <b className="rail-count">{count}</b> : null}
              </button>
            );
          })}
          <div className="rail-progress">
            <div className="rail-progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
            <small>{progress}%</small>
          </div>
        </nav>

        <div className="workspace">
          <div className="work-inner">
            <div className="stage-head">
              <div className="stage-head-copy">
                <p className="kicker wire-kicker">{head.kicker}</p>
                <h1>{stage === "idea" ? data?.conversation?.title ?? head.title : head.title}</h1>
                <p>{head.blurb}</p>
              </div>
            </div>

            {unresolvedFailure && !active && (
              <div className="recovery">
                <IconWarning size={18} />
                <div>
                  <strong>{agentFor(unresolvedFailure.agentKey).name} needs another pass.</strong>
                  <small>{unresolvedFailure.error ?? "The last response could not be validated."}</small>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => void retryFailedTask()} disabled={sending}>
                  <IconRefresh size={15} /> Retry
                </button>
              </div>
            )}

            {active && <ExecutionPanel runs={runs} events={events} onOpenTask={openTask} />}

            {stage === "idea" && (
              <IdeaOverview data={data ? { ...data, artifacts } : data} runs={runs} sources={sources} onGo={setStage} />
            )}
            {stage === "research" && (
              <ResearchStage
                artifact={research}
                stage={currentStage}
                reviews={reviews}
                onApprove={() => void approveResearch()}
                onOpen={setPreview}
              />
            )}
            {stage === "gtm" && (
              <GtmStage
                artifact={gtm}
                campaign={data?.campaign}
                stage={currentStage}
                approvals={data?.approvals ?? []}
                onApproveLaunch={() => void approveLaunch()}
                onShare={post => void sharePost(post)}
                onOpen={setPreview}
              />
            )}
            {stage === "landing" && <LandingStage artifacts={artifacts} reviews={reviews} onOpenSite={setSite} onOpenArtifact={setPreview} />}
            {stage === "signals" && <SignalsStage validation={data?.validation} campaign={data?.campaign} />}
            {stage === "team" && <TeamStage runs={runs} reviews={reviews} events={events} onOpenTask={openTask} onExport={exportMission} />}
          </div>
        </div>

        <FounderDrawer
          tab={founderTab}
          setTab={setFounderTab}
          collapsed={founderCollapsed}
          setCollapsed={setFounderCollapsed}
          mobileOpen={mobilePanelOpen}
          onCloseMobile={() => setMobilePanelOpen(false)}
          chatProps={{
            data,
            message,
            setMessage,
            onSend: () => void dispatch(),
            onPreset: (text: string) => {
              setMessage(text);
              void dispatch(text);
            },
            sending,
            onOpenTask: openTask,
            onOpenArtifact: setPreview,
            onOpenSite: setSite,
            readOnly: isShowcase,
          }}
          roomProps={{ runs, reviews, events, onOpenTask: openTask }}
          settingsProps={{
            companyName,
            companyId,
            conversationId,
            projects,
            plan,
            onOpenProject: openProject,
            onSwitch: () => setShowProjects(true),
            onNewIdea: newProject,
            onUpgrade: () => setShowBilling(true),
          }}
        />
      </div>

      <button
        className="mobile-founder-trigger"
        onClick={() => {
          setFounderTab("chat");
          setFounderCollapsed(false);
          setMobilePanelOpen(true);
        }}
      >
        <img src={agentFor("founder").avatar} alt="" />
        <span>
          <small>founder</small>
          <strong>Talk or change something</strong>
        </span>
        <IconArrowUp size={15} />
      </button>

      {openRun && <TaskDrawer run={openRun} artifacts={artifacts} onClose={() => setOpenRunId(null)} onOpenArtifact={setPreview} />}
      {site && <SiteViewer site={site} onClose={() => setSite(null)} />}
      {preview && <ArtifactPreview artifact={preview} onClose={() => setPreview(null)} />}
      {showProjects && (
        <ProjectSwitcher
          projects={projects}
          showcases={showcases}
          currentId={companyId}
          plan={plan}
          onClose={() => setShowProjects(false)}
          onOpen={openProject}
          onNewProject={newProject}
          onNewMission={newMission}
        />
      )}
      {showBilling && (
        <BillingModal
          plan={plan}
          busy={checkoutBusy}
          error={checkoutError}
          onClose={() => setShowBilling(false)}
          onCheckout={() => void upgrade()}
          onBypass={bypassBilling}
        />
      )}
    </main>
  );
}
