import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { AgentResult } from "@founder/contracts";

const exec = promisify(execFile);

function sanitizePreviewHtml(html: string) {
  if (html.length < 200 || html.length > 600_000) throw new Error("Landing preview HTML must be between 200 bytes and 600 KB");
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new Error("Landing preview must be a complete HTML document");
  let safe = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi, "");
  safe = safe.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (block, body) => /\bfetch\s*\(|XMLHttpRequest|WebSocket\s*\(|document\.cookie/i.test(body) ? "" : block);
  safe = safe.replace(/(<form\b[^>]*?)\saction\s*=\s*(["'])https?:\/\/.*?\2/gi, '$1 action="#"');
  return safe;
}

export async function deployLandingPreview(result: AgentResult): Promise<AgentResult> {
  const htmlArtifact = result.artifacts.find(artifact => artifact.kind === "landing_page_html");
  if (!htmlArtifact) return result;
  const safeHtml = sanitizePreviewHtml(htmlArtifact.content);
  const directory = await mkdtemp(join(tmpdir(), "founder-preview-"));
  try {
    const siteDirectory = join(directory, "site");
    const isolatedHome = join(directory, "home");
    await Promise.all([mkdir(siteDirectory), mkdir(isolatedHome)]);
    await writeFile(join(siteDirectory, "index.html"), safeHtml, { encoding: "utf8", mode: 0o600 });
    const name = `founder-page-${Date.now().toString(36)}`;
    const date = new Date().toISOString().slice(0, 10);
    const wrangler = fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url));
    const { stdout, stderr } = await exec(process.execPath, [wrangler, "deploy", "--temporary", "--assets", siteDirectory, "--name", name, "--compatibility-date", date], {
      timeout: 180_000,
      maxBuffer: 2_000_000,
      env: { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: join(directory, "config"), XDG_CACHE_HOME: join(directory, "cache") },
    });
    const output = `${stdout}\n${stderr}`;
    const url = output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i)?.[0];
    if (!url) throw new Error("Cloudflare deploy succeeded without a preview URL");
    return {
      ...result,
      response: `${result.response}\n\nLive preview: ${url}`,
      artifacts: [...result.artifacts, { kind: "landing_page_preview", title: `${htmlArtifact.title} — live preview`, content: "Temporary Cloudflare preview generated from the validated landing-page HTML artifact.", sourceUrls: [url] }],
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
