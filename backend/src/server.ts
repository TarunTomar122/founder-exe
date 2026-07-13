import Fastify from "fastify";
import { WorkerCommandSchema } from "@founder/contracts";
import { config } from "./config.js";
import { runHermes } from "./hermes.js";
import { deployLandingPreview } from "./cloudflare.js";

const app = Fastify({ logger: true });
let leasing = false;
let inFlight = 0;

app.get("/health", async () => ({ ok: true, service: "founder-hermes-worker" }));

async function execute(command: ReturnType<typeof WorkerCommandSchema.parse>) {
  try {
    let execution: Awaited<ReturnType<typeof runHermes>> | undefined;
    for (let attempt = 0; attempt < 2 && !execution; attempt += 1) {
      try {
        execution = await runHermes(command.agent, command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const transient = /timeout|aborted|ECONNRESET|fetch failed|socket hang up/i.test(message);
        if (!transient || attempt === 1) throw error;
        app.log.warn({ commandId: command.commandId, agent: command.agent }, "transient agent failure; retrying once");
      }
    }
    if (!execution) throw new Error("Agent execution did not return a result");
    if (command.agent === "landing_page" && command.taskType !== "peer_review") execution.result = await deployLandingPreview(execution.result, command.campaignKey);
    const callback = await fetch(`${config.CONVEX_SITE_URL}/worker/result`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": config.WORKER_SIGNING_SECRET },
      body: JSON.stringify({ commandId: command.commandId, agent: command.agent, ...execution }),
    });
    if (!callback.ok) throw new Error(`Convex callback failed: ${callback.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown Hermes failure";
    await fetch(`${config.CONVEX_SITE_URL}/worker/failure`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-worker-secret": config.WORKER_SIGNING_SECRET },
      body: JSON.stringify({ commandId: command.commandId, error: message }),
    });
    throw error;
  }
}

async function poll() {
  if (leasing) return;
  leasing = true;
  try {
    while (inFlight < config.WORKER_CONCURRENCY) {
      const response = await fetch(`${config.CONVEX_SITE_URL}/worker/lease`, { headers: { "x-worker-secret": config.WORKER_SIGNING_SECRET } });
      if (!response.ok) throw new Error(`Lease failed: ${response.status}`);
      const body = await response.json();
      if (!body.command) break;
      const command = WorkerCommandSchema.parse(body.command);
      inFlight += 1;
      void execute(command).catch(error => app.log.error(error)).finally(() => { inFlight -= 1; void poll(); });
    }
  } catch (error) {
    app.log.error(error);
  } finally {
    leasing = false;
  }
}

app.listen({ host: "127.0.0.1", port: config.PORT }).then(() => {
  setInterval(poll, config.WORKER_POLL_INTERVAL_MS);
  void poll();
}).catch((error) => { app.log.error(error); process.exit(1); });
