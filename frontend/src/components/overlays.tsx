import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  Artifact,
  BillingPlan,
  Project,
  Run,
  RunCommand,
  SiteView,
  agentFor,
  formatCost,
  formatDuration,
  formatTime,
  formatTokens,
  hostOf,
  runLabel,
  runMarkdown,
  runStateWord,
  saveTextFile,
  THINKING,
} from "../lib/core";
import { cleanMarkdown, parseReport, ReportSection, sectionSlug } from "../lib/report";
import { ArtifactIcon, RichInline, SectionIcon, StatusChip } from "./primitives";
import {
  IconArrowRight,
  IconCheck,
  IconClock,
  IconCollapse,
  IconDownload,
  IconExpand,
  IconGlobe,
  IconLink,
  SourceFavicon,
} from "../lib/icons";

const api = anyApi as any;

/* ---------- report section body ---------- */

function ReportSectionBody({ lines }: { lines: string[] }) {
  const tableLines = lines.filter(line => line.includes("|") && line.split("|").filter(Boolean).length > 1);
  const tableRows = tableLines
    .map(line => line.split("|").map(cell => cleanMarkdown(cell)).filter(Boolean))
    .filter(row => !row.every(cell => /^:?-+:?$/.test(cell)));
  const prose = lines.filter(line => !tableLines.includes(line));
  return (
    <>
      {tableRows.length > 1 && (
        <div className="report-table">
          <table>
            <thead>
              <tr>
                {tableRows[0].map((cell, index) => (
                  <th key={index}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, index) => (
                    <td key={index}>
                      <RichInline>{cell}</RichInline>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="report-prose">
        {prose.map((line, index) => {
          const bullet = /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
          return (
            <p className={bullet ? "bullet" : ""} key={index}>
              <RichInline>{cleanMarkdown(line)}</RichInline>
            </p>
          );
        })}
      </div>
    </>
  );
}

function StructuredReport({ artifact, sections }: { artifact: Artifact; sections: ReportSection[] }) {
  return (
    <div className="report-doc">
      {sections.map((section, index) => (
        <section className="report-section" id={sectionSlug(section.title, index)} key={index}>
          <header>
            <span className="sec-icon">
              <SectionIcon title={section.title} size={17} />
            </span>
            <div>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <h4>{section.title}</h4>
            </div>
          </header>
          <ReportSectionBody lines={section.lines} />
        </section>
      ))}
      {!!artifact.sourceUrls.length && (
        <section className="report-section" id="report-sources">
          <header>
            <span className="sec-icon">
              <IconLink size={17} />
            </span>
            <div>
              <small>{String(sections.length + 1).padStart(2, "0")}</small>
              <h4>Sources</h4>
            </div>
          </header>
          <div className="source-cards">
            {artifact.sourceUrls.map(url => (
              <a href={url} target="_blank" rel="noreferrer" className="source-card" key={url}>
                <SourceFavicon url={url} size={20} />
                <div>
                  <strong>{hostOf(url)}</strong>
                  <small className="mono">{url.length > 40 ? `${url.slice(0, 40)}…` : url}</small>
                </div>
                <IconArrowRight size={14} />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PlainDoc({ content }: { content: string }) {
  return (
    <div className="doc-plain">
      {content.split("\n").map((line, index) => {
        const clean = line.trim();
        if (!clean) return null;
        if (/^#{1,3}\s/.test(clean)) return <h3 key={index}>{clean.replace(/^#{1,3}\s/, "")}</h3>;
        if (/^[A-Za-z][^:]{1,40}:$/.test(clean)) return <h3 key={index}>{clean.slice(0, -1)}</h3>;
        if (/^[-*]\s/.test(clean))
          return (
            <p className="bullet" key={index}>
              <RichInline>{clean.replace(/^[-*]\s/, "")}</RichInline>
            </p>
          );
        return (
          <p key={index}>
            <RichInline>{clean}</RichInline>
          </p>
        );
      })}
    </div>
  );
}

export function ArtifactPreview({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") (fullscreen ? setFullscreen(false) : onClose());
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [fullscreen, onClose]);

  const structured = artifact.kind === "research_report" || artifact.kind === "gtm_strategy" || artifact.kind === "social_posts";
  const sections = structured ? parseReport(artifact.content) : [];

  return (
    <div
      className="backdrop center"
      role="dialog"
      aria-modal="true"
      aria-label={artifact.title}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className={`report-modal ${fullscreen ? "fullscreen" : ""}`}>
        <header className="report-head">
          <div className="report-icon">
            <ArtifactIcon kind={artifact.kind} />
          </div>
          <div className="report-title">
            <span>{artifact.kind.replaceAll("_", " ")}</span>
            <h2>{artifact.title}</h2>
          </div>
          <div className="report-head-actions">
            <button
              className="icon-btn"
              title="Download"
              aria-label="Download report"
              onClick={() =>
                saveTextFile(
                  `${artifact.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`,
                  artifact.content,
                  "text/markdown",
                )
              }
            >
              <IconDownload size={17} />
            </button>
            <button
              className="icon-btn"
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
              onClick={() => setFullscreen(value => !value)}
            >
              {fullscreen ? <IconCollapse size={17} /> : <IconExpand size={17} />}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close preview">
              <span aria-hidden>×</span>
            </button>
          </div>
        </header>

        <div className="report-layout">
          {structured && (
            <nav className="report-nav" aria-label="Report sections">
              <div className="report-meta">
                <span>
                  <IconClock size={13} /> {formatTime(artifact.createdAt)}
                </span>
                <span>
                  <IconLink size={13} /> {artifact.sourceUrls.length} sources
                </span>
                <span>
                  <IconCheck size={13} /> saved forever
                </span>
              </div>
              {sections.slice(0, 12).map((section, index) => (
                <a href={`#${sectionSlug(section.title, index)}`} key={index}>
                  <SectionIcon title={section.title} size={14} /> {section.title}
                </a>
              ))}
              {!!artifact.sourceUrls.length && (
                <a href="#report-sources">
                  <IconLink size={14} /> Sources
                </a>
              )}
            </nav>
          )}
          <div className="report-content">
            {structured ? (
              <StructuredReport artifact={artifact} sections={sections} />
            ) : (
              <PlainDoc content={artifact.content} />
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

export function SiteViewer({ site, onClose }: { site: SiteView; onClose: () => void }) {
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);
  return (
    <div
      className="backdrop center"
      role="dialog"
      aria-modal="true"
      aria-label={site.title}
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="site-viewer">
        <header>
          <span className="site-viewer-chrome">
            <i />
            <i />
            <i />
          </span>
          <div className="site-url">
            <span className="mono">{site.url ? hostOf(site.url) : "built in-house by landing"}</span>
            <h2>{site.title}</h2>
          </div>
          {site.url && (
            <a className="btn btn-ghost btn-sm" href={site.url} target="_blank" rel="noreferrer">
              <IconGlobe size={15} /> Open live
            </a>
          )}
          <button className="modal-close" onClick={onClose} aria-label="Close website">
            <span aria-hidden>×</span>
          </button>
        </header>
        <div>
          {site.html ? (
            <iframe srcDoc={site.html} title={site.title} sandbox="allow-scripts" />
          ) : (
            <iframe src={site.url} title={site.title} sandbox="allow-scripts allow-same-origin" />
          )}
        </div>
        <footer>If the page looks blank here, it doesn't allow embedding — use "Open live" to see it in a new tab.</footer>
      </article>
    </div>
  );
}

export function TaskDrawer({
  run,
  artifacts,
  onClose,
  onOpenArtifact,
}: {
  run: Run;
  artifacts: Artifact[];
  onClose: () => void;
  onOpenArtifact: (artifact: Artifact) => void;
}) {
  const detail = useQuery(api.conversations.getRunTrace, { runId: run._id as never }) as
    | { trace?: Run["trace"]; command?: RunCommand; artifacts?: Artifact[] }
    | null
    | undefined;
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);
  const trace = detail?.trace ?? run.trace;
  const command = detail?.command ?? run.command;
  const fullRun = { ...run, trace, command };
  const agent = agentFor(run.agentKey);
  const state = runStateWord(run);
  const outputs = detail?.artifacts ?? artifacts.filter(artifact => artifact.runId === run._id);

  return (
    <div
      className="backdrop right"
      role="dialog"
      aria-modal="true"
      aria-label="Task detail"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="side-drawer">
        <header className="drawer-head">
          <img src={agent.avatar} alt="" />
          <div className="drawer-title">
            <p className="kicker">Task trace</p>
            <h2>
              {agent.name} · {runLabel(run)}
            </h2>
          </div>
          <StatusChip status={state} />
          <button className="modal-close" onClick={onClose} aria-label="Close task">
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="drawer-content">
          <div className="drawer-export">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                saveTextFile(
                  `founder-trace-${run._id}.json`,
                  JSON.stringify({ run: fullRun, artifacts: outputs }, null, 2),
                  "application/json",
                )
              }
            >
              <IconDownload size={14} /> JSON
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                saveTextFile(`founder-trace-${run._id}.md`, runMarkdown(fullRun, artifacts), "text/markdown")
              }
            >
              <IconDownload size={14} /> Markdown
            </button>
          </div>

          <p className={`drawer-quote ${state === "error" ? "error" : ""}`}>
            {run.summary
              ? `“${run.summary}”`
              : run.status === "failed"
                ? `“I hit a problem: ${run.error ?? "something went wrong on my side"}. Founder can send me back in.”`
                : run.status === "running"
                  ? `“${THINKING[run.agentKey]}”`
                  : "“I'm queued up — I'll start the moment a desk frees up in the cloud.”"}
          </p>

          <div className="kv-grid">
            <div>
              <span>Started</span>
              <strong>{formatTime(run.startedAt)}</strong>
            </div>
            <div>
              <span>Finished</span>
              <strong>{run.completedAt ? formatTime(run.completedAt) : "—"}</strong>
            </div>
            <div>
              <span>Took</span>
              <strong>{formatDuration(run.latencyMs)}</strong>
            </div>
            <div>
              <span>Assigned by</span>
              <strong>{run.parentRunId ? "founder" : "you"}</strong>
            </div>
          </div>

          <div className="kv-grid four">
            <div>
              <span>Model</span>
              <strong>{trace?.model ?? "—"}</strong>
            </div>
            <div>
              <span>Provider</span>
              <strong>{trace?.provider ?? "—"}</strong>
            </div>
            <div>
              <span>Input</span>
              <strong>{formatTokens(trace?.inputTokens)}</strong>
            </div>
            <div>
              <span>Output</span>
              <strong>{formatTokens(trace?.outputTokens)}</strong>
            </div>
            <div>
              <span>Cache read</span>
              <strong>{formatTokens(trace?.cacheReadTokens)}</strong>
            </div>
            <div>
              <span>Reasoning</span>
              <strong>{formatTokens(trace?.reasoningTokens)}</strong>
            </div>
            <div>
              <span>API / tool</span>
              <strong>{trace ? `${trace.apiCallCount} / ${trace.toolCallCount}` : "—"}</strong>
            </div>
            <div>
              <span>Cost</span>
              <strong>{formatCost(fullRun)}</strong>
            </div>
          </div>

          <details className="disclosure" open>
            <summary>Message sent to agent</summary>
            <pre>{command?.message ?? (detail === undefined ? "Loading exact command…" : "Unavailable for this historical run.")}</pre>
          </details>
          <details className="disclosure">
            <summary>Conversation context ({command?.context.length ?? 0} messages)</summary>
            <div className="ctx">
              {command?.context.map((item, index) => (
                <p key={index}>
                  <b>{item.role}</b>
                  {item.content}
                </p>
              )) ?? <p>{detail === undefined ? "Loading…" : "Unavailable."}</p>}
            </div>
          </details>
          <details className="disclosure">
            <summary>
              Exact prompt · {trace?.attemptCount ?? 0} attempt{trace?.attemptCount === 1 ? "" : "s"}
            </summary>
            <pre>{trace?.prompt || (detail === undefined ? "Loading exact prompt…" : "Unavailable for this historical run.")}</pre>
          </details>
          <details className="disclosure" open>
            <summary>Reply returned by agent</summary>
            <pre>{trace?.response || run.summary || run.error || (detail === undefined ? "Loading exact reply…" : "No reply recorded.")}</pre>
          </details>
          {!!trace?.sessionIds.length && (
            <div className="kv-grid">
              <div style={{ gridColumn: "1 / -1" }}>
                <span>Sessions</span>
                <strong style={{ wordBreak: "break-all" }}>{trace.sessionIds.join(" · ")}</strong>
              </div>
            </div>
          )}

          <div>
            <p className="kicker" style={{ marginBottom: 8 }}>
              Made on this task ({outputs.length})
            </p>
            {!outputs.length && (
              <p className="drawer-empty">
                Nothing produced on this task {run.status === "succeeded" ? "— it was a thinking / handoff step." : "yet."}
              </p>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {outputs.map(artifact => (
                <button
                  className="drawer-output"
                  key={artifact._id}
                  onClick={() =>
                    artifact.kind === "landing_page_preview" && artifact.sourceUrls[0]
                      ? window.open(artifact.sourceUrls[0], "_blank", "noopener,noreferrer")
                      : onOpenArtifact(artifact)
                  }
                >
                  <span>
                    <ArtifactIcon kind={artifact.kind} size={16} />
                  </span>
                  <div>
                    <strong>{artifact.title}</strong>
                    <small>
                      {artifact.kind === "landing_page_preview"
                        ? "● live page — click to open"
                        : artifact.kind.replaceAll("_", " ")}{" "}
                      · {artifact.sourceUrls.length} sources
                    </small>
                  </div>
                  <IconArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ProjectSwitcher({
  projects,
  showcases,
  currentId,
  plan,
  onClose,
  onOpen,
  onNewProject,
  onNewMission,
}: {
  projects: Project[];
  showcases: Project[];
  currentId: string | null;
  plan?: BillingPlan;
  onClose: () => void;
  onOpen: (project: Project, conversationId?: string) => void;
  onNewProject: () => void;
  onNewMission: (project: Project) => void;
}) {
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);
  return (
    <div
      className="backdrop right"
      role="dialog"
      aria-modal="true"
      aria-label="Companies"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="side-drawer project-drawer">
        <header className="drawer-head">
          <div className="drawer-title">
            <p className="kicker">Workspaces</p>
            <h2>Your companies</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close companies">
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="drawer-content">
          <button className={`create-project ${plan?.canCreate === false ? "locked" : ""}`} onClick={onNewProject}>
            <span>+</span>
            <div>
              <strong>{plan?.canCreate === false ? "Unlock more usage" : "Start a new idea"}</strong>
              <small>
                {plan?.canCreate === false
                  ? "$9/month unlocks more usage"
                  : plan?.plan === "free"
                    ? "Your first project is free"
                    : "Builder usage is active"}
              </small>
            </div>
            <IconArrowRight size={16} />
          </button>

          {showcases.map(project => (
            <div className="project-item" key={project._id}>
              <button className="project-main" onClick={() => onOpen(project)}>
                <div>
                  <span>Featured showcase</span>
                  <strong>{project.name}</strong>
                  <small>{project.description}</small>
                </div>
                <IconCheck size={16} />
              </button>
            </div>
          ))}

          {projects.map(project => (
            <div className={`project-item ${project._id === currentId ? "active" : ""}`} key={project._id}>
              <button className="project-main" onClick={() => onOpen(project)}>
                <div>
                  <span>{project._id === currentId ? "Active company" : "Company"}</span>
                  <strong>{project.name}</strong>
                  <small>
                    {project.conversations.length} saved mission{project.conversations.length === 1 ? "" : "s"}
                  </small>
                </div>
                <IconArrowRight size={15} />
              </button>
              <div className="project-missions">
                {project.conversations.map(conversation => (
                  <button key={conversation._id} onClick={() => onOpen(project, conversation._id)}>
                    <i />
                    <div>
                      <strong>{conversation.title}</strong>
                      <small>
                        {new Date(conversation.updatedAt).toLocaleDateString()} · {conversation.status}
                      </small>
                    </div>
                  </button>
                ))}
                <button className="new-mission" onClick={() => onNewMission(project)}>
                  + new mission
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BillingModal({
  plan,
  busy,
  error,
  onClose,
  onCheckout,
  onBypass,
}: {
  plan?: BillingPlan;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCheckout: () => void;
  onBypass: () => void;
}) {
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keyDown);
    return () => window.removeEventListener("keydown", keyDown);
  }, [onClose]);
  const paid = plan?.plan === "builder" || plan?.plan === "internal";
  return (
    <div
      className="backdrop center"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Builder"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="billing-modal">
        <button className="modal-close" onClick={onClose} aria-label="Close billing">
          <span aria-hidden>×</span>
        </button>
        <p className="kicker wire-kicker">Builder plan</p>
        <h2>Build more than one thing.</h2>
        <p className="billing-lede">
          Your first project is free and stays free. Builder unlocks more usage for everything you want to create.
        </p>
        <div className="billing-price">
          <strong>$9</strong>
          <span>
            usd
            <br />
            per month
          </span>
        </div>
        <div className="billing-features">
          <p>
            <IconCheck size={16} /> More monthly usage
          </p>
          <p>
            <IconCheck size={16} /> All four specialist agents
          </p>
          <p>
            <IconCheck size={16} /> Research, pages and launch plans saved
          </p>
          <p>
            <IconCheck size={16} /> Secure checkout powered by Dodo
          </p>
        </div>
        {error && (
          <div className="billing-error">
            <span aria-hidden>!</span> {error}
          </div>
        )}
        {paid ? (
          <button className="btn btn-primary billing-cta" onClick={onClose}>
            <IconCheck /> {plan?.plan === "internal" ? "Internal access is active" : "Builder is active"}
          </button>
        ) : (
          <button className="btn btn-primary billing-cta" onClick={onCheckout} disabled={busy}>
            <IconArrowRight /> Continue to secure checkout
          </button>
        )}
        <button className="billing-bypass" onClick={onBypass} disabled={busy}>
          Continue without payment <span>(test mode)</span>
        </button>
        <small className="billing-test-note">test mode — no dodo checkout or charge</small>
        <small>Cancel anytime in Dodo. Usage refreshes monthly.</small>
      </section>
    </div>
  );
}
