import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AgentResult } from "@founder/contracts";
import { config } from "./config.js";

const exec = promisify(execFile);

export function sanitizePreviewHtml(html: string) {
  if ((html.match(/\\n/g)?.length ?? 0) > 5 && (html.match(/\n/g)?.length ?? 0) < 5) html = html.replace(/\\r\\n|\\n|\\r/g, "\n").replace(/\\t/g, "  ");
  if (html.length < 200 || html.length > 600_000) throw new Error("Landing preview HTML must be between 200 bytes and 600 KB");
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new Error("Landing preview must be a complete HTML document");
  let safe = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (block, body) => /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|document\.cookie/i.test(body) ? "" : block);
  safe = safe.replace(/(<form\b[^>]*?)\saction\s*=\s*(["'])https?:\/\/.*?\2/gi, '$1 action="#"');
  if (/preventDefault\s*\([\s\S]{0,1200}(thanks|success|on the list|submitted)/i.test(safe) && !/\bfetch\s*\(|XMLHttpRequest/i.test(safe)) {
    throw new Error("Landing page simulates a successful form submission without a real endpoint");
  }
  const ids = new Set([...safe.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]));
  const missingAnchor = [...safe.matchAll(/\bhref\s*=\s*["']#([^"']+)["']/gi)].map(match => match[1]).find(id => id && !ids.has(id));
  if (missingAnchor) throw new Error(`Landing page links to missing section #${missingAnchor}`);
  return safe;
}

export function injectValidationRuntime(html: string, campaignKey: string) {
  const endpoint = `${config.CONVEX_SITE_URL}/validation`;
  const script = `<script data-founder-validation-runtime>
(() => {
  const campaignKey = ${JSON.stringify(campaignKey)};
  const endpoint = ${JSON.stringify(endpoint)};
  const params = new URLSearchParams(location.search);
  let visitorKey = localStorage.getItem('founder.validationVisitor');
  if (!visitorKey) { visitorKey = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); localStorage.setItem('founder.validationVisitor', visitorKey); }
  const context = () => ({ campaignKey, visitorKey, utmSource: params.get('utm_source') || undefined, utmMedium: params.get('utm_medium') || undefined, utmCampaign: params.get('utm_campaign') || undefined, utmContent: params.get('utm_content') || undefined, referrer: document.referrer || undefined });
  const sendEvent = (type, extra = {}) => fetch(endpoint + '/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...context(), type, ...extra }), keepalive: true }).catch(() => {});
  sendEvent('view');
  document.querySelectorAll('[data-founder-cta], a[href="#waitlist"]').forEach(node => node.addEventListener('click', () => sendEvent('cta_click')));
  const form = document.querySelector('form[data-founder-waitlist]');
  if (!form) return;
  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; sendEvent('form_start'); } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('[data-founder-waitlist-status]') || document.querySelector('[data-founder-waitlist-status]');
    const data = new FormData(form);
    const email = String(data.get('email') || '');
    if (!/^\\S+@\\S+\\.\\S+$/.test(email)) { if (status) status.textContent = 'enter a valid email'; return; }
    const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    if (status) status.textContent = 'joining…';
    try {
      const response = await fetch(endpoint + '/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...context(), email, answer: String(data.get('answer') || ''), website: String(data.get('website') || '') }) });
      const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error || 'failed');
      if (status) status.textContent = body.duplicate ? 'you are already on the list.' : 'you are on the list — we will keep you posted.';
      form.reset();
    } catch { if (status) status.textContent = 'could not join right now. please try again.'; }
    finally { if (button) button.disabled = false; }
  });
})();
</script>`;
  return html.replace(/<\/body>/i, `${script}</body>`);
}

export async function deployLandingPreview(result: AgentResult, campaignKey?: string): Promise<AgentResult> {
  const htmlArtifact = result.artifacts.find(artifact => artifact.kind === "landing_page_html");
  if (!htmlArtifact) return result;
  const sanitized = sanitizePreviewHtml(htmlArtifact.content);
  if (!campaignKey) throw new Error("Landing page deployment requires a validation campaign");
  const safeHtml = injectValidationRuntime(sanitized, campaignKey);
  const normalizedArtifacts = result.artifacts.map(artifact => artifact === htmlArtifact ? { ...artifact, content: safeHtml } : artifact);
  const directory = await mkdtemp(join(tmpdir(), "founder-preview-"));
  try {
    const siteDirectory = join(directory, "site");
    await mkdir(siteDirectory);
    await writeFile(join(siteDirectory, "index.html"), safeHtml, { encoding: "utf8", mode: 0o600 });
    const name = `founder-page-${campaignKey.slice(0, 16).toLowerCase()}`;
    const date = new Date().toISOString().slice(0, 10);
    const wrangler = fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url));
    const { stdout, stderr } = await exec(process.execPath, [wrangler, "deploy", "--assets", siteDirectory, "--name", name, "--compatibility-date", date], {
      timeout: 180_000,
      maxBuffer: 2_000_000,
      // Keep the worker's authenticated Wrangler home so stable named deploys can
      // use the Cloudflare OAuth session (or CLOUDFLARE_API_TOKEN when supplied).
      env: { ...process.env, XDG_CACHE_HOME: join(directory, "cache") },
    });
    const output = `${stdout}\n${stderr}`;
    const url = output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i)?.[0];
    if (!url) throw new Error("Cloudflare deploy succeeded without a preview URL");
    return {
      ...result,
      response: `${result.response}\n\nLive preview: ${url}`,
      artifacts: [...normalizedArtifacts, { kind: "landing_page_preview", title: `${htmlArtifact.title} — live validation page`, content: "Stable Cloudflare validation page with real Convex waitlist capture and attributed analytics.", data: { campaignKey, waitlistEndpoint: `${config.CONVEX_SITE_URL}/validation/waitlist` }, sourceUrls: [url] }],
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
