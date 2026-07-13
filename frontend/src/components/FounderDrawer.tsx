import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AGENTS,
  Artifact,
  BillingPlan,
  Message,
  MISSIONS,
  Project,
  ReviewFinding,
  Run,
  RunCommand,
  SiteView,
  agentFor,
  formatTime,
  isSiteKind,
  siteFor,
  statusFor,
  taskLine,
  THINKING,
  AgentKey,
} from "../lib/core";
import { ArtifactIcon } from "./primitives";
import {
  IconArrowUp,
  IconCheckCircle,
  IconClock,
  IconGlobe,
  IconList,
  IconPlay,
  IconRocket,
  IconSearch,
  IconSound,
  IconSpinner,
  IconStop,
} from "../lib/icons";

type FounderTab = "chat" | "room" | "settings";

type FeedItem =
  | { kind: "user"; id: string; content: string; at: number }
  | { kind: "agent"; id: string; agentKey: AgentKey; content: string; at: number };

// Human chat carries only real conversation — user messages and substantive
// agent/founder replies. Routing handoffs are execution telemetry and live in
// the Team room, the running-task strip, and the task trace instead.
function buildFeed(messages: Message[]): FeedItem[] {
  const items: FeedItem[] = [];
  for (const message of messages.filter(message => message.audience !== "internal")) {
    if (message.role === "user") items.push({ kind: "user", id: message._id, content: message.content, at: message.createdAt });
    else items.push({ kind: "agent", id: message._id, agentKey: message.agentKey ?? "founder", content: message.content, at: message.createdAt });
  }
  return items.sort((a, b) => a.at - b.at);
}

const MISSION_ICON: Record<string, typeof IconSearch> = {
  market: IconSearch,
  landing: IconGlobe,
  launch: IconRocket,
};

/* ---------------- Chat ---------------- */

function Chat({
  data,
  message,
  setMessage,
  onSend,
  onPreset,
  sending,
  onOpenTask,
  onOpenArtifact,
  onOpenSite,
  readOnly,
}: {
  data: any;
  message: string;
  setMessage: (value: string) => void;
  onSend: () => void;
  onPreset: (text: string) => void;
  sending: boolean;
  onOpenTask: (run: Run) => void;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenSite: (site: SiteView) => void;
  readOnly?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);

  const messages: Message[] = data?.messages ?? [];
  const commands: RunCommand[] = data?.commands ?? [];
  const runs: Run[] = (data?.runs ?? []).map((run: Run) => ({
    ...run,
    command: commands.find(command => command._id === run.commandId),
  }));
  const artifacts: Artifact[] = data?.artifacts ?? [];
  const feed = useMemo(() => buildFeed(messages), [messages]);
  const workingRuns = runs.filter(run => ["pending", "running"].includes(run.status));

  // Progressive disclosure: keep the thread focused on the latest exchange and
  // fold older substantive messages behind one compact control.
  const RECENT_COUNT = 8;
  const earlierCount = Math.max(0, feed.length - RECENT_COUNT);
  const visibleFeed = showEarlier || earlierCount === 0 ? feed : feed.slice(earlierCount);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [feed.length, workingRuns.length]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [message]);

  function toggleExpanded(id: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runForMessage(agentKey: AgentKey, at: number) {
    return runs.find(run => run.agentKey === agentKey && run.completedAt && Math.abs(run.completedAt - at) < 5000) ?? null;
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  function speak(id: string, content: string) {
    if (!("speechSynthesis" in window)) {
      setVoiceError("Voice is not supported in this browser.");
      return;
    }
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
    utterance.voice =
      voices.find(voice => /samantha|ava|daniel|google uk english/i.test(voice.name)) ??
      voices.find(voice => voice.lang.startsWith("en")) ??
      null;
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    utterance.onend = () => {
      speechRef.current = null;
      setSpeakingId(null);
    };
    utterance.onerror = () => {
      speechRef.current = null;
      setSpeakingId(null);
      setVoiceError("Voice playback failed.");
    };
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="founder-body">
      {workingRuns.length ? (
        <div className="chat-running" aria-label="Running tasks">
          {workingRuns.map(run => (
            <button key={run._id} onClick={() => onOpenTask(run)}>
              {run.status === "running" ? <IconPlay size={12} /> : <IconClock size={12} />}
              <strong>{agentFor(run.agentKey).name}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div />
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {!feed.length && (
          <div className="chat-empty">
            <span className="founder-mark">
              <img src="/agents/founder_agent.png" alt="" />
            </span>
            <p className="kicker wire-kicker">Founder is in</p>
            <h2>Tell me the idea. The messy version is fine.</h2>
            <p>
              What is it, who is it for, and what do you wish existed by Friday? I'll ask a couple of sharp questions,
              then hand the work to Research, Landing and GTM.
            </p>
            <div className="mission-presets">
              {MISSIONS.map(item => {
                const Icon = MISSION_ICON[item.id] ?? IconSearch;
                return (
                  <button onClick={() => onPreset(item.text)} key={item.id}>
                    <span className="preset-icon">
                      <Icon size={18} />
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.text}</small>
                    </div>
                    <IconArrowUp size={15} style={{ transform: "rotate(45deg)" }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="thread">
          {earlierCount > 0 && (
            <button className="thread-earlier" onClick={() => setShowEarlier(value => !value)}>
              {showEarlier ? "Hide earlier messages" : `Show ${earlierCount} earlier message${earlierCount === 1 ? "" : "s"}`}
            </button>
          )}
          {visibleFeed.map(item => {
            if (item.kind === "user")
              return (
                <div className="msg user" key={item.id}>
                  <p className="bubble">{item.content}</p>
                  <time>{formatTime(item.at)}</time>
                </div>
              );
            const agent = agentFor(item.agentKey);
            const run = runForMessage(item.agentKey, item.at);
            const outputs = run ? artifacts.filter(artifact => artifact.runId === run._id) : [];
            const site = siteFor(outputs, artifacts);
            const files = outputs.filter(artifact => !isSiteKind(artifact.kind));
            const isLong = item.content.length > 420;
            const isOpen = expanded.has(item.id);
            const hasNotch = files.length || (site && outputs.some(a => isSiteKind(a.kind))) || run;
            return (
              <div className="msg" key={item.id}>
                <img src={agent.avatar} alt="" />
                <div className="msg-body">
                  <div className="msg-head">
                    <span>{agent.name}</span>
                    <button
                      className="msg-listen"
                      onClick={() => speak(item.id, item.content)}
                      aria-label={speakingId === item.id ? "Stop voice" : `Listen to ${agent.name}`}
                    >
                      {speakingId === item.id ? <IconStop size={12} /> : <IconSound size={13} />}
                      {speakingId === item.id ? "stop" : "listen"}
                    </button>
                  </div>
                  <p className={`text ${isLong && !isOpen ? "clamped" : ""}`}>{item.content}</p>
                  {isLong && (
                    <button className="read-toggle" onClick={() => toggleExpanded(item.id)}>
                      {isOpen ? "Show less" : "Read everything"}
                    </button>
                  )}
                  {hasNotch && (
                    <div className="msg-notch">
                      {site && outputs.some(a => isSiteKind(a.kind)) && (
                        <button className="notch site" onClick={() => onOpenSite(site)}>
                          <IconGlobe size={13} /> View the website
                        </button>
                      )}
                      {files.map(artifact => (
                        <button className="notch" key={artifact._id} onClick={() => onOpenArtifact(artifact)}>
                          <ArtifactIcon kind={artifact.kind} size={13} />{" "}
                          {artifact.title.length > 30 ? `${artifact.title.slice(0, 30)}…` : artifact.title}
                        </button>
                      ))}
                      {run && (
                        <button className="notch" onClick={() => onOpenTask(run)}>
                          <IconList size={13} /> How I did it
                        </button>
                      )}
                    </div>
                  )}
                  <time>{formatTime(item.at)}</time>
                </div>
              </div>
            );
          })}
          {voiceError && <p className="voice-error">{voiceError}</p>}
          {workingRuns.map(run => (
            <div className="thinking" key={`working-${run._id}`}>
              <img src={agentFor(run.agentKey).avatar} alt="" />
              <span className="thinking-dots">
                <i />
                <i />
                <i />
              </span>
              <div>
                <strong>{agentFor(run.agentKey).name}</strong>
                <small>{run.status === "running" ? THINKING[run.agentKey] : "Queued — waiting for a free desk."}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="composer-wrap">
        {readOnly && (
          <div className="quick-chips">
            <span>Featured showcase · approved run · read only</span>
          </div>
        )}
        {!readOnly && !!feed.length && (
          <div className="quick-chips">
            {MISSIONS.map(item => (
              <button key={item.id} onClick={() => onPreset(item.text)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="composer">
            <textarea
              ref={textRef}
              value={message}
              onChange={event => setMessage(event.target.value)}
              onKeyDown={keyDown}
              placeholder="Tell Founder what you want to happen…"
              rows={1}
              aria-label="Message Founder"
            />
            <button className="send" onClick={onSend} disabled={!message.trim() || sending} aria-label="Send to Founder">
              {sending ? <IconSpinner size={17} /> : <IconArrowUp size={17} />}
            </button>
          </div>
        )}
        {!readOnly && (
          <p className="composer-hint">
            <span>Enter to send</span>
            <span>·</span>
            <span>Shift + Enter for a new line</span>
            <em>Founder assigns the team</em>
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- Team room ---------------- */

function TeamRoom({ runs, reviews, events, onOpenTask }: { runs: Run[]; reviews: ReviewFinding[]; events: any[]; onOpenTask: (run: Run) => void }) {
  const active = runs.filter(run => ["pending", "running"].includes(run.status));

  // Summarize per agent: current/latest meaningful status + how many tasks it
  // has run. Full individual runs live behind the task-trace drill-down.
  const agentSummaries = AGENTS.map(agent => {
    const own = runs.filter(run => run.agentKey === agent.key);
    if (!own.length) return null;
    const latest = own[own.length - 1];
    const done = own.filter(run => run.status === "succeeded").length;
    return { agent, latest, total: own.length, done, status: statusFor(agent.key, runs) };
  }).filter(Boolean) as Array<{ agent: (typeof AGENTS)[number]; latest: Run; total: number; done: number; status: ReturnType<typeof statusFor> }>;

  // A short recent review/decision timeline — most material, newest first.
  const recentReviews = [...reviews]
    .sort((a, b) => {
      const weight = (review: ReviewFinding) =>
        (review.status === "open" ? 2 : 0) + (review.severity === "blocking" ? 2 : review.severity === "material" ? 1 : 0);
      return weight(b) - weight(a) || b.createdAt - a.createdAt;
    })
    .slice(0, 4);

  return (
    <div className="room">
      <div>
        <p className="kicker">Team room</p>
        <h2 style={{ fontSize: 20, marginTop: 4 }}>Where the team stands.</h2>
      </div>

      {active.length ? (
        <div className="room-live">
          {active.map(run => (
            <button key={run._id} onClick={() => onOpenTask(run)}>
              <img src={agentFor(run.agentKey).avatar} alt="" />
              <div>
                <strong>
                  {agentFor(run.agentKey).name} · {run.taskType ?? "task"}
                </strong>
                <small>{THINKING[run.agentKey]}</small>
              </div>
              <IconSpinner size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="room-quiet">
          <IconCheckCircle size={18} />
          No agent is running right now.
        </div>
      )}

      {!!agentSummaries.length && (
        <div>
          <p className="kicker" style={{ marginBottom: 8 }}>
            Agent status
          </p>
          <div className="room-agents">
            {agentSummaries.map(({ agent, latest, total, done, status }) => (
              <button className="room-agent" key={agent.key} onClick={() => onOpenTask(latest)}>
                <img src={agent.avatar} alt="" />
                <div>
                  <strong>{agent.name}</strong>
                  <p>{taskLine(agent.key, runs)}</p>
                  <small>
                    {done}/{total} task{total === 1 ? "" : "s"} done
                  </small>
                </div>
                <span className={`chip ${status}`}>{status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!!recentReviews.length && (
        <div>
          <p className="kicker" style={{ marginBottom: 8 }}>
            Recent reviews &amp; decisions
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {recentReviews.map(review => (
              <div className={`review-item ${review.severity}`} key={review._id}>
                <img src={agentFor(review.reviewerAgent).avatar} alt="" />
                <div>
                  <strong>
                    {agentFor(review.reviewerAgent).name} · {review.severity}
                  </strong>
                  <p>{review.feedback}</p>
                  <small>{review.status === "open" ? "open" : "resolved"}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!events.length && (
        <details className="room-timeline">
          <summary>Full activity timeline ({events.length})</summary>
          <div className="event-feed">
            {[...events].reverse().slice(0, 24).map(event => (
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
        </details>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */

function Settings({
  companyName,
  companyId,
  conversationId,
  projects,
  plan,
  onOpenProject,
  onSwitch,
  onNewIdea,
  onUpgrade,
}: {
  companyName: string;
  companyId: string;
  conversationId: string | null;
  projects: Project[];
  plan?: BillingPlan;
  onOpenProject: (project: Project, conversationId?: string) => void;
  onSwitch: () => void;
  onNewIdea: () => void;
  onUpgrade: () => void;
}) {
  const current = projects.find(project => project._id === companyId);
  return (
    <div className="settings">
      <div className="settings-card">
        <span>This company</span>
        <strong>{companyName}</strong>
        <small>
          {current
            ? `${current.conversations.length} saved mission${current.conversations.length === 1 ? "" : "s"}`
            : "loading…"}{" "}
          · saved in the cloud automatically
        </small>
        <div className="settings-actions">
          <button className="btn btn-ghost btn-sm" onClick={onSwitch}>
            Switch company
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onNewIdea}>
            Start a new idea
          </button>
        </div>
      </div>

      <div className={`billing-card ${plan?.plan !== "free" ? "paid" : ""}`}>
        <div>
          <span>
            {plan?.plan === "internal" ? "Internal access" : plan?.plan === "builder" ? "Builder plan" : "Free plan"}
          </span>
          <strong>
            {plan?.plan === "internal" ? "bypass active" : plan?.plan === "builder" ? "$9 / month" : "$0 forever"}
          </strong>
        </div>
        <p>
          {plan?.plan === "internal"
            ? "Internal browser access is active. Dodo checkout is bypassed."
            : plan?.plan === "builder"
              ? "More monthly usage is unlocked on this browser."
              : "One complete project is free. Upgrade when you are ready for more usage."}
        </p>
        {plan?.plan !== "internal" && (
          <div className="usage-track">
            <i style={{ width: `${Math.min(100, ((plan?.used ?? 0) / (plan?.limit ?? 1)) * 100)}%` }} />
          </div>
        )}
        <small className="mono" style={{ color: "var(--muted-2)", fontSize: 11 }}>
          {plan?.plan === "internal"
            ? `${plan.used} internal projects created`
            : `${plan?.used ?? 0} / ${plan?.limit ?? 1} projects used`}
        </small>
        {plan?.plan === "free" && (
          <button className="btn btn-primary" onClick={onUpgrade}>
            Unlock more usage
          </button>
        )}
      </div>

      {!!current?.conversations.length && (
        <div>
          <p className="kicker" style={{ marginBottom: 6 }}>
            Missions in this company
          </p>
          <div className="mini-list">
            {current.conversations.map(conversation => (
              <button
                className={conversation._id === conversationId ? "current" : ""}
                key={conversation._id}
                onClick={() => onOpenProject(current, conversation._id)}
              >
                <span>{conversation.title}</span>
                <time>{new Date(conversation.updatedAt).toLocaleDateString()}</time>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="kicker" style={{ marginBottom: 6 }}>
          How this works
        </p>
        <div className="how-row">
          <b>1</b>
          <div>
            <strong>You talk to Founder</strong>
            <small>Plain words. No setup, no jargon.</small>
          </div>
        </div>
        <div className="how-row">
          <b>2</b>
          <div>
            <strong>Founder assigns the team</strong>
            <small>Research, Landing and GTM each take a task.</small>
          </div>
        </div>
        <div className="how-row">
          <b>3</b>
          <div>
            <strong>You watch and open everything</strong>
            <small>Tasks, traces, evidence and the live page — all on the record.</small>
          </div>
        </div>
      </div>

      <div className="note-card">
        <IconCheckCircle size={17} />
        <p>
          <strong>Your work is safe.</strong> Missions live in the cloud, tied to this browser's key. Keep this browser
          signed in to keep access.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Drawer shell ---------------- */

export function FounderDrawer({
  tab,
  setTab,
  collapsed,
  setCollapsed,
  mobileOpen,
  onCloseMobile,
  chatProps,
  roomProps,
  settingsProps,
}: {
  tab: FounderTab;
  setTab: (tab: FounderTab) => void;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  chatProps: Parameters<typeof Chat>[0];
  roomProps: Parameters<typeof TeamRoom>[0];
  settingsProps: Parameters<typeof Settings>[0];
}) {
  const activeCount = roomProps.runs.filter(run => ["pending", "running"].includes(run.status)).length;

  if (collapsed) {
    return (
      <aside className="founder-drawer collapsed" aria-label="Founder">
        <div className="founder-collapsed-strip">
          <button className="avatar-btn" onClick={() => setCollapsed(false)} aria-label="Open Founder">
            <img src={agentFor("founder").avatar} alt="" />
          </button>
          <span className="vertical-label">Founder</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className={`founder-drawer ${mobileOpen ? "mobile-open" : ""}`} aria-label="Founder">
      <div className="founder-tabs">
        <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
          Founder
        </button>
        <button className={tab === "room" ? "active" : ""} onClick={() => setTab("room")}>
          Team room{activeCount ? ` (${activeCount})` : ""}
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Settings
        </button>
        <button className="founder-collapse desktop-collapse" onClick={() => setCollapsed(true)} aria-label="Collapse Founder">
          <IconArrowUp size={16} style={{ transform: "rotate(90deg)" }} />
        </button>
        <button className="founder-collapse mobile-close-tab" onClick={onCloseMobile} aria-label="Close Founder">
          <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
            ×
          </span>
        </button>
      </div>
      {tab === "chat" && <Chat {...chatProps} />}
      {tab === "room" && <TeamRoom {...roomProps} />}
      {tab === "settings" && <Settings {...settingsProps} />}
    </aside>
  );
}
