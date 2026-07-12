import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { config } from "./config.js";

export async function selectTemplates(query: string, limit = 3) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const entries = await readdir(config.TEMPLATE_LIBRARY_PATH, { recursive: true, withFileTypes: true });
  const candidates: Array<{ score: number; name: string; promptPath: string }> = [];
  for (const entry of entries.filter(item => item.isFile() && item.name === "metadata.json")) {
    const metadataPath = join(entry.parentPath ?? entry.path, entry.name);
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      const name = metadata.name ?? basename(dirname(metadataPath));
      const haystack = [name, metadata.category, ...(metadata.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 3 : 0) + (name.includes(token) ? 2 : 0), 0);
      candidates.push({ score, name, promptPath: metadata.promptFile ? join(config.TEMPLATE_LIBRARY_PATH, metadata.promptFile) : join(dirname(metadataPath), "prompt.md") });
    } catch { /* ignore malformed template metadata */ }
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return Promise.all(candidates.slice(0, limit).map(async candidate => ({ name: candidate.name, score: candidate.score, promptExcerpt: (await readFile(candidate.promptPath, "utf8")).slice(0, 1200) })));
}
