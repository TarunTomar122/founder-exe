import { useEffect, useState } from "react";
import {
  AGENTS,
  Artifact,
  Campaign,
  ReviewFinding,
  Run,
  SiteView,
  ValidationSummary,
  WorkflowStage,
  agentFor,
  attributedLanding,
  currentArtifact,
  formatDuration,
  formatTime,
  formatTokens,
  hostOf,
  money,
  runLabel,
  runStateWord,
  siteFor,
  STAGE_ORDER,
  statusFor,
  THINKING,
} from "../lib/core";
import { ArtifactIcon, EmptyState, StatusChip } from "./primitives";
import {
  IconArrowRight,
  IconAtom,
  IconCalendar,
  IconChart,
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconCopy,
  IconDownload,
  IconGlobe,
  IconLayers,
  IconRocket,
  IconSearch,
  IconShield,
  IconTrend,
} from "../lib/icons";

/* ============================================================
   EXECUTION PANEL — compact active-run state
   ============================================================ */

export function ExecutionPanel({ runs, events, onOpenTask }: { runs: Run[]; events: any[]; onOpenTask: (run: Run) => void }) {
  const active = runs.filter(run => ["pending", "running"].includes(run.status));
  const primary = active.find(run => run.status === "running") ?? active[0];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!primary || primary.status !== "running") return;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [primary?._id, primary?.status]);

  if (!primary) return null;

  const agent = agentFor(primary.agentKey);
  const elapsed = primary.status === "running" ? Date.now() - primary.startedAt : primary.latencyMs ?? 0;
  const queued = active.filter(run => run._id !== primary._id);
  const lastEvent = [...events].reverse().find(event => event.detail);
  const nextRun = queued[0];

  void tick;

  return (
    <div className="exec" aria-label="Active work">
      <div className="exec-top">
        <div className="exec-avatar">
          <img src={agent.avatar} alt="" />
          <span className={`dot ${primary.status === "running" ? "working" : "queued"}`} />
        </div>
        <div className="exec-main">
          <p className="kicker">{primary.status === "running" ? "Working now" : "Queued"}</p>
          <strong>
            {agent.name} · {runLabel(primary)}
          </strong>
          <p>{primary.status === "running" ? THINKING[primary.agentKey] : "Waiting for a free desk in the cloud."}</p>
        </div>
        <div className="exec-elapsed">
          <strong className="mono">{formatDuration(elapsed)}</strong>
          <small>elapsed</small>
        </div>
      </div>
      {primary.status === "running" && (
        <div className="exec-wire">
          <i />
        </div>
      )}
      {!!queued.length && (
        <div className="exec-queue">
          {queued.map(run => (
            <button className="chip queued" key={run._id} onClick={() => onOpenTask(run)}>
              <IconClock size={11} /> {agentFor(run.agentKey).name}
            </button>
          ))}
        </div>
      )}
      <div className="exec-foot">
        <div>
          <span>Recent event</span>
          <p>{lastEvent ? String(lastEvent.detail) : "Mission just started."}</p>
        </div>
        <div>
          <span>Next up</span>
          <p>{nextRun ? `${agentFor(nextRun.agentKey).name} · ${runLabel(nextRun)}` : "Founder synthesizes the answer."}</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   IDEA / OVERVIEW
   ============================================================ */

const STAGE_ICONS: Record<string, typeof IconSearch> = {
  discovery: IconAtom,
  research: IconSearch,
  research_ready: IconCheck,
  building: IconRocket,
  cross_review: IconShield,
  launch_ready: IconCheck,
  launched: IconGlobe,
};

export function IdeaOverview({
  data,
  runs,
  sources,
  onGo,
}: {
  data: any;
  runs: Run[];
  sources: number;
  onGo: (stage: "research" | "gtm" | "landing" | "signals") => void;
}) {
  const stage = data?.conversation?.stage as WorkflowStage | undefined;
  const research = currentArtifact(data?.artifacts ?? [], "research_report");
  const gtm = currentArtifact(data?.artifacts ?? [], "gtm_strategy");
  const landing = currentArtifact(data?.artifacts ?? [], "landing_page_preview");
  const stageIndex = stage ? STAGE_ORDER.indexOf(stage) : -1;

  return (
    <>
      <section className="metric-row">
        <article className="metric">
          <span>Evidence</span>
          <strong>{sources}</strong>
          <small>unique sources</small>
        </article>
        <article className="metric">
          <span>Agent work</span>
          <strong>{runs.filter(run => run.status === "succeeded").length}</strong>
          <small>{runs.length} tasks total</small>
        </article>
        <article className="metric">
          <span>Peer review</span>
          <strong>{runs.filter(run => run.taskType === "peer_review").length}</strong>
          <small>cross-checks run</small>
        </article>
        <article className="metric">
          <span>Real signals</span>
          <strong>{data?.validation?.signups ?? 0}</strong>
          <small>waitlist signups</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">From idea to signal</p>
            <h3>Nothing advances without evidence or approval.</h3>
          </div>
        </div>
        <div className="flow-strip">
          {STAGE_ORDER.slice(0, 7).map((item, index) => {
            const Icon = STAGE_ICONS[item] ?? IconAtom;
            const done = index < stageIndex;
            const current = item === stage;
            return (
              <div className={`flow-node ${done ? "done" : ""} ${current ? "current" : ""}`} key={item}>
                <i>{done ? <IconCheck size={13} /> : <Icon size={13} />}</i>
                <strong>{item.replaceAll("_", " ")}</strong>
                <small>{item.endsWith("_ready") ? "your call" : index % 2 ? "review" : "agent"}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="panel-head" style={{ border: "none", padding: "0 2px 12px" }}>
          <div>
            <p className="kicker">Your validation stack</p>
            <h3>Open any layer.</h3>
          </div>
        </div>
        <div className="stack-grid">
          <button className={`stack-card ${research ? "ready" : ""}`} onClick={() => onGo("research")}>
            <span className="stack-icon">
              <IconChart size={20} />
            </span>
            <div>
              <strong>Market dossier</strong>
              <small>
                {research
                  ? `${research.data?.competitors?.length ?? 0} competitors · ${research.sourceUrls.length} sources`
                  : "Research queued after Founder understands the idea"}
              </small>
            </div>
            <IconArrowRight size={15} />
          </button>
          <button className={`stack-card ${gtm ? "ready" : ""}`} onClick={() => onGo("gtm")}>
            <span className="stack-icon">
              <IconRocket size={20} />
            </span>
            <div>
              <strong>Validation campaign</strong>
              <small>
                {gtm
                  ? `${gtm.data?.channels?.length ?? 0} channels · ${gtm.data?.posts?.length ?? 0} drafts`
                  : "Blocked until research is approved"}
              </small>
            </div>
            <IconArrowRight size={15} />
          </button>
          <button className={`stack-card ${landing ? "ready" : ""}`} onClick={() => onGo("landing")}>
            <span className="stack-icon">
              <IconGlobe size={20} />
            </span>
            <div>
              <strong>Stable waitlist page</strong>
              <small>{landing ? "Live capture and attribution connected" : "Built after campaign is reviewed"}</small>
            </div>
            <IconArrowRight size={15} />
          </button>
          <button className={`stack-card ${data?.campaign?.status === "live" ? "ready" : ""}`} onClick={() => onGo("signals")}>
            <span className="stack-icon">
              <IconTrend size={20} />
            </span>
            <div>
              <strong>Demand signals</strong>
              <small>{data?.campaign?.status === "live" ? "Measuring the live campaign" : "Starts after launch approval"}</small>
            </div>
            <IconArrowRight size={15} />
          </button>
        </div>
      </section>
    </>
  );
}

/* ============================================================
   RESEARCH / MARKET
   ============================================================ */

export function ResearchStage({
  artifact,
  stage,
  reviews,
  onApprove,
  onOpen,
}: {
  artifact?: Artifact;
  stage?: WorkflowStage;
  reviews: ReviewFinding[];
  onApprove: () => void;
  onOpen: (artifact: Artifact) => void;
}) {
  const data = artifact?.data as any;
  if (artifact && !data?.icp) {
    return (
      <div className="legacy-card">
        <IconChart size={22} />
        <div>
          <small>saved research</small>
          <strong>{artifact.title}</strong>
          <p>This project predates the structured market workspace. Its cited dossier is preserved exactly.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(artifact)}>
          Open dossier <IconArrowRight size={14} />
        </button>
      </div>
    );
  }
  if (!artifact) {
    return (
      <EmptyState
        icon={<IconSearch size={22} />}
        title="Research is building the evidence dossier."
        body="Competitors, market sizing, customer signals and risky assumptions will appear here as structured, cited evidence."
      />
    );
  }
  const maxMarket = Math.max(1, ...((data.marketSize ?? []).map((item: any) => item.valueHigh)));
  const competitors = (data.competitors ?? []).slice(0, 4);
  const relevantReviews = reviews.filter(review => review.targetArtifactKind === "research_report");

  return (
    <>
      <section className={`verdict ${data.verdict}`}>
        <p className="kicker">Research verdict</p>
        <div className="verdict-top">
          <span className="verdict-badge">{String(data.verdict).replace("_", " ")}</span>
        </div>
        <p className="clamp-4">{data.decision}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(artifact)}>
          Open cited dossier <IconArrowRight size={14} />
        </button>
      </section>

      <section className="two-col">
        <div className="mini-panel">
          <p className="kicker">Who hurts first</p>
          <h3 className="clamp-2">{data.icp.segment}</h3>
          <dl>
            <div>
              <dt>Pain</dt>
              <dd className="clamp-3">{data.icp.problem}</dd>
            </div>
            <div>
              <dt>Trigger</dt>
              <dd className="clamp-3">{data.icp.trigger}</dd>
            </div>
            <div>
              <dt>Today</dt>
              <dd className="clamp-3">{data.icp.currentAlternative}</dd>
            </div>
          </dl>
        </div>
        <div className="mini-panel">
          <p className="kicker">Positioning gap</p>
          <h3 className="clamp-2">{data.positioning?.promise}</h3>
          <p className="clamp-3" style={{ marginTop: 10, color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>
            {data.positioning?.gap}
          </p>
          <div className="risk-tags">
            {(data.positioning?.risks ?? []).slice(0, 3).map((risk: string) => (
              <em key={risk}>
                <IconShield size={12} />
                {risk}
              </em>
            ))}
          </div>
        </div>
      </section>

      {!!(data.marketSize ?? []).length && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Market model</p>
              <h3>Ranges with the math exposed.</h3>
            </div>
            <small style={{ color: "var(--muted-2)", fontSize: 12 }}>no fake precision</small>
          </div>
          <div className="sizing-list">
            {(data.marketSize ?? []).slice(0, 3).map((item: any) => (
              <div className="sizing-item" key={item.label}>
                <header>
                  <strong>{item.label}</strong>
                  <span className={`conf conf-${item.confidence}`}>{item.confidence}</span>
                </header>
                <div className="val">{money(item.valueBase, item.currency)}</div>
                <div className="sizing-bar">
                  <i style={{ width: `${Math.max(4, (item.valueHigh / maxMarket) * 100)}%` }} />
                </div>
                <small>
                  {money(item.valueLow, item.currency)} – {money(item.valueHigh, item.currency)} · {item.period}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!competitors.length && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Competitive field</p>
              <h3>{data.competitors?.length ?? 0} alternatives mapped</h3>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={() => onOpen(artifact)}>
              See all <IconArrowRight size={13} />
            </button>
          </div>
          <div className="competitor-preview">
            {competitors.map((item: any) => (
              <div className="competitor-row" key={item.name}>
                <h4>{item.name}</h4>
                <p>{item.gap ?? item.promise}</p>
                <span className="gap-tag">{item.sourceUrls?.length ?? 0} src</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!relevantReviews.length && <ReviewBoard title="Team review" reviews={relevantReviews} />}

      {stage === "research_ready" && (
        <section className="decision-card">
          <IconCheckCircle size={22} />
          <div>
            <strong>Research is ready for your decision.</strong>
            <p>Keep discussing with Founder, or lock this evidence so GTM can design the test.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onApprove}>
            Approve research <IconArrowRight size={14} />
          </button>
        </section>
      )}
    </>
  );
}

/* ============================================================
   GTM / CAMPAIGN
   ============================================================ */

export function GtmStage({
  artifact,
  campaign,
  stage,
  approvals,
  onApproveLaunch,
  onShare,
  onOpen,
}: {
  artifact?: Artifact;
  campaign?: Campaign;
  stage?: WorkflowStage;
  approvals: any[];
  onApproveLaunch: () => void;
  onShare: (post: any) => void;
  onOpen: (artifact: Artifact) => void;
}) {
  const data = artifact?.data as any;
  if (artifact && !data?.channels) {
    return (
      <div className="legacy-card">
        <IconRocket size={22} />
        <div>
          <small>saved campaign</small>
          <strong>{artifact.title}</strong>
          <p>This earlier campaign remains available as its original complete report.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onOpen(artifact)}>
          Open report <IconArrowRight size={14} />
        </button>
      </div>
    );
  }
  if (!artifact) {
    return (
      <EmptyState
        icon={<IconRocket size={22} />}
        title="Campaign work begins after research approval."
        body="GTM will score channels, build measurable experiments and draft platform-native content from the approved evidence."
      />
    );
  }

  const channels = data.channels ?? [];
  const experiments = data.experiments ?? [];
  const posts = data.posts ?? [];

  return (
    <>
      <section className="thesis">
        <div className="thesis-head">
          <div>
            <p className="kicker">Launch thesis</p>
            <h3 className="clamp-3">{data.hypothesis}</h3>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onOpen(artifact)}>
            Open full launch plan <IconArrowRight size={14} />
          </button>
        </div>
        <div className="thesis-summary">
          <article>
            <b>Audience</b>
            <p className="clamp-3">{data.audience}</p>
          </article>
          <article>
            <b>Offer</b>
            <p className="clamp-3">{data.offer}</p>
          </article>
          <article>
            <b>Signal</b>
            <p className="clamp-3">{data.conversionEvent}</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">Channel priorities</p>
            <h3>Chosen for learning speed</h3>
          </div>
          {channels.length > 3 && (
            <button className="btn btn-quiet btn-sm" onClick={() => onOpen(artifact)}>
              All {channels.length} <IconArrowRight size={13} />
            </button>
          )}
        </div>
        <div className="channel-list">
          {channels.slice(0, 3).map((channel: any) => {
            const raw = [channel.intent, channel.reachability, channel.feedbackSpeed].map(Number);
            const scale = Math.max(...raw) <= 1 ? 100 : 10;
            const percentages = raw.map(value => Math.max(0, Math.min(100, value * scale)));
            const score = Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
            return (
              <div className="channel-item" key={`${channel.platform}-${channel.community ?? ""}`}>
                <div className="channel-score">
                  <strong>{score}</strong>
                  <small>/100</small>
                </div>
                <div className="channel-body">
                  <span>
                    {channel.platform}
                    {channel.community ? ` / ${channel.community}` : ""}
                  </span>
                  <p className="clamp-2">{channel.rationale}</p>
                  <div className="channel-bars">
                    {percentages.map((value, index) => (
                      <i style={{ width: `${Math.max(10, value)}px` }} key={index} />
                    ))}
                  </div>
                </div>
                <em className={`risk-flag risk-${channel.promotionRisk}`}>{channel.promotionRisk} risk</em>
              </div>
            );
          })}
        </div>
      </section>

      {!!experiments.length && <ExperimentSequence experiments={experiments} onOpen={() => onOpen(artifact)} />}

      <PostPreviews posts={posts} campaign={campaign} stage={stage} approvals={approvals} onShare={onShare} />

      {stage === "launch_ready" && (
        <section className="gate">
          <IconRocket size={22} />
          <div>
            <strong>The team approved one coherent campaign.</strong>
            <p>You still control every external action. Approve launch to unlock platform composers.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={onApproveLaunch}>
            Approve launch <IconArrowRight size={14} />
          </button>
        </section>
      )}
    </>
  );
}

function PostCard({
  post,
  campaign,
  stage,
  approvals,
  onShare,
}: {
  post: any;
  campaign?: Campaign;
  stage?: WorkflowStage;
  approvals: any[];
  onShare: (post: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const approved = approvals.some(item => item.objectType === "content" && item.objectId === post.id && item.decision === "approved");
  const body = campaign?.landingUrl
    ? post.body.replaceAll("{{LANDING_URL}}", attributedLanding(campaign.landingUrl, post.platform, post.id))
    : post.body;
  const canShare = !!campaign?.landingUrl && ["launched", "measuring", "complete"].includes(stage ?? "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <article className="post-card">
      <header>
        <div className="post-plat">
          <span>{post.platform}</span>
          <small>{post.community ?? post.variant}</small>
        </div>
        <em className={`risk-flag risk-${post.risk}`}>{post.risk} risk</em>
      </header>
      <p className={`post-copy ${expanded ? "expanded" : ""}`}>{body}</p>
      <div className="post-foot">
        <span className="post-meta">{body.length} chars</span>
        {body.length > 260 && (
          <button className="btn btn-quiet btn-sm" onClick={() => setExpanded(value => !value)}>
            {expanded ? "Less" : "More"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn btn-primary btn-sm" disabled={!canShare} onClick={() => onShare({ ...post, body })}>
          {approved ? "Open again" : "Approve & open"} <IconArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}

const SEQUENCE_PREVIEW = 3;

function ExperimentSequence({ experiments, onOpen }: { experiments: any[]; onOpen: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? experiments : experiments.slice(0, SEQUENCE_PREVIEW);
  const hasMore = experiments.length > SEQUENCE_PREVIEW;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Launch sequence</p>
          <h3>{experiments.length} measurable moves</h3>
        </div>
        <IconCalendar size={18} style={{ color: "var(--muted-2)" }} />
      </div>
      <div className="sequence">
        {visible.map((experiment: any, index: number) => (
          <div className="seq-item" key={`${experiment.day}-${index}`}>
            <span className="seq-day">day {experiment.day}</span>
            <div className="seq-body">
              <strong>
                {experiment.platform} · {experiment.action}
              </strong>
              <p className="clamp-2">{experiment.asset}</p>
              <small>
                measure {experiment.metric} · win: {experiment.successThreshold}
              </small>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="disclosure-foot">
          <button className="review-toggle" onClick={() => setShowAll(value => !value)}>
            {showAll ? `Show first ${SEQUENCE_PREVIEW} only` : `View all ${experiments.length} moves`}
            <IconArrowRight size={14} style={{ transform: showAll ? "rotate(-90deg)" : "rotate(90deg)" }} />
          </button>
          <button className="btn btn-quiet btn-sm" onClick={onOpen}>
            Open full plan <IconArrowRight size={13} />
          </button>
        </div>
      )}
    </section>
  );
}

const POSTS_PREVIEW = 3;

function PostPreviews({
  posts,
  campaign,
  stage,
  approvals,
  onShare,
}: {
  posts: any[];
  campaign?: Campaign;
  stage?: WorkflowStage;
  approvals: any[];
  onShare: (post: any) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? posts : posts.slice(0, POSTS_PREVIEW);
  const hasMore = posts.length > POSTS_PREVIEW;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">Post previews</p>
          <h3>Platform-native, approval-safe</h3>
        </div>
        <small style={{ color: "var(--muted-2)", fontSize: 12 }}>
          {campaign?.landingUrl ? "live link injected" : "waiting for landing url"}
        </small>
      </div>
      <div className="post-list">
        {visible.map((post: any) => (
          <PostCard key={post.id} post={post} campaign={campaign} stage={stage} approvals={approvals} onShare={onShare} />
        ))}
      </div>
      {hasMore && (
        <button className="review-toggle" onClick={() => setShowAll(value => !value)}>
          {showAll ? `Show first ${POSTS_PREVIEW} only` : `View all ${posts.length} drafts`}
          <IconArrowRight size={14} style={{ transform: showAll ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
      )}
    </section>
  );
}

/* ============================================================
   LANDING
   ============================================================ */

export function LandingStage({
  artifacts,
  reviews,
  onOpenSite,
  onOpenArtifact,
}: {
  artifacts: Artifact[];
  reviews: ReviewFinding[];
  onOpenSite: (site: SiteView) => void;
  onOpenArtifact: (artifact: Artifact) => void;
}) {
  const site = siteFor([...artifacts].reverse(), artifacts);
  const brief = currentArtifact(artifacts, "landing_page_brief");
  const landingReviews = reviews.filter(review => review.targetArtifactKind.includes("landing"));

  return (
    <>
      {site ? (
        <section>
          <button className="site-card" onClick={() => onOpenSite(site)}>
            <div className="site-chrome">
              <i />
              <i />
              <i />
              <em className="mono">{site.url ? hostOf(site.url) : "built by landing"}</em>
            </div>
            <div className="site-card-body">
              <span className="site-glyph">
                <IconGlobe size={24} />
              </span>
              <div>
                <strong>{site.title}</strong>
                <small>
                  <i /> stable url · real waitlist · attributed analytics
                </small>
              </div>
            </div>
          </button>
          <div className="landing-actions" style={{ marginTop: 12 }}>
            {site.url && (
              <a className="btn btn-primary btn-sm" href={site.url} target="_blank" rel="noreferrer">
                <IconGlobe size={15} /> Open live page <IconArrowRight size={14} />
              </a>
            )}
            {brief && (
              <button className="btn btn-ghost btn-sm" onClick={() => onOpenArtifact(brief)}>
                <ArtifactIcon kind="landing_page_brief" size={15} /> Open message + claim brief
              </button>
            )}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={<IconGlobe size={22} />}
          title="The page waits for an approved strategy."
          body="Landing consumes the research and campaign, then both specialists review every claim and CTA before Founder presents it."
        />
      )}

      {brief?.data && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Conversion contract</p>
              <h3>What this page must prove</h3>
            </div>
          </div>
          <div className="contract-grid" style={{ margin: 18 }}>
            <article>
              <span>Audience</span>
              <p>{brief.data.audience}</p>
            </article>
            <article>
              <span>Five-second promise</span>
              <p>{brief.data.promise}</p>
            </article>
            <article>
              <span>Primary action</span>
              <p>{brief.data.primaryCta}</p>
            </article>
            <article>
              <span>Qualifying question</span>
              <p>{brief.data.waitlistQuestion}</p>
            </article>
          </div>
        </section>
      )}

      {landingReviews.length ? (
        <ReviewBoard title="Cross-review ledger" reviews={landingReviews} />
      ) : (
        <EmptyState
          compact
          icon={<IconShield size={20} />}
          title="Reviews appear with the first page draft."
          body="Research checks truth; GTM checks conversion and message continuity."
        />
      )}
    </>
  );
}

/* ============================================================
   SIGNALS
   ============================================================ */

export function SignalsStage({ validation, campaign }: { validation?: ValidationSummary; campaign?: Campaign }) {
  const value = validation ?? { views: 0, uniqueVisitors: 0, ctaClicks: 0, signups: 0, conversionRate: 0, bySource: [] };
  const isLive = campaign?.status === "live";
  return (
    <>
      <section className="verdict" style={{ paddingLeft: 20 }}>
        <p className="kicker">Live validation</p>
        <h3 style={{ fontSize: 20 }}>{isLive ? "The market is answering now." : "Measurement starts when you approve launch."}</h3>
        <p>Views, intent clicks and real waitlist signups flow back from the stable Cloudflare page into Convex.</p>
      </section>

      <section className="panel">
        <div className="funnel">
          <article>
            <span>Page views</span>
            <strong>{value.views}</strong>
            <small>{value.uniqueVisitors} unique</small>
          </article>
          <IconArrowRight className="conn" size={18} />
          <article>
            <span>CTA clicks</span>
            <strong>{value.ctaClicks}</strong>
            <small>{value.views ? `${Math.round((value.ctaClicks / value.views) * 100)}%` : "—"} rate</small>
          </article>
          <IconArrowRight className="conn" size={18} />
          <article>
            <span>Signups</span>
            <strong>{value.signups}</strong>
            <small>{value.views ? `${(value.conversionRate * 100).toFixed(1)}%` : "—"} conversion</small>
          </article>
        </div>
      </section>

      {value.bySource.length ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Source performance</p>
              <h3>Attributed by campaign link</h3>
            </div>
          </div>
          <div className="source-perf">
            {value.bySource.map(item => (
              <article key={item.source}>
                <header>
                  <strong>{item.source}</strong>
                  <span>
                    {item.views} views · {item.signups} signups
                  </span>
                </header>
                <div className="src-bar">
                  <i style={{ width: `${Math.max(3, value.views ? (item.views / value.views) * 100 : 0)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          compact
          icon={<IconTrend size={20} />}
          title="No traffic yet."
          body="Approve launch and share a draft — this board updates live from real visits and signups."
        />
      )}
    </>
  );
}

/* ============================================================
   TEAM / TRACE
   ============================================================ */

export function TeamStage({
  runs,
  reviews,
  events,
  onOpenTask,
  onExport,
}: {
  runs: Run[];
  reviews: ReviewFinding[];
  events: any[];
  onOpenTask: (run: Run) => void;
  onExport: (format: "json" | "markdown") => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Run["agentKey"]>("all");
  const runMap = new Map(runs.map(run => [run._id, run]));
  const median = (values: number[]) => {
    const sorted = values.filter(Boolean).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const medianLatency = median(runs.map(run => run.latencyMs ?? 0));
  const medianTokens = median(runs.map(run => (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0)));
  const filtered = runs
    .filter(run => filter === "all" || run.agentKey === filter)
    .filter(run =>
      `${agentFor(run.agentKey).name} ${run.summary ?? ""} ${run.command?.message ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const groups = groupRuns(filtered);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">The validation crew</p>
            <h3>Every handoff is real and inspectable</h3>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => onExport("json")}>
              <IconDownload size={14} /> JSON
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onExport("markdown")}>
              <IconDownload size={14} /> Markdown
            </button>
          </div>
        </div>
        <div className="roster">
          {AGENTS.map(agent => {
            const own = runs.filter(run => run.agentKey === agent.key);
            const latest = own.at(-1);
            return (
              <article key={agent.key}>
                <img src={agent.avatar} alt="" />
                <div>
                  <span>{agent.role}</span>
                  <strong>{agent.name}</strong>
                  <p>{latest ? runLabel(latest) : "Waiting for the workflow"}</p>
                </div>
                <StatusChip status={statusFor(agent.key, runs)} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="kicker">Execution phases</p>
            <h3>Grouped by agent and task</h3>
          </div>
        </div>
        <div className="anomaly-search">
          <div className="search-box">
            <IconSearch size={15} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search prompts, replies, tasks…" />
          </div>
          <div className="filter-tabs">
            {(["all", ...AGENTS.map(agent => agent.key)] as const).map(key => (
              <button className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key)}>
                {key === "all" ? "All" : agentFor(key).name}
              </button>
            ))}
          </div>
        </div>
        {!groups.length ? (
          <div style={{ padding: 18 }}>
            <EmptyState
              compact
              icon={<IconAtom size={20} />}
              title="No matching tasks."
              body="Give Founder a mission and every task will show up here as it runs."
            />
          </div>
        ) : (
          <div className="phase-groups">
            {groups.map(group => (
              <PhaseGroup
                key={group.key}
                group={group}
                runMap={runMap}
                medianLatency={medianLatency}
                medianTokens={medianTokens}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
        )}
      </section>

      {!!reviews.length && <ReviewBoard title="Review findings" reviews={reviews} />}

      {!!events.length && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="kicker">Workflow ledger</p>
              <h3>Everything that happened</h3>
            </div>
          </div>
          <div className="event-feed" style={{ padding: "6px 18px 14px" }}>
            {[...events].reverse().slice(0, 20).map(event => (
              <article key={event._id}>
                <i className={`event-${event.type}`} />
                <div>
                  <strong>{String(event.type).replaceAll("_", " ")}</strong>
                  <p>{event.detail}</p>
                </div>
                <time>{formatTime(event.createdAt)}</time>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ---------- phase grouping (agent + taskType) ---------- */

type PhaseGroupData = {
  key: string;
  agentKey: Run["agentKey"];
  taskType: string;
  stage?: WorkflowStage;
  attempts: Run[];
  succeeded: number;
  failed: number;
  running: number;
  totalMs: number;
  totalTokens: number;
  hasTiming: boolean;
  hasTokens: boolean;
  latest: Run;
};

// Collapse repeated create/revise/review attempts into one phase per
// agent + taskType, preserving mission order and keeping each attempt's
// exact run reachable through the drill-down.
function groupRuns(runs: Run[]): PhaseGroupData[] {
  const order: string[] = [];
  const map = new Map<string, Run[]>();
  for (const run of runs) {
    const key = `${run.agentKey}::${run.taskType ?? "task"}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(run);
  }
  return order.map(key => {
    const attempts = map.get(key)!;
    const [agentKey, taskType] = key.split("::") as [Run["agentKey"], string];
    const totalMs = attempts.reduce((sum, run) => sum + (run.latencyMs ?? 0), 0);
    const totalTokens = attempts.reduce(
      (sum, run) => sum + (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0),
      0,
    );
    return {
      key,
      agentKey,
      taskType,
      stage: attempts[attempts.length - 1].stage,
      attempts,
      succeeded: attempts.filter(run => run.status === "succeeded").length,
      failed: attempts.filter(run => run.status === "failed").length,
      running: attempts.filter(run => ["pending", "running"].includes(run.status)).length,
      totalMs,
      totalTokens,
      hasTiming: attempts.some(run => run.latencyMs),
      hasTokens: attempts.some(run => (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0) > 0),
      latest: attempts[attempts.length - 1],
    };
  });
}

function PhaseGroup({
  group,
  runMap,
  medianLatency,
  medianTokens,
  onOpenTask,
}: {
  group: PhaseGroupData;
  runMap: Map<string, Run>;
  medianLatency: number;
  medianTokens: number;
  onOpenTask: (run: Run) => void;
}) {
  const agent = agentFor(group.agentKey);
  const latestState = runStateWord(group.latest);
  const latestStatus =
    group.latest.summary ||
    (group.latest.status === "running"
      ? THINKING[group.agentKey]
      : group.latest.error ?? runLabel(group.latest));
  const summaryBits = [
    group.succeeded ? `${group.succeeded} ok` : null,
    group.failed ? `${group.failed} failed` : null,
    group.running ? `${group.running} running` : null,
  ].filter(Boolean);

  return (
    <details className="phase-group">
      <summary>
        <img src={agent.avatar} alt="" />
        <span className="phase-main">
          <strong>
            {agent.name} · {group.taskType.replaceAll("_", " ")}
          </strong>
          <small className="clamp-2">{latestStatus}</small>
        </span>
        <span className="phase-meta">
          <span className="phase-count">
            {group.attempts.length} attempt{group.attempts.length === 1 ? "" : "s"}
          </span>
          {!!summaryBits.length && <span className="phase-tally mono">{summaryBits.join(" · ")}</span>}
          {(group.hasTiming || group.hasTokens) && (
            <span className="phase-tally mono">
              {group.hasTiming ? formatDuration(group.totalMs) : ""}
              {group.hasTiming && group.hasTokens ? " · " : ""}
              {group.hasTokens ? `${formatTokens(group.totalTokens)} tok` : ""}
            </span>
          )}
        </span>
        <StatusChip status={latestState} />
        <IconArrowRight className="trace-chev" size={15} />
      </summary>
      <div className="phase-attempts">
        {group.attempts.map((run, index) => {
          const state = runStateWord(run);
          const tokens = (run.trace?.inputTokens ?? 0) + (run.trace?.outputTokens ?? 0);
          const parent = run.parentRunId ? runMap.get(run.parentRunId) : undefined;
          const anomaly =
            run.status === "failed"
              ? "failure"
              : medianLatency && (run.latencyMs ?? 0) > medianLatency * 1.75
                ? "latency spike"
                : medianTokens && tokens > medianTokens * 1.35
                  ? "token spike"
                  : null;
          return (
            <button className="phase-attempt" key={run._id} onClick={() => onOpenTask(run)}>
              <span className="phase-idx mono">#{index + 1}</span>
              <span className="phase-attempt-main">
                <strong className="clamp-1">{runLabel(run)}</strong>
                <small>
                  {parent ? `by ${agentFor(parent.agentKey).name}` : "by user"} · {formatDuration(run.latencyMs)} ·{" "}
                  {formatTokens(tokens)} tok
                </small>
              </span>
              {anomaly && <span className="trace-alert">{anomaly}</span>}
              <StatusChip status={state} />
              <IconArrowRight className="phase-open" size={14} />
            </button>
          );
        })}
      </div>
    </details>
  );
}

/* ---------- shared review board ---------- */

const SEVERITY_RANK: Record<ReviewFinding["severity"], number> = { blocking: 0, material: 1, note: 2 };

function ReviewBoard({ title, reviews }: { title: string; reviews: ReviewFinding[] }) {
  const [expanded, setExpanded] = useState(false);

  // Priority order: open before closed, more-severe before less, newest before older.
  const ordered = [...reviews].sort((a, b) => {
    const openA = a.status === "open" ? 0 : 1;
    const openB = b.status === "open" ? 0 : 1;
    if (openA !== openB) return openA - openB;
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    return b.createdAt - a.createdAt;
  });

  const openCount = reviews.filter(review => review.status === "open").length;
  const DEFAULT_VISIBLE = 3;
  const hasMore = ordered.length > DEFAULT_VISIBLE;
  const visible = expanded ? ordered : ordered.slice(0, DEFAULT_VISIBLE);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="kicker">{title}</p>
          <h3>
            {openCount
              ? `${openCount} open finding${openCount === 1 ? "" : "s"}`
              : "All findings resolved"}
          </h3>
        </div>
        <IconLayers size={18} style={{ color: "var(--muted-2)" }} />
      </div>
      <div className="review-list">
        {visible.map(review => (
          <ReviewItem key={review._id} review={review} detailed={expanded} />
        ))}
      </div>
      {hasMore && (
        <button className="review-toggle" onClick={() => setExpanded(value => !value)}>
          {expanded ? (
            <>Show top {DEFAULT_VISIBLE} only</>
          ) : (
            <>View all {ordered.length} findings</>
          )}
          <IconArrowRight size={14} style={{ transform: expanded ? "rotate(-90deg)" : "rotate(90deg)" }} />
        </button>
      )}
    </section>
  );
}

// In the 3-item preview, keep findings scannable: feedback clamps to ~3 lines
// and acceptance criteria to ~2, with a per-finding escape hatch. The
// all-findings view stays fully detailed.
function ReviewItem({ review, detailed }: { review: ReviewFinding; detailed: boolean }) {
  const [open, setOpen] = useState(false);
  const showFull = detailed || open;
  const clampable =
    !detailed && ((review.feedback?.length ?? 0) > 150 || (review.acceptanceCriteria?.length ?? 0) > 90);

  return (
    <div className={`review-item ${review.severity}`}>
      <img src={agentFor(review.reviewerAgent).avatar} alt="" />
      <div>
        <strong>
          {agentFor(review.reviewerAgent).name} · {review.severity}
        </strong>
        <p className={showFull ? "" : "clamp-3"}>{review.feedback}</p>
        <small className={showFull ? "" : "clamp-2"}>
          {review.status} · pass when: {review.acceptanceCriteria}
        </small>
        {clampable && (
          <button className="review-item-toggle" onClick={() => setOpen(value => !value)}>
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

