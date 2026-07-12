import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { config } from "./config.js";

export type TemplateCandidate = {
  name: string;
  score: number;
  promptPath: string;
  prompt: string;
};

/**
 * Select one deterministic, approved template and load its complete prompt.
 * The model may adapt the prompt's visual language, but it must not invent a
 * design direction outside the catalogue.
 */
export async function selectTemplate(query: string): Promise<{ selected: TemplateCandidate; alternatives: Array<{ name: string; score: number }> }> {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const entries = await readdir(config.TEMPLATE_LIBRARY_PATH, { recursive: true, withFileTypes: true });
  const candidates: TemplateCandidate[] = [];
  for (const entry of entries.filter(item => item.isFile() && item.name === "metadata.json")) {
    const metadataPath = join(entry.parentPath ?? entry.path, entry.name);
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      const name = metadata.name ?? basename(dirname(metadataPath));
      const haystack = [name, metadata.category, ...(metadata.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 3 : 0) + (name.includes(token) ? 2 : 0), 0);
      const promptPath = metadata.promptFile ? join(config.TEMPLATE_LIBRARY_PATH, metadata.promptFile) : join(dirname(metadataPath), "prompt.md");
      candidates.push({ score, name, promptPath, prompt: await readFile(promptPath, "utf8") });
    } catch { /* ignore malformed or unreadable template entries */ }
  }
  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const selected = candidates[0];
  if (!selected) throw new Error(`No valid catalogue templates found under ${config.TEMPLATE_LIBRARY_PATH}`);
  return {
    selected,
    alternatives: candidates.slice(1, 3).map(({ name, score }) => ({ name, score })),
  };
}
