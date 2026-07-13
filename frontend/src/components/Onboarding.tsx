import { FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { AGENTS, BillingPlan, Project } from "../lib/core";
import { Brand } from "./primitives";
import { IconArrowRight, IconCheck, IconSpinner, IconWarning } from "../lib/icons";

const api = anyApi as any;

export function Onboarding({
  ownerKey,
  projects,
  showcases,
  plan,
  onReady,
  onOpen,
  onUpgrade,
}: {
  ownerKey: string;
  projects: Project[];
  showcases: Project[];
  plan?: BillingPlan;
  onReady: (companyId: string, companyName: string) => void;
  onOpen: (project: Project, conversationId?: string) => void;
  onUpgrade: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bootstrap = useMutation(api.conversations.bootstrap);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (plan && !plan.canCreate) {
      onUpgrade();
      return;
    }
    setBusy(true);
    try {
      const id = await bootstrap({ name: name.trim(), ownerKey });
      onReady(id, name.trim());
    } catch {
      setError("Could not start this company. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboard">
      <header className="onboard-top">
        <Brand />
        <nav>
          <span>How it works</span>
          <span>Example projects</span>
          <strong>{plan?.plan === "free" ? "First validation free" : `${plan?.plan ?? "private"} access`}</strong>
        </nav>
      </header>

      <section className="onboard-body">
        <div className="onboard-copy">
          <span className="onboard-badge">
            <i /> Research before you build
          </span>
          <h1>Find out if your idea deserves to exist.</h1>
          <p className="lede">
            Founder turns a rough idea into cited market research, a reviewed validation campaign, a real waitlist
            page, and measurable demand signals — before you spend weeks building.
          </p>
          <div className="onboard-steps">
            <article>
              <b>01</b>
              <div>
                <strong>Pressure-test the idea</strong>
                <small>Market size, competitors, audience evidence, positioning and risky assumptions.</small>
              </div>
            </article>
            <article>
              <b>02</b>
              <div>
                <strong>Launch the smallest useful test</strong>
                <small>A reviewed campaign and landing page with real waitlist capture.</small>
              </div>
            </article>
            <article>
              <b>03</b>
              <div>
                <strong>Decide from behavior</strong>
                <small>See which channels create visits, clicks and qualified signups.</small>
              </div>
            </article>
          </div>
        </div>

        <aside className="onboard-card">
          <header>
            <span>New validation</span>
            <small>~5 min to first research</small>
          </header>
          {plan?.canCreate === false ? (
            <div className="onboard-paywall">
              <span>Free project used</span>
              <strong>Start another validation</strong>
              <p>Builder unlocks more monthly projects for $9. Your existing work stays available.</p>
              <button className="btn btn-primary" onClick={onUpgrade}>
                Upgrade with Dodo <IconArrowRight />
              </button>
            </div>
          ) : (
            <form className="setup-form" onSubmit={submit}>
              <label>
                Project or idea name
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  placeholder="e.g. invoicing for freelance designers"
                  required
                  autoFocus
                />
              </label>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <IconSpinner /> : <IconArrowRight />} Start with Founder
              </button>
              <small>
                {plan?.plan === "internal"
                  ? "Internal access active"
                  : plan?.plan === "builder"
                    ? "Builder usage active"
                    : "No card required for your first project"}
              </small>
              {error && (
                <p className="setup-error">
                  <IconWarning /> {error}
                </p>
              )}
            </form>
          )}
          <footer>
            <div>
              {AGENTS.map(agent => (
                <img src={agent.avatar} alt="" key={agent.key} />
              ))}
            </div>
            <span>Founder coordinates research, GTM and landing review.</span>
          </footer>
        </aside>
      </section>

      {(!!projects.length || !!showcases.length) && (
        <section className="onboard-projects">
          <header>
            <div>
              <p className="kicker">Your workspace</p>
              <h2>Continue where you left off</h2>
            </div>
            <small>Everything is saved automatically</small>
          </header>
          <div>
            {projects.slice(0, 6).map(project => (
              <button type="button" key={project._id} onClick={() => onOpen(project)}>
                <span className="project-initial">{project.name.slice(0, 1)}</span>
                <div>
                  <strong>{project.name}</strong>
                  <small>
                    {project.conversations.length} validation{project.conversations.length === 1 ? "" : "s"}
                  </small>
                </div>
                <IconArrowRight size={15} />
              </button>
            ))}
            {showcases.map(project => (
              <button type="button" key={project._id} onClick={() => onOpen(project)}>
                <span className="project-initial showcase">
                  <IconCheck size={16} />
                </span>
                <div>
                  <strong>{project.name}</strong>
                  <small>{project.description}</small>
                </div>
                <IconArrowRight size={15} />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
